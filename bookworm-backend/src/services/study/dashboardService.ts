// src/services/study/dashboardService.ts
// 复习首页聚合数据服务
import { PrismaClient, Prisma } from "@prisma/client";
import { questionAttemptQuestionIdView } from "../../db/views";
import { getActivityHistory } from "./activityService";
import { getStreakInfo } from "./streakService";
import { getCourseByKey, getUserEnrolledCourses } from "./courseService";
import { getTodayQueueSummary } from "./cardScheduler";

type DbCtx = PrismaClient | Prisma.TransactionClient;

export interface StudyDashboardCourse {
  courseKey: string;
  title: string;
  progress: number;
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

const CARD_SECONDS_PER_ITEM = 8;
const QUIZ_SECONDS_PER_ITEM = 30;

export async function getStudyDashboard(
  dbCtx: DbCtx,
  userId: number,
  courseKey?: string,
): Promise<StudyDashboard> {
  const [streakInfo, activityHistory, course] = await Promise.all([
    getStreakInfo(dbCtx, userId),
    getActivityHistory(dbCtx, userId, 35),
    resolveCurrentCourse(dbCtx, userId, courseKey),
  ]);

  if (!course) {
    return {
      dueCardCount: 0,
      dueQuizCount: 0,
      wrongCount: 0,
      etaMinutes: 0,
      streakDays: streakInfo.currentStreak,
      activeHeatmap: activityHistory.days.map((day) => ({
        date: day.date,
        totalDurationSeconds: day.totalDurationSeconds,
        level: day.level,
      })),
      currentCourse: null,
      resumeSession: null,
    };
  }

  const [todaySummary, quizStats, wrongCount, progress] = await Promise.all([
    getTodayQueueSummary(dbCtx, userId, course.id),
    getQuizPendingStats(dbCtx, userId, course.id, course.totalQuestions),
    getWrongCount(dbCtx, userId, course.id),
    getCourseProgress(dbCtx, userId, course.id, course.totalCards),
  ]);

  const dueCardCount = todaySummary.dueCards;
  const dueQuizCount = quizStats.pendingCount;
  const etaMinutes = estimateMinutes(dueCardCount, dueQuizCount);

  return {
    dueCardCount,
    dueQuizCount,
    wrongCount,
    etaMinutes,
    streakDays: streakInfo.currentStreak,
    activeHeatmap: activityHistory.days.map((day) => ({
      date: day.date,
      totalDurationSeconds: day.totalDurationSeconds,
      level: day.level,
    })),
    currentCourse: {
      courseKey: course.courseKey,
      title: course.title,
      progress,
    },
    resumeSession: null,
  };
}

async function resolveCurrentCourse(
  dbCtx: DbCtx,
  userId: number,
  courseKey?: string,
): Promise<{ id: number; courseKey: string; title: string; totalCards: number; totalQuestions: number } | null> {
  if (courseKey) {
    const course = await getCourseByKey(dbCtx, courseKey, { userId, publishedOnly: true });
    return course
      ? {
          id: course.id,
          courseKey: course.courseKey,
          title: course.title,
          totalCards: course.totalCards,
          totalQuestions: course.totalQuestions,
        }
      : null;
  }

  const courses = await getUserEnrolledCourses(dbCtx, userId);
  const current = courses[0];
  if (!current) return null;

  return {
    id: current.id,
    courseKey: current.courseKey,
    title: current.title,
    totalCards: current.totalCards,
    totalQuestions: current.totalQuestions,
  };
}

async function getQuizPendingStats(
  dbCtx: DbCtx,
  userId: number,
  courseId: number,
  totalQuestions: number,
): Promise<{ pendingCount: number }> {
  if (totalQuestions <= 0) {
    return { pendingCount: 0 };
  }

  const [questionCount, answered] = await Promise.all([
    dbCtx.studyQuestion.count({ where: { courseId } }),
    dbCtx.userQuestionAttempt.findMany({
    where: {
      userId,
      question: { courseId },
    },
    distinct: ["questionId"],
      select: questionAttemptQuestionIdView,
    }),
  ]);
  const effectiveTotalQuestions = questionCount > 0 ? questionCount : totalQuestions;

  return {
    pendingCount: Math.max(0, effectiveTotalQuestions - answered.length),
  };
}

async function getWrongCount(
  dbCtx: DbCtx,
  userId: number,
  courseId: number,
): Promise<number> {
  return dbCtx.userWrongItem.count({
    where: {
      userId,
      clearedAt: null,
      question: { courseId },
    },
  });
}

async function getCourseProgress(
  dbCtx: DbCtx,
  userId: number,
  courseId: number,
  totalCards: number,
): Promise<number> {
  if (totalCards <= 0) return 0;

  const completedCards = await dbCtx.userCardState.count({
    where: {
      userId,
      card: { courseId },
    },
  });

  return Math.min(1, completedCards / totalCards);
}

function estimateMinutes(dueCardCount: number, dueQuizCount: number): number {
  const seconds = dueCardCount * CARD_SECONDS_PER_ITEM + dueQuizCount * QUIZ_SECONDS_PER_ITEM;
  if (seconds <= 0) return 0;
  return Math.ceil(seconds / 60);
}
