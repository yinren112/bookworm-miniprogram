// src/services/study/feedbackService.ts
// 纠错反馈服务 - 用户内容纠错

import { PrismaClient, Prisma, FeedbackReasonType, StudyFeedbackStatus } from "@prisma/client";
import { feedbackWithCourseInclude } from "../../db/views";
import { StudyServiceError, StudyErrorCodes } from "../../errors";

type DbCtx = PrismaClient | Prisma.TransactionClient;

export interface CreateFeedbackInput {
  userId: number;
  courseId: number;
  cardId?: number;
  questionId?: number;
  reason: FeedbackReasonType;
  message: string;
}

export interface FeedbackRecord {
  id: number;
  reason: FeedbackReasonType;
  message: string;
  status: StudyFeedbackStatus;
  createdAt: Date;
  resolvedAt: Date | null;
  targetType: "card" | "question";
  targetId: number | null;
}

/**
 * 提交纠错反馈
 */
export async function createFeedback(
  db: DbCtx,
  input: CreateFeedbackInput,
): Promise<FeedbackRecord> {
  const { userId, courseId, cardId, questionId, reason, message } = input;

  // 验证至少有一个目标
  if (!cardId && !questionId) {
    throw new StudyServiceError(StudyErrorCodes.FEEDBACK_TARGET_REQUIRED, "Either cardId or questionId is required");
  }

  const feedback = await db.studyFeedback.create({
    data: {
      userId,
      courseId,
      cardId,
      questionId,
      reason,
      message,
      status: "PENDING",
    },
  });

  return {
    id: feedback.id,
    reason: feedback.reason,
    message: feedback.message,
    status: feedback.status,
    createdAt: feedback.createdAt,
    resolvedAt: feedback.resolvedAt,
    targetType: cardId ? "card" : "question",
    targetId: cardId ?? questionId ?? null,
  };
}

/**
 * 获取用户的反馈列表
 */
export async function getUserFeedbacks(
  db: DbCtx,
  userId: number,
  options: { limit?: number; offset?: number } = {},
): Promise<{
  items: FeedbackRecord[];
  total: number;
}> {
  const { limit = 20, offset = 0 } = options;

  const [items, total] = await Promise.all([
    db.studyFeedback.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    db.studyFeedback.count({ where: { userId } }),
  ]);

  return {
    items: items.map((f) => ({
      id: f.id,
      reason: f.reason,
      message: f.message,
      status: f.status,
      createdAt: f.createdAt,
      resolvedAt: f.resolvedAt,
      targetType: f.cardId ? "card" : "question",
      targetId: f.cardId ?? f.questionId ?? null,
    })),
    total,
  };
}

/**
 * 获取待处理的反馈列表（管理员用）
 */
export async function getPendingFeedbacks(
  db: DbCtx,
  courseId?: number,
  options: { limit?: number; offset?: number } = {},
): Promise<{
  items: Array<FeedbackRecord & { userId: number; courseName: string }>;
  total: number;
}> {
  const { limit = 20, offset = 0 } = options;

  const whereClause = {
    status: "PENDING" as StudyFeedbackStatus,
    ...(courseId ? { courseId } : {}),
  };

  const [items, total] = await Promise.all([
    db.studyFeedback.findMany({
      where: whereClause,
      include: feedbackWithCourseInclude,
      orderBy: { createdAt: "asc" },
      take: limit,
      skip: offset,
    }),
    db.studyFeedback.count({ where: whereClause }),
  ]);

  return {
    items: items.map((f) => ({
      id: f.id,
      userId: f.userId,
      reason: f.reason,
      message: f.message,
      status: f.status,
      createdAt: f.createdAt,
      resolvedAt: f.resolvedAt,
      targetType: f.cardId ? "card" : "question",
      targetId: f.cardId ?? f.questionId ?? null,
      courseName: f.course.title,
    })),
    total,
  };
}

/**
 * 更新反馈状态（管理员用）
 */
export async function updateFeedbackStatus(
  db: DbCtx,
  feedbackId: number,
  status: StudyFeedbackStatus,
): Promise<FeedbackRecord> {
  const feedback = await db.studyFeedback.update({
    where: { id: feedbackId },
    data: {
      status,
      resolvedAt: status === "RESOLVED" || status === "REJECTED" ? new Date() : null,
    },
  });

  return {
    id: feedback.id,
    reason: feedback.reason,
    message: feedback.message,
    status: feedback.status,
    createdAt: feedback.createdAt,
    resolvedAt: feedback.resolvedAt,
    targetType: feedback.cardId ? "card" : "question",
    targetId: feedback.cardId ?? feedback.questionId ?? null,
  };
}
