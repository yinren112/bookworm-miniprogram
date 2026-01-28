// src/services/study/quizService.ts
// 刷题服务 - 题目拉取、答题提交、错题本管理

import { PrismaClient, QuestionType } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";
import {
  questionSelectPublic,
  questionSelectWithAnswer,
  questionAttemptQuestionIdView,
  wrongItemWithQuestionInclude,
  wrongItemListInclude,
} from "../../db/views";
import { recordActivity } from "./streakService";
import { log } from "../../lib/logger";
import { isPrismaUniqueConstraintError } from "../../utils/typeGuards";
import { StudyServiceError, StudyErrorCodes } from "../../errors";

type DbCtx = PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

const QUIZ_DEBUG = process.env.QUIZ_DEBUG === "true";

// 错题清除需要连续正确的次数
const WRONG_ITEM_CLEAR_THRESHOLD = 3;

// 每次刷题默认题目数量
const DEFAULT_QUIZ_LIMIT = 10;

export interface QuizSessionOptions {
  unitId?: number;
  limit?: number;
  wrongItemsOnly?: boolean; // 只做错题
}

export interface QuizSession {
  sessionId: string;
  questions: Array<{
    id: number;
    contentId: string;
    questionType: QuestionType;
    stem: string;
    options: unknown;
    difficulty: number;
  }>;
  totalCount: number;
}

export interface SubmitAnswerResult {
  questionId: number;
  isCorrect: boolean;
  correctAnswer: string;
  correctOptionIndices?: number[];
  explanation: string | null;
  wrongCount: number; // 累计错误次数
}

/**
 * 开始刷题 session
 * 从指定课程/章节拉取题目
 */
export async function startQuizSession(
  db: DbCtx,
  userId: number,
  courseId: number,
  options: QuizSessionOptions = {},
): Promise<QuizSession> {
  const { unitId, limit = DEFAULT_QUIZ_LIMIT, wrongItemsOnly = false } = options;
  const sessionId = uuidv4();

  let questions;

  if (wrongItemsOnly) {
    // 错题模式：只从错题本拉取
    const wrongItems = await db.userWrongItem.findMany({
      where: {
        userId,
        clearedAt: null,
        question: {
          courseId,
          ...(unitId ? { unitId } : {}),
        },
      },
      include: wrongItemWithQuestionInclude,
      orderBy: { lastWrongAt: "desc" },
      take: limit,
    });

    questions = wrongItems.map((wi) => wi.question);
  } else {
    // 正常模式：优先未答过的题目，不足时补充已答过的
    const baseWhere = {
      courseId,
      ...(unitId ? { unitId } : {}),
    };

    // 1. 优先获取未答过的题目
    // 使用 Prisma 关系过滤器，让数据库执行 NOT EXISTS 子查询
    // 比内存中的 notIn 数组更高效且可扩展
    const unansweredQuestions = await db.studyQuestion.findMany({
      where: {
        ...baseWhere,
        // 排除此用户已有答题记录的题目
        attempts: {
          none: { userId },
        },
      },
      select: questionSelectPublic,
      take: limit,
    });

    // 2. 如果未答过的题目不足，补充已答过的（优先最久未答的）
    const remainingSlots = limit - unansweredQuestions.length;
    let backfillQuestions: typeof unansweredQuestions = [];

    if (remainingSlots > 0) {
      // 使用 DISTINCT ON + ORDER BY 选择每道题最早的答题记录
      const oldestAttempts = await db.userQuestionAttempt.findMany({
        where: {
          userId,
          question: baseWhere,
        },
        orderBy: { attemptedAt: "asc" },
        distinct: ["questionId"],
        take: remainingSlots,
        select: questionAttemptQuestionIdView,
      });
      const backfillIds = oldestAttempts.map((a) => a.questionId);

      if (backfillIds.length > 0) {
        backfillQuestions = await db.studyQuestion.findMany({
          where: { id: { in: backfillIds } },
          select: questionSelectPublic,
        });
      }
    }

    // 3. 合并并打乱顺序
    questions = shuffleArray([...unansweredQuestions, ...backfillQuestions]);
  }

  return {
    sessionId,
    questions: questions.map((q) => ({
      id: q.id,
      contentId: q.contentId,
      questionType: q.questionType,
      stem: q.stem,
      options:
        q.optionsJson ??
        (q.questionType === "TRUE_FALSE" ? ["TRUE", "FALSE"] : null),
      difficulty: q.difficulty,
    })),
    totalCount: questions.length,
  };
}

/**
 * 提交答题结果
 *
 * 幂等性保证：同一 session + user + question 只会创建一条记录
 * 重复提交会返回已有结果，不会重复计入错题本或周积分
 */
export async function submitQuizAnswer(
  db: DbCtx,
  userId: number,
  questionId: number,
  sessionId: string,
  chosenAnswer: string,
  durationMs?: number,
): Promise<SubmitAnswerResult> {
  // 获取题目详情
  const question = await db.studyQuestion.findUnique({
    where: { id: questionId },
    select: questionSelectWithAnswer,
  });

  if (!question) {
    throw new StudyServiceError(StudyErrorCodes.QUESTION_NOT_FOUND, "Question not found");
  }

  const correctOptionIndices = extractCorrectOptionIndices(
    question.questionType,
    question.optionsJson,
    question.answerJson,
  );

  // 幂等性检查：查询是否已存在提交记录
  const existingAttempt = await db.userQuestionAttempt.findUnique({
    where: { sessionId_userId_questionId: { sessionId, userId, questionId } },
  });

  if (existingAttempt) {
    return buildIdempotentResult(db, userId, questionId, question, existingAttempt.isCorrect, correctOptionIndices);
  }

  // 判断答案是否正确
  const isCorrect = checkAnswer(
    question.questionType,
    question.answerJson,
    chosenAnswer,
    question.optionsJson,
  );

  logDebugIfEnabled(questionId, question, chosenAnswer, isCorrect);

  // 创建答题记录（处理并发冲突）
  const attemptResult = await createAttemptRecord(db, userId, questionId, sessionId, chosenAnswer, isCorrect, durationMs);
  if (attemptResult.idempotent) {
    return buildIdempotentResult(db, userId, questionId, question, attemptResult.isCorrect, correctOptionIndices);
  }

  // 更新错题本
  const wrongCount = isCorrect
    ? await handleCorrectAnswer(db, userId, questionId)
    : await handleWrongAnswer(db, userId, questionId);

  // 记录学习活动
  await recordActivity(db, userId, 1);

  return {
    questionId,
    isCorrect,
    correctAnswer: question.answerJson,
    correctOptionIndices,
    explanation: question.explanationShort,
    wrongCount,
  };
}

async function buildIdempotentResult(
  db: DbCtx,
  userId: number,
  questionId: number,
  question: { answerJson: string; explanationShort: string | null },
  isCorrect: boolean,
  correctOptionIndices: number[],
): Promise<SubmitAnswerResult> {
  const wrongItem = await db.userWrongItem.findUnique({
    where: { userId_questionId: { userId, questionId } },
  });

  return {
    questionId,
    isCorrect,
    correctAnswer: question.answerJson,
    correctOptionIndices,
    explanation: question.explanationShort,
    wrongCount: wrongItem?.wrongCount ?? 0,
  };
}

function logDebugIfEnabled(
  questionId: number,
  question: { questionType: QuestionType; answerJson: string; optionsJson: unknown },
  chosenAnswer: string,
  isCorrect: boolean,
): void {
  if (QUIZ_DEBUG) {
    log.debug({
      tag: "QUIZ_DEBUG",
      questionId,
      questionType: question.questionType,
      answerJson: question.answerJson,
      optionsJson: question.optionsJson,
      chosenAnswer,
      isCorrect,
    });
  }
}

async function createAttemptRecord(
  db: DbCtx,
  userId: number,
  questionId: number,
  sessionId: string,
  chosenAnswer: string,
  isCorrect: boolean,
  durationMs?: number,
): Promise<{ idempotent: false } | { idempotent: true; isCorrect: boolean }> {
  try {
    await db.userQuestionAttempt.create({
      data: {
        userId,
        questionId,
        sessionId,
        chosenAnswerJson: chosenAnswer,
        isCorrect,
        durationMs,
      },
    });
    return { idempotent: false };
  } catch (error) {
    if (isPrismaUniqueConstraintError(error)) {
      const attempt = await db.userQuestionAttempt.findUnique({
        where: { sessionId_userId_questionId: { sessionId, userId, questionId } },
      });
      if (attempt) {
        return { idempotent: true, isCorrect: attempt.isCorrect };
      }
    }
    throw error;
  }
}

async function handleCorrectAnswer(
  db: DbCtx,
  userId: number,
  questionId: number,
): Promise<number> {
  const wrongItem = await db.userWrongItem.findUnique({
    where: { userId_questionId: { userId, questionId } },
  });

  if (!wrongItem || wrongItem.clearedAt) {
    return wrongItem?.wrongCount ?? 0;
  }

  // 检查连续正确次数
  const recentAttempts = await db.userQuestionAttempt.findMany({
    where: {
      userId,
      questionId,
      attemptedAt: { gt: wrongItem.lastWrongAt },
    },
    orderBy: { attemptedAt: "desc" },
    take: WRONG_ITEM_CLEAR_THRESHOLD,
  });

  const consecutiveCorrect = recentAttempts.filter((a) => a.isCorrect).length;

  if (consecutiveCorrect >= WRONG_ITEM_CLEAR_THRESHOLD) {
    await db.userWrongItem.update({
      where: { id: wrongItem.id },
      data: { clearedAt: new Date() },
    });
  }

  return wrongItem.wrongCount;
}

async function handleWrongAnswer(
  db: DbCtx,
  userId: number,
  questionId: number,
): Promise<number> {
  const wrongItem = await db.userWrongItem.upsert({
    where: { userId_questionId: { userId, questionId } },
    update: {
      wrongCount: { increment: 1 },
      lastWrongAt: new Date(),
      clearedAt: null,
    },
    create: {
      userId,
      questionId,
      wrongCount: 1,
      lastWrongAt: new Date(),
    },
  });

  return wrongItem.wrongCount;
}

/**
 * 获取错题列表
 */
export async function getWrongItems(
  db: DbCtx,
  userId: number,
  courseId?: number,
  options: { limit?: number; offset?: number } = {},
): Promise<{
  items: Array<{
    questionId: number;
    contentId: string;
    stem: string;
    questionType: QuestionType;
    wrongCount: number;
    lastWrongAt: Date;
  }>;
  total: number;
}> {
  const { limit = 20, offset = 0 } = options;

  const whereClause = {
    userId,
    clearedAt: null,
    ...(courseId
      ? {
          question: { courseId },
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    db.userWrongItem.findMany({
      where: whereClause,
      include: wrongItemListInclude,
      orderBy: { lastWrongAt: "desc" },
      take: limit,
      skip: offset,
    }),
    db.userWrongItem.count({ where: whereClause }),
  ]);

  return {
    items: items.map((wi) => ({
      questionId: wi.questionId,
      contentId: wi.question.contentId,
      stem: wi.question.stem,
      questionType: wi.question.questionType,
      wrongCount: wi.wrongCount,
      lastWrongAt: wi.lastWrongAt,
    })),
    total,
  };
}

/**
 * 手动清除错题（不计入连续正确）
 */
export async function clearWrongItem(
  db: DbCtx,
  userId: number,
  questionId: number,
): Promise<boolean> {
  const result = await db.userWrongItem.updateMany({
    where: {
      userId,
      questionId,
      clearedAt: null,
    },
    data: {
      clearedAt: new Date(),
    },
  });

  return result.count > 0;
}

/**
 * 获取刷题统计
 */
export async function getQuizStats(
  db: DbCtx,
  userId: number,
  courseId?: number,
): Promise<{
  totalAttempts: number;
  correctCount: number;
  wrongItemCount: number;
  accuracy: number;
}> {
  const whereClause = {
    userId,
    ...(courseId
      ? {
          question: { courseId },
        }
      : {}),
  };

  const [totalAttempts, correctCount, wrongItemCount] = await Promise.all([
    db.userQuestionAttempt.count({ where: whereClause }),
    db.userQuestionAttempt.count({ where: { ...whereClause, isCorrect: true } }),
    db.userWrongItem.count({
      where: {
        userId,
        clearedAt: null,
        ...(courseId ? { question: { courseId } } : {}),
      },
    }),
  ]);

  const accuracy = totalAttempts > 0 ? Math.round((correctCount / totalAttempts) * 100) : 0;

  return {
    totalAttempts,
    correctCount,
    wrongItemCount,
    accuracy,
  };
}

// ============================================
// 辅助函数
// ============================================

/**
 * 检查答案是否正确
 */
function checkAnswer(
  questionType: QuestionType,
  correctAnswer: string,
  chosenAnswer: string,
  optionsJson?: unknown,
): boolean {
  const normalizedCorrect = correctAnswer.trim().toLowerCase();
  const normalizedChosen = chosenAnswer.trim().toLowerCase();

  if (normalizedCorrect === normalizedChosen) return true;

  switch (questionType) {
    case "SINGLE_CHOICE":
    case "TRUE_FALSE":
      return checkChoiceByIndex(questionType, normalizedCorrect, normalizedChosen, optionsJson);

    case "MULTI_CHOICE":
      return checkMultiChoiceByIndex(normalizedCorrect, normalizedChosen, optionsJson);

    case "FILL_BLANK": {
      // 填空题：支持多个正确答案（用 | 分隔）
      const validAnswers = normalizedCorrect.split("|").map((a) => a.trim());
      return validAnswers.includes(normalizedChosen);
    }

    default:
      return normalizedCorrect === normalizedChosen;
  }
}

function checkChoiceByIndex(
  questionType: QuestionType,
  normalizedCorrect: string,
  normalizedChosen: string,
  optionsJson?: unknown,
): boolean {
  if (!Array.isArray(optionsJson) || optionsJson.length === 0) return normalizedCorrect === normalizedChosen;

  const normalizedOptions = optionsJson.map((option) => normalizeAnswerToken(String(option)));
  const correctIndices = extractCorrectOptionIndices(questionType, optionsJson, normalizedCorrect);
  if (correctIndices.length === 0) return normalizedCorrect === normalizedChosen;

  const chosenIndex = resolveUserChoiceIndex(normalizedChosen, normalizedOptions);
  if (chosenIndex < 0) return normalizedCorrect === normalizedChosen;

  return correctIndices.includes(chosenIndex);
}

function checkMultiChoiceByIndex(
  normalizedCorrect: string,
  normalizedChosen: string,
  optionsJson?: unknown,
): boolean {
  if (!Array.isArray(optionsJson) || optionsJson.length === 0) return compareAnswerSets(normalizedCorrect, normalizedChosen);

  const normalizedOptions = optionsJson.map((option) => normalizeAnswerToken(String(option)));
  const correctIndices = extractCorrectOptionIndices("MULTI_CHOICE", optionsJson, normalizedCorrect);
  if (correctIndices.length === 0) return compareAnswerSets(normalizedCorrect, normalizedChosen);

  const chosenTokens = parseAnswerTokens(normalizedChosen);
  if (chosenTokens.length === 0) return false;

  const chosenIndices: number[] = [];
  for (const token of chosenTokens) {
    const idx = resolveUserChoiceIndex(normalizeAnswerToken(token), normalizedOptions);
    if (idx < 0) return compareAnswerSets(normalizedCorrect, normalizedChosen);
    chosenIndices.push(idx);
  }

  const chosenSet = new Set(chosenIndices);
  const correctSet = new Set(correctIndices);
  if (chosenSet.size !== correctSet.size) return false;
  for (const idx of correctSet) {
    if (!chosenSet.has(idx)) return false;
  }
  return true;
}

function resolveUserChoiceIndex(normalizedToken: string, normalizedOptions: string[]): number {
  if (!normalizedToken) return -1;
  const directIdx = normalizedOptions.findIndex((option) => option === normalizedToken);
  if (directIdx >= 0) return directIdx;

  const labelIdx = resolveOptionIndexByLabel(normalizedToken, normalizedOptions);
  if (labelIdx >= 0) return labelIdx;

  if (/^\d+$/.test(normalizedToken)) {
    const idx = Number(normalizedToken);
    if (Number.isInteger(idx) && idx >= 0 && idx < normalizedOptions.length) return idx;
  }

  return -1;
}

function compareAnswerSets(correctAnswer: string, chosenAnswer: string): boolean {
  const correctList = parseAnswerList(correctAnswer);
  const chosenList = parseAnswerList(chosenAnswer);
  if (correctList.length === 0 || chosenList.length === 0) return false;

  const correctSet = new Set(correctList);
  const chosenSet = new Set(chosenList);

  if (correctSet.size !== chosenSet.size) return false;
  for (const item of correctSet) {
    if (!chosenSet.has(item)) return false;
  }
  return true;
}

function parseAnswerList(answer: string): string[] {
  const trimmed = answer.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => normalizeAnswerToken(String(item)))
          .filter((item) => item.length > 0);
      }
    } catch {
      // Fall back to pipe parsing.
    }
  }

  const normalizedSeparators = trimmed.replace(/，/g, ",");
  if (normalizedSeparators.includes("|") || normalizedSeparators.includes(",")) {
    return normalizedSeparators
      .split(/[|,]/)
      .map((item) => normalizeAnswerToken(item))
      .filter((item) => item.length > 0);
  }

  return [normalizeAnswerToken(trimmed)];
}

function normalizeAnswerToken(value: string): string {
  return value.trim().toLowerCase();
}

function extractCorrectOptionIndices(
  questionType: QuestionType,
  optionsJson: unknown,
  answerJson: string,
): number[] {
  if (!Array.isArray(optionsJson)) return [];

  const options = optionsJson.map((option) => String(option));
  if (options.length === 0) return [];

  const normalizedOptions = options.map((option) => normalizeAnswerToken(option));
  const answers = questionType === "MULTI_CHOICE"
    ? parseAnswerTokens(answerJson)
    : [String(answerJson ?? "")];

  const indices = new Set<number>();

  for (const answer of answers) {
    const normalizedAnswer = normalizeAnswerToken(String(answer));
    if (!normalizedAnswer) continue;

    let idx = normalizedOptions.findIndex((option) => option === normalizedAnswer);
    if (idx < 0) {
      idx = resolveOptionIndexByLabel(normalizedAnswer, normalizedOptions);
    }
    if (idx >= 0) indices.add(idx);
  }

  const indexList = Array.from(indices);
  if (questionType !== "MULTI_CHOICE" && indexList.length > 1) {
    return [Math.min(...indexList)];
  }

  return indexList;
}

function parseAnswerTokens(answer: string): string[] {
  const trimmed = String(answer || "").trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim()).filter(Boolean);
      }
    } catch {
      // Fall back to pipe parsing.
    }
  }

  const normalizedSeparators = trimmed.replace(/，/g, ",");
  if (normalizedSeparators.includes("|") || normalizedSeparators.includes(",")) {
    return normalizedSeparators
      .split(/[|,]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [trimmed];
}

function resolveOptionIndexByLabel(
  normalizedAnswer: string,
  normalizedOptions: string[],
): number {
  if (/^\d+$/.test(normalizedAnswer)) {
    const idx = Number(normalizedAnswer);
    if (Number.isInteger(idx) && idx >= 0 && idx < normalizedOptions.length) return idx;
  }

  if (normalizedAnswer === "true" || normalizedAnswer === "正确" || normalizedAnswer === "对") {
    return normalizedOptions.findIndex(
      (option) => option === "正确" || option === "true",
    );
  }

  if (normalizedAnswer === "false" || normalizedAnswer === "错误" || normalizedAnswer === "错") {
    return normalizedOptions.findIndex(
      (option) => option === "错误" || option === "false",
    );
  }

  const letter = normalizedAnswer.charAt(0);
  if (letter >= "a" && letter <= "f") {
    const idx = letter.charCodeAt(0) - "a".charCodeAt(0);
    if (idx < normalizedOptions.length) return idx;
  }

  return -1;
}

/**
 * Fisher-Yates 洗牌算法
 */
function shuffleArray<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

export const __testing = {
  checkAnswer,
  extractCorrectOptionIndices,
  parseAnswerTokens,
  resolveOptionIndexByLabel,
  resolveUserChoiceIndex,
};
