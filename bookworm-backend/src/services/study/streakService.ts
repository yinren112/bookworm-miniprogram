// src/services/study/streakService.ts
// 连续学习服务 - Streak 与周榜

import { PrismaClient } from "@prisma/client";
import { streakWithUserInclude } from "../../db/views";
import {
  getBeijingToday,
  getBeijingWeekStart,
  isSameDayBeijing,
  isYesterdayBeijing,
} from "../../utils/timezone";

type DbCtx = PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export interface StreakInfo {
  currentStreak: number;
  bestStreak: number;
  weeklyPoints: number;
  lastStudyDate: Date | null;
  isStudiedToday: boolean;
}

export interface LeaderboardEntry {
  rank: number;
  userId: number;
  nickname: string;
  avatarUrl: string | null;
  weeklyPoints: number;
  currentStreak: number;
}

// 使用统一的时区工具函数
const getTodayDate = getBeijingToday;
const getWeekStartDate = getBeijingWeekStart;
const isSameDay = isSameDayBeijing;
const isYesterday = isYesterdayBeijing;

/**
 * 记录学习活动并更新连续天数
 * - 如果是今天第一次学习，currentStreak++
 * - 如果中断超过1天，currentStreak = 1
 * - 更新 bestStreak 如果当前超过历史最佳
 * - 增加 weeklyPoints
 */
export async function recordActivity(
  db: DbCtx,
  userId: number,
  pointsEarned: number = 1
): Promise<StreakInfo> {
  const today = getTodayDate();
  const weekStart = getWeekStartDate();

  // 获取或创建 streak 记录
  let streak = await db.userStudyStreak.findUnique({
    where: { userId },
  });

  if (!streak) {
    // 首次学习，创建记录
    streak = await db.userStudyStreak.create({
      data: {
        userId,
        currentStreak: 1,
        bestStreak: 1,
        lastStudyDate: today,
        weeklyPoints: pointsEarned,
        weekStartDate: weekStart,
      },
    });

    return {
      currentStreak: streak.currentStreak,
      bestStreak: streak.bestStreak,
      weeklyPoints: streak.weeklyPoints,
      lastStudyDate: streak.lastStudyDate,
      isStudiedToday: true,
    };
  }

  // 检查是否需要重置周积分 (新的一周)
  const needsWeekReset = streak.weekStartDate && streak.weekStartDate < weekStart;

  // 检查上次学习日期
  const lastStudy = streak.lastStudyDate;

  if (lastStudy && isSameDay(lastStudy, today)) {
    // 今天已经学习过，使用原子增量更新积分（避免竞态条件）
    const updated = await db.userStudyStreak.update({
      where: { userId },
      data: {
        weeklyPoints: needsWeekReset
          ? pointsEarned // 新的一周，重置为本次积分
          : { increment: pointsEarned }, // 原子增量
        weekStartDate: weekStart,
      },
    });

    return {
      currentStreak: updated.currentStreak,
      bestStreak: updated.bestStreak,
      weeklyPoints: updated.weeklyPoints,
      lastStudyDate: updated.lastStudyDate,
      isStudiedToday: true,
    };
  }

  // 计算新的连续天数
  let newStreak: number;
  if (lastStudy && isYesterday(lastStudy, today)) {
    // 连续学习
    newStreak = streak.currentStreak + 1;
  } else {
    // 中断了，重新开始
    newStreak = 1;
  }

  const newBest = Math.max(streak.bestStreak, newStreak);

  const updated = await db.userStudyStreak.update({
    where: { userId },
    data: {
      currentStreak: newStreak,
      bestStreak: newBest,
      lastStudyDate: today,
      weeklyPoints: needsWeekReset
        ? pointsEarned // 新的一周，重置为本次积分
        : { increment: pointsEarned }, // 原子增量
      weekStartDate: weekStart,
    },
  });

  return {
    currentStreak: updated.currentStreak,
    bestStreak: updated.bestStreak,
    weeklyPoints: updated.weeklyPoints,
    lastStudyDate: updated.lastStudyDate,
    isStudiedToday: true,
  };
}

/**
 * 获取用户连续学习信息
 */
export async function getStreakInfo(
  db: DbCtx,
  userId: number
): Promise<StreakInfo> {
  const streak = await db.userStudyStreak.findUnique({
    where: { userId },
  });

  if (!streak) {
    return {
      currentStreak: 0,
      bestStreak: 0,
      weeklyPoints: 0,
      lastStudyDate: null,
      isStudiedToday: false,
    };
  }

  const today = getTodayDate();
  const weekStart = getWeekStartDate();

  // 检查是否是新的一周
  let weeklyPoints = streak.weeklyPoints;
  if (streak.weekStartDate && streak.weekStartDate < weekStart) {
    weeklyPoints = 0;
  }

  // 检查今天是否已学习
  const isStudiedToday = streak.lastStudyDate
    ? isSameDay(streak.lastStudyDate, today)
    : false;

  // 检查连续天数是否需要重置 (中断超过1天)
  let currentStreak = streak.currentStreak;
  if (streak.lastStudyDate && !isStudiedToday) {
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    if (!isSameDay(streak.lastStudyDate, yesterday)) {
      // 中断了，但只在查询时返回0，不实际更新数据库
      // 等下次 recordActivity 时再更新
      currentStreak = 0;
    }
  }

  return {
    currentStreak,
    bestStreak: streak.bestStreak,
    weeklyPoints,
    lastStudyDate: streak.lastStudyDate,
    isStudiedToday,
  };
}

/**
 * 获取周榜
 * @param courseId - 可选，按课程筛选 (当前未实现课程维度，预留参数)
 * @param limit - 返回数量，默认 50
 */
export async function getWeeklyLeaderboard(
  db: DbCtx,
  courseId?: number,
  limit: number = 50
): Promise<LeaderboardEntry[]> {
  const weekStart = getWeekStartDate();

  // 查询本周有积分的用户，按积分降序
  const entries = await db.userStudyStreak.findMany({
    where: {
      weeklyPoints: { gt: 0 },
      weekStartDate: { gte: weekStart },
    },
    orderBy: [
      { weeklyPoints: "desc" },
      { currentStreak: "desc" },
    ],
    take: limit,
    include: streakWithUserInclude,
  });

  return entries.map((entry, index) => ({
    rank: index + 1,
    userId: entry.userId,
    nickname: entry.user.nickname || `用户${entry.userId}`,
    avatarUrl: entry.user.avatar_url,
    weeklyPoints: entry.weeklyPoints,
    currentStreak: entry.currentStreak,
  }));
}

/**
 * 获取用户在周榜中的排名
 */
export async function getUserRank(
  db: DbCtx,
  userId: number
): Promise<number | null> {
  const weekStart = getWeekStartDate();

  const userStreak = await db.userStudyStreak.findUnique({
    where: { userId },
  });

  if (!userStreak || userStreak.weeklyPoints === 0) {
    return null;
  }

  // 检查是否是本周的数据
  if (userStreak.weekStartDate && userStreak.weekStartDate < weekStart) {
    return null;
  }

  // 计算排名：比当前用户积分高的人数 + 1
  const higherCount = await db.userStudyStreak.count({
    where: {
      weekStartDate: { gte: weekStart },
      OR: [
        { weeklyPoints: { gt: userStreak.weeklyPoints } },
        {
          weeklyPoints: userStreak.weeklyPoints,
          currentStreak: { gt: userStreak.currentStreak },
        },
      ],
    },
  });

  return higherCount + 1;
}

/**
 * 重置所有用户的 weeklyPoints (每周一执行)
 */
export async function resetWeeklyPoints(db: DbCtx): Promise<number> {
  const weekStart = getWeekStartDate();

  const result = await db.userStudyStreak.updateMany({
    where: {
      OR: [
        { weekStartDate: { lt: weekStart } },
        { weekStartDate: null },
      ],
    },
    data: {
      weeklyPoints: 0,
      weekStartDate: weekStart,
    },
  });

  return result.count;
}
