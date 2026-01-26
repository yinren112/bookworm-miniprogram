// src/services/study/cardScheduler.ts
// Leitner 盒子法排程算法实现
import crypto from "crypto";
import { Prisma, PrismaClient, FeedbackRating } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import {
  cardSelectPublic,
  cardCourseIdView,
  cardStateWithCardInclude,
  cardStateScheduleView,
  enrollmentSelectPublic,
} from "../../db/views";
import { recordActivity } from "./streakService";
import { getBeijingTodayStart, getBeijingDateStart } from "../../utils/timezone";

type DbCtx = PrismaClient | Prisma.TransactionClient;

async function withTransaction<T>(
  dbCtx: DbCtx,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  if ("$transaction" in dbCtx) {
    return (dbCtx as PrismaClient).$transaction(async (tx) => fn(tx));
  }
  return fn(dbCtx as Prisma.TransactionClient);
}

// ============================================
// Leitner 盒子法常量
// ============================================

// boxLevel 1-5 对应的间隔天数
export const LEITNER_INTERVALS: Record<number, number> = {
  1: 1,   // 1 天
  2: 3,   // 3 天
  3: 7,   // 7 天
  4: 14,  // 14 天
  5: 30,  // 30 天
};

// 每张卡片每天最多出现次数
export const MAX_DAILY_ATTEMPTS = 3;

// "不会"反馈后的短间隔（5小时，确保当天能再见一次）
export const FORGOT_INTERVAL_HOURS = 5;

// 考试周排程参数
export const EXAM_PREP_DAYS = 21;
export const EXAM_CRAM_DAYS = 7;

const EXAM_INTERVALS: Record<"prep" | "cram", Record<number, number>> = {
  prep: {
    1: 1,
    2: 2,
    3: 4,
    4: 7,
    5: 14,
  },
  cram: {
    1: 1,
    2: 1,
    3: 2,
    4: 3,
    5: 5,
  },
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ============================================
// 类型定义
// ============================================

export interface TodayQueueSummary {
  dueCards: number;       // 到期卡片数
  newCards: number;       // 新卡片数（从未学习过）
  reviewedToday: number;  // 今日已复习数
  estimatedMinutes: number; // 预计用时（分钟）
}

export interface CardSession {
  sessionId: string;
  cards: CardItem[];
  totalCount: number;
}

export interface CardItem {
  id: number;
  contentId: string;
  front: string;
  back: string;
  tags: string | null;
  difficulty: number;
  boxLevel: number;
  isNew: boolean;
}

export interface CardStateUpdate {
  cardId: number;
  newBoxLevel: number;
  nextDueAt: Date;
  todayShownCount: number;
}

// ============================================
// 排程算法核心
// ============================================

/**
 * 根据反馈计算新的盒子等级和下次复习时间
 */
export function calculateNextSchedule(
  currentBoxLevel: number,
  rating: FeedbackRating,
  options: { examDate?: Date | null; now?: Date; todayStart?: Date } = {},
): { newBoxLevel: number; nextDueAt: Date } {
  const now = options.now ?? new Date();
  const todayStart = options.todayStart ?? getBeijingTodayStart();
  const examPhase = getExamPhase(options.examDate ?? null, todayStart);
  let newBoxLevel: number;
  let intervalMs: number;

  switch (rating) {
    case FeedbackRating.FORGOT:
      // 不会 -> boxLevel = 1，5小时后再见
      newBoxLevel = 1;
      intervalMs = FORGOT_INTERVAL_HOURS * 60 * 60 * 1000;
      break;

    case FeedbackRating.FUZZY:
      // 模糊 -> boxLevel 降1（但不低于1），1天后再见
      newBoxLevel = Math.max(1, currentBoxLevel - 1);
      intervalMs = 24 * 60 * 60 * 1000; // 1天
      break;

    case FeedbackRating.KNEW:
      // 会 -> boxLevel 升1（但不超过5），按新等级间隔
      newBoxLevel = Math.min(5, currentBoxLevel + 1);
      intervalMs = getIntervalDays(newBoxLevel, examPhase) * MS_PER_DAY;
      break;

    case FeedbackRating.PERFECT:
      // 很熟 -> boxLevel 升2（但不超过5），按新等级间隔
      newBoxLevel = Math.min(5, currentBoxLevel + 2);
      intervalMs = getIntervalDays(newBoxLevel, examPhase) * MS_PER_DAY;
      break;

    default:
      throw new Error(`Unknown rating: ${rating}`);
  }

  const nextDueAt = new Date(now.getTime() + intervalMs);
  return { newBoxLevel, nextDueAt };
}

// ============================================
// 今日队列
// ============================================

/**
 * 获取今日队列摘要
 */
export async function getTodayQueueSummary(
  dbCtx: DbCtx,
  userId: number,
  courseId: number,
): Promise<TodayQueueSummary> {
  const now = new Date();
  const todayStart = getBeijingTodayStart();

  // 查询到期卡片数（nextDueAt <= now && todayShownCount < MAX_DAILY_ATTEMPTS）
  const dueCards = await dbCtx.userCardState.count({
    where: {
      userId,
      card: { courseId },
      nextDueAt: { lte: now },
      OR: [
        { lastAnsweredAt: null },
        { lastAnsweredAt: { lt: todayStart } },
        { todayShownCount: { lt: MAX_DAILY_ATTEMPTS } },
      ],
    },
  });

  // 查询新卡片数（没有 UserCardState 记录的卡片）
  const totalCourseCards = await dbCtx.studyCard.count({
    where: { courseId },
  });
  const userCardStates = await dbCtx.userCardState.count({
    where: {
      userId,
      card: { courseId },
    },
  });
  const newCards = totalCourseCards - userCardStates;

  // 查询今日已复习数
  const reviewedToday = await dbCtx.userCardState.count({
    where: {
      userId,
      card: { courseId },
      lastAnsweredAt: { gte: todayStart },
    },
  });

  // 预计用时（卡片 8 秒）
  const totalToReview = dueCards + Math.min(newCards, 20); // 新卡片限制每天20张
  const estimatedMinutes = Math.ceil((totalToReview * 8) / 60);

  return {
    dueCards,
    newCards,
    reviewedToday,
    estimatedMinutes,
  };
}

// ============================================
// 开始学习 Session
// ============================================

/**
 * 开始卡片学习 session，返回需要复习的卡片
 */
export async function startCardSession(
  dbCtx: DbCtx,
  userId: number,
  courseId: number,
  options: { unitId?: number; limit?: number } = {},
): Promise<CardSession> {
  const { unitId, limit = 20 } = options;
  const now = new Date();
  const todayStart = getBeijingTodayStart();
  const sessionId = generateSessionId();

  // 构建基础查询条件
  const cardWhere: Prisma.StudyCardWhereInput = {
    courseId,
    ...(unitId && { unitId }),
  };

  // 1. 获取到期卡片（已有 UserCardState 且到期）
  const dueCardStates = await dbCtx.userCardState.findMany({
    where: {
      userId,
      card: cardWhere,
      nextDueAt: { lte: now },
      OR: [
        { lastAnsweredAt: null },
        { lastAnsweredAt: { lt: todayStart } },
        { todayShownCount: { lt: MAX_DAILY_ATTEMPTS } },
      ],
    },
    include: cardStateWithCardInclude,
    orderBy: { nextDueAt: "asc" },
    take: limit,
  });

  const dueCards: CardItem[] = dueCardStates.map((state) => ({
    id: state.card.id,
    contentId: state.card.contentId,
    front: state.card.front,
    back: state.card.back,
    tags: state.card.tags,
    difficulty: state.card.difficulty,
    boxLevel: state.boxLevel,
    isNew: false,
  }));

  // 2. 如果到期卡片不足，补充新卡片
  const remainingSlots = limit - dueCards.length;
  let newCards: CardItem[] = [];

  if (remainingSlots > 0) {
    // 使用 Prisma 关系过滤器，让数据库执行 NOT EXISTS 子查询
    // 比内存中的 notIn 数组更高效且可扩展
    const unseenCards = await dbCtx.studyCard.findMany({
      where: {
        ...cardWhere,
        // 排除此用户已有 UserCardState 的卡片
        userStates: {
          none: { userId },
        },
      },
      select: cardSelectPublic,
      orderBy: { sortOrder: "asc" },
      take: remainingSlots,
    });

    newCards = unseenCards.map((card) => ({
      id: card.id,
      contentId: card.contentId,
      front: card.front,
      back: card.back,
      tags: card.tags,
      difficulty: card.difficulty,
      boxLevel: 1, // 新卡片默认 boxLevel = 1
      isNew: true,
    }));
  }

  const allCards = [...dueCards, ...newCards];

  return {
    sessionId,
    cards: allCards,
    totalCount: allCards.length,
  };
}

// ============================================
// 提交卡片反馈
// ============================================

/**
 * 提交卡片学习反馈，更新排程
 */
export async function submitCardFeedback(
  dbCtx: DbCtx,
  userId: number,
  cardId: number,
  sessionId: string,
  rating: FeedbackRating,
): Promise<CardStateUpdate> {
  return withTransaction(dbCtx, async (tx) => {
    const now = new Date();
    const todayStart = getBeijingTodayStart();
    const card = await tx.studyCard.findUnique({
      where: { id: cardId },
      select: cardCourseIdView,
    });

    if (!card) {
      throw new Error("CARD_NOT_FOUND");
    }

    const enrollment = await tx.userCourseEnrollment.findUnique({
      where: { userId_courseId: { userId, courseId: card.courseId } },
      select: enrollmentSelectPublic,
    });

    const examDate = enrollment?.examDate ?? null;

    let cardState = await tx.userCardState.findUnique({
      where: {
        userId_cardId: { userId, cardId },
      },
    });

    if (cardState?.lastSessionId === sessionId) {
      return {
        cardId,
        newBoxLevel: cardState.boxLevel,
        nextDueAt: cardState.nextDueAt,
        todayShownCount: cardState.todayShownCount,
      };
    }

    if (
      cardState &&
      cardState.lastAnsweredAt &&
      cardState.lastAnsweredAt >= todayStart &&
      cardState.todayShownCount >= MAX_DAILY_ATTEMPTS
    ) {
      throw new Error("CARD_DAILY_LIMIT_REACHED");
    }

    let created = false;

    if (!cardState) {
      const { newBoxLevel, nextDueAt } = calculateNextSchedule(1, rating, {
        examDate,
        now,
        todayStart,
      });

      try {
        cardState = await tx.userCardState.create({
          data: {
            userId,
            cardId,
            boxLevel: newBoxLevel,
            nextDueAt,
            lastAnsweredAt: now,
            lastSessionId: sessionId,
            todayShownCount: 1,
            totalAttempts: 1,
          },
        });
        created = true;
      } catch (error) {
        if (
          error instanceof PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          cardState = await tx.userCardState.findUnique({
            where: { userId_cardId: { userId, cardId } },
          });
        } else {
          throw error;
        }
      }
    }

    if (!cardState) {
      throw new Error("CARD_STATE_NOT_FOUND");
    }

    if (!created) {
      if (cardState.lastSessionId === sessionId) {
        return {
          cardId,
          newBoxLevel: cardState.boxLevel,
          nextDueAt: cardState.nextDueAt,
          todayShownCount: cardState.todayShownCount,
        };
      }

      const { newBoxLevel, nextDueAt } = calculateNextSchedule(
        cardState.boxLevel ?? 1,
        rating,
        {
          examDate,
          now,
          todayStart,
        },
      );

      const updateBase = {
        boxLevel: newBoxLevel,
        nextDueAt,
        lastAnsweredAt: now,
        lastSessionId: sessionId,
        totalAttempts: { increment: 1 },
      };

      const resetResult = await tx.userCardState.updateMany({
        where: {
          userId,
          cardId,
          AND: [
            {
              OR: [
                { lastSessionId: null },
                { lastSessionId: { not: sessionId } },
              ],
            },
            {
              OR: [
                { lastAnsweredAt: null },
                { lastAnsweredAt: { lt: todayStart } },
              ],
            },
          ],
        },
        data: {
          ...updateBase,
          todayShownCount: 1,
        },
      });

      let updatedCount = resetResult.count;

      if (updatedCount === 0) {
        const incrementResult = await tx.userCardState.updateMany({
          where: {
            userId,
            cardId,
            AND: [
              {
                OR: [
                  { lastSessionId: null },
                  { lastSessionId: { not: sessionId } },
                ],
              },
              { lastAnsweredAt: { gte: todayStart } },
            ],
          },
          data: {
            ...updateBase,
            todayShownCount: { increment: 1 },
          },
        });
        updatedCount = incrementResult.count;
      }

      if (updatedCount === 0) {
        const latestState = await tx.userCardState.findUnique({
          where: { userId_cardId: { userId, cardId } },
        });

        if (latestState) {
          return {
            cardId,
            newBoxLevel: latestState.boxLevel,
            nextDueAt: latestState.nextDueAt,
            todayShownCount: latestState.todayShownCount,
          };
        }
      }

      cardState = await tx.userCardState.findUnique({
        where: { userId_cardId: { userId, cardId } },
      });
    }

    if (!cardState) {
      throw new Error("CARD_STATE_NOT_FOUND");
    }

    if (card) {
      await tx.userCourseEnrollment.updateMany({
        where: {
          userId,
          courseId: card.courseId,
        },
        data: {
          lastStudiedAt: now,
        },
      });
    }

    await recordActivity(tx, userId, 1);

    return {
      cardId,
      newBoxLevel: cardState.boxLevel,
      nextDueAt: cardState.nextDueAt,
      todayShownCount: cardState.todayShownCount,
    };
  });
}

function getExamPhase(
  examDate: Date | null,
  todayStart: Date,
): "normal" | "prep" | "cram" {
  if (!examDate) {
    return "normal";
  }

  const examStart = getBeijingDateStart(examDate);
  const diffDays = Math.ceil((examStart.getTime() - todayStart.getTime()) / MS_PER_DAY);

  if (diffDays < 0) {
    return "normal";
  }

  if (diffDays <= EXAM_CRAM_DAYS) {
    return "cram";
  }

  if (diffDays <= EXAM_PREP_DAYS) {
    return "prep";
  }

  return "normal";
}

function getIntervalDays(boxLevel: number, phase: "normal" | "prep" | "cram"): number {
  if (phase === "normal") {
    return LEITNER_INTERVALS[boxLevel];
  }

  const intervals = EXAM_INTERVALS[phase];
  return intervals[boxLevel] ?? LEITNER_INTERVALS[boxLevel];
}

// ============================================
// 辅助函数
// ============================================

function generateSessionId(): string {
  // 使用 Node.js 内置的加密安全 UUID 生成
  return crypto.randomUUID();
}

/**
 * 检查卡片今日是否已达到最大显示次数
 */
export async function isCardMaxedOutToday(
  dbCtx: DbCtx,
  userId: number,
  cardId: number,
): Promise<boolean> {
  const todayStart = getBeijingTodayStart();

  const cardState = await dbCtx.userCardState.findUnique({
    where: {
      userId_cardId: { userId, cardId },
    },
    select: cardStateScheduleView,
  });

  if (!cardState) {
    return false; // 新卡片，未达到上限
  }

  // 如果上次回答是今天之前，则计数已重置
  if (cardState.lastAnsweredAt && cardState.lastAnsweredAt < todayStart) {
    return false;
  }

  return cardState.todayShownCount >= MAX_DAILY_ATTEMPTS;
}
