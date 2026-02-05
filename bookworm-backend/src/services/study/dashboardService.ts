// src/services/study/dashboardService.ts
// 复习首页聚合数据服务
import { PrismaClient, Prisma } from "@prisma/client";
import { getActivityHistory } from "./activityService";
import { getStreakInfo } from "./streakService";
import { getTodayQueueSummary } from "./cardScheduler";
import {
  resolveCurrentCourse,
  getQuizPendingStats,
  getWrongCount,
} from "./studyStats";

type DbCtx = PrismaClient | Prisma.TransactionClient;

// ============================================
// 类型定义
// ============================================

export interface StudyDashboardCourse {
  courseKey: string;
  title: string;
  progress: number;
  upgradeAvailable: boolean;
}

export interface ResumeSessionSnapshot {
  type: "flashcard" | "quiz";
  sessionId: string;
  updatedAt: string;
}

export interface StudyDashboard {
  dueCardCount: number;
  dueQuizCount: number;
  wrongCount: number;
  etaMinutes: number;
  streakDays: number;
  activeHeatmap: Array<{ date: string; totalDurationSeconds: number; level: number }>;
  currentCourse: StudyDashboardCourse | null;
  resumeSession: ResumeSessionSnapshot | null;
}

export interface GetStudyDashboardOptions {
  includeUnpublished?: boolean;
}

export { resolveCurrentCourse, getQuizPendingStats, getWrongCount } from "./studyStats";
export type { ResolvedCourse } from "./studyStats";

// ============================================
// 常量
// ============================================

const CARD_SECONDS_PER_ITEM = 8;
const QUIZ_SECONDS_PER_ITEM = 30;
const WRONG_SECONDS_PER_ITEM = QUIZ_SECONDS_PER_ITEM;

// ============================================
// 主函数
// ============================================

export async function getStudyDashboard(
  dbCtx: DbCtx,
  userId: number,
  courseKey?: string,
  options: GetStudyDashboardOptions = {},
): Promise<StudyDashboard> {
  const { includeUnpublished = false } = options;

  const [streakInfo, activityHistory, course] = await Promise.all([
    getStreakInfo(dbCtx, userId),
    getActivityHistory(dbCtx, userId, 35),
    resolveCurrentCourse(dbCtx, userId, courseKey, { includeUnpublished }),
  ]);

  const heatmap = mapActivityToHeatmap(activityHistory.days);

  if (!course) {
    return buildEmptyDashboard(streakInfo.currentStreak, heatmap);
  }

  const [todaySummary, quizStats, wrongCount, progress] = await Promise.all([
    getTodayQueueSummary(dbCtx, userId, course.id),
    getQuizPendingStats(dbCtx, userId, course.id, course.totalQuestions),
    getWrongCount(dbCtx, userId, course.id),
    getCourseProgress(dbCtx, userId, course.id, course.totalCards),
  ]);

  return {
    dueCardCount: todaySummary.dueCards,
    dueQuizCount: quizStats.pendingCount,
    wrongCount,
    etaMinutes: estimateMinutes(todaySummary.dueCards, quizStats.pendingCount, wrongCount),
    streakDays: streakInfo.currentStreak,
    activeHeatmap: heatmap,
    currentCourse: {
      courseKey: course.courseKey,
      title: course.title,
      progress,
      upgradeAvailable: course.upgradeAvailable,
    },
    resumeSession: null,
  };
}

// ============================================
// 可测试的子函数（已导出）
// ============================================


/**
 * 获取课程进度（0-1）
 */
export async function getCourseProgress(
  dbCtx: DbCtx,
  userId: number,
  courseId: number,
  totalCards: number,
): Promise<number> {
  if (totalCards <= 0) return 0;

  const completedCards = await dbCtx.userCardState.count({
    where: { userId, card: { courseId } },
  });

  return Math.min(1, completedCards / totalCards);
}

/**
 * 估算学习时间（分钟）
 */
export function estimateMinutes(
  dueCardCount: number,
  dueQuizCount: number,
  wrongCount: number,
): number {
  const seconds =
    dueCardCount * CARD_SECONDS_PER_ITEM +
    dueQuizCount * QUIZ_SECONDS_PER_ITEM +
    wrongCount * WRONG_SECONDS_PER_ITEM;
  return seconds <= 0 ? 0 : Math.ceil(seconds / 60);
}

// ============================================
// 辅助函数
// ============================================

function mapActivityToHeatmap(
  days: Array<{ date: string; totalDurationSeconds: number; level: number }>,
): Array<{ date: string; totalDurationSeconds: number; level: number }> {
  return days.map((day) => ({
    date: day.date,
    totalDurationSeconds: day.totalDurationSeconds,
    level: day.level,
  }));
}

function buildEmptyDashboard(
  streakDays: number,
  heatmap: Array<{ date: string; totalDurationSeconds: number; level: number }>,
): StudyDashboard {
  return {
    dueCardCount: 0,
    dueQuizCount: 0,
    wrongCount: 0,
    etaMinutes: 0,
    streakDays,
    activeHeatmap: heatmap,
    currentCourse: null,
    resumeSession: null,
  };
}
