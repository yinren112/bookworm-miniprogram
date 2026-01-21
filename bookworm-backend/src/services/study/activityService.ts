// src/services/study/activityService.ts
// 学习活动统计服务 - 热力图数据

import { PrismaClient } from "@prisma/client";
import { getBeijingTodayStart, toBeijingDate } from "../../utils/timezone";
import { cardStateActivityView, questionAttemptActivityView } from "../../db/views/studyViews";

type DbCtx = PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export interface DailyActivity {
  date: string; // YYYY-MM-DD
  count: number; // 学习次数
  level: number; // 0-3 热力等级
}

export interface ActivityHistory {
  days: DailyActivity[];
  totalDays: number;
  totalCount: number;
}

/**
 * 获取用户最近N天的学习活动历史（用于热力图）
 * 
 * 数据来源：
 * 1. UserCardState.lastAnsweredAt - 卡片复习记录
 * 2. UserQuestionAttempt.attemptedAt - 刷题记录
 * 
 * @param db 数据库上下文
 * @param userId 用户ID
 * @param days 天数，默认35天（5周）
 */
export async function getActivityHistory(
  db: DbCtx,
  userId: number,
  days: number = 35
): Promise<ActivityHistory> {
  const todayStart = getBeijingTodayStart();
  const startDate = new Date(todayStart);
  startDate.setDate(startDate.getDate() - days + 1);
  const endDate = new Date(todayStart);
  endDate.setDate(endDate.getDate() + 1);
  endDate.setMilliseconds(endDate.getMilliseconds() - 1);

  // 并行查询卡片和题目的活动数据
  const [cardActivities, quizActivities] = await Promise.all([
    // 卡片复习活动
    db.userCardState.findMany({
      where: {
        userId,
        lastAnsweredAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: cardStateActivityView,
    }),
    // 刷题活动
    db.userQuestionAttempt.findMany({
      where: {
        userId,
        attemptedAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: questionAttemptActivityView,
    }),
  ]);

  // 按日期聚合
  const activityMap = new Map<string, number>();

  // 初始化所有日期为0
  for (let i = 0; i < days; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    const dateStr = formatDateToYMD(date);
    activityMap.set(dateStr, 0);
  }

  // 聚合卡片活动
  for (const { lastAnsweredAt } of cardActivities) {
    if (lastAnsweredAt) {
      const dateStr = formatDateToYMD(lastAnsweredAt);
      activityMap.set(dateStr, (activityMap.get(dateStr) || 0) + 1);
    }
  }

  // 聚合刷题活动
  for (const { attemptedAt } of quizActivities) {
    const dateStr = formatDateToYMD(attemptedAt);
    activityMap.set(dateStr, (activityMap.get(dateStr) || 0) + 1);
  }

  // 计算最大活动量用于归一化
  const counts = Array.from(activityMap.values());
  const maxCount = Math.max(...counts, 1);

  // 转换为结果数组
  const dailyActivities: DailyActivity[] = [];
  let totalCount = 0;
  let activeDays = 0;

  for (const [date, count] of activityMap) {
    totalCount += count;
    if (count > 0) activeDays++;

    dailyActivities.push({
      date,
      count,
      level: calculateLevel(count, maxCount),
    });
  }

  // 按日期排序
  dailyActivities.sort((a, b) => a.date.localeCompare(b.date));

  return {
    days: dailyActivities,
    totalDays: activeDays,
    totalCount,
  };
}

/**
 * 计算热力等级 (0-3)
 * 0: 无活动
 * 1: 低 (1-25% of max)
 * 2: 中 (25-50% of max)
 * 3: 高 (50%+ of max)
 */
function calculateLevel(count: number, maxCount: number): number {
  if (count === 0) return 0;
  const ratio = count / maxCount;
  if (ratio >= 0.5) return 3;
  if (ratio >= 0.25) return 2;
  return 1;
}

/**
 * 格式化日期为 YYYY-MM-DD（北京时区）
 */
function formatDateToYMD(date: Date): string {
  const beijingTime = toBeijingDate(date);
  const year = beijingTime.getFullYear();
  const month = String(beijingTime.getMonth() + 1).padStart(2, "0");
  const day = String(beijingTime.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
