// src/services/study/activityService.ts
// 学习活动统计服务 - 热力图数据

import { PrismaClient } from "@prisma/client";
import { dailyStudyActivityHistoryView } from "../../db/views";
import { getBeijingNow } from "../../utils/timezone";

type DbCtx = PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export interface DailyActivity {
  date: string; // YYYY-MM-DD
  totalDurationSeconds: number;
  cardDurationSeconds: number;
  quizDurationSeconds: number;
  cheatsheetDurationSeconds: number;
  level: number; // 0-3 热力等级
}

export interface ActivityHistory {
  days: DailyActivity[];
  totalDays: number;
  totalDurationSeconds: number;
}

export type StudyActivityType = "card" | "quiz" | "cheatsheet";

export async function recordDailyStudyDuration(
  db: DbCtx,
  input: {
    userId: number;
    activityDate: Date;
    type: StudyActivityType;
    totalDurationSeconds: number;
  },
): Promise<void> {
  const cardSeconds = input.type === "card" ? input.totalDurationSeconds : 0;
  const quizSeconds = input.type === "quiz" ? input.totalDurationSeconds : 0;
  const cheatsheetSeconds = input.type === "cheatsheet" ? input.totalDurationSeconds : 0;

  await db.$executeRawUnsafe(
    `
INSERT INTO "public"."daily_study_activity"
  ("user_id", "date", "card_duration_seconds", "quiz_duration_seconds", "cheatsheet_duration_seconds", "updated_at")
VALUES
  ($1::int4, $2::date, $3::int4, $4::int4, $5::int4, CURRENT_TIMESTAMP)
ON CONFLICT ("user_id", "date")
DO UPDATE SET
  "card_duration_seconds" = GREATEST("daily_study_activity"."card_duration_seconds", EXCLUDED."card_duration_seconds"),
  "quiz_duration_seconds" = GREATEST("daily_study_activity"."quiz_duration_seconds", EXCLUDED."quiz_duration_seconds"),
  "cheatsheet_duration_seconds" = GREATEST("daily_study_activity"."cheatsheet_duration_seconds", EXCLUDED."cheatsheet_duration_seconds"),
  "updated_at" = CURRENT_TIMESTAMP
    `,
    input.userId,
    input.activityDate,
    cardSeconds,
    quizSeconds,
    cheatsheetSeconds,
  );
}

export function parseYmdToDateOnlyUtc(ymd: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) {
    throw new Error("Invalid date format");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));

  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    throw new Error("Invalid date value");
  }

  return utc;
}

/**
 * 获取用户最近N天的学习活动历史（用于热力图）
 * @param db 数据库上下文
 * @param userId 用户ID
 * @param days 天数，默认35天（5周）
 */
export async function getActivityHistory(
  db: DbCtx,
  userId: number,
  days: number = 35
): Promise<ActivityHistory> {
  const beijingNow = getBeijingNow();
  const todayDateOnlyUtc = new Date(
    Date.UTC(beijingNow.getFullYear(), beijingNow.getMonth(), beijingNow.getDate()),
  );
  const startDateOnlyUtc = new Date(
    todayDateOnlyUtc.getTime() - (days - 1) * 24 * 60 * 60 * 1000,
  );

  const rows = await db.dailyStudyActivity.findMany({
    where: {
      userId,
      date: {
        gte: startDateOnlyUtc,
        lte: todayDateOnlyUtc,
      },
    },
    select: dailyStudyActivityHistoryView,
  });

  const byDate = new Map<string, Omit<DailyActivity, "date" | "level">>();
  for (const row of rows) {
    const date = row.date.toISOString().slice(0, 10);
    byDate.set(date, {
      totalDurationSeconds:
        row.cardDurationSeconds + row.quizDurationSeconds + row.cheatsheetDurationSeconds,
      cardDurationSeconds: row.cardDurationSeconds,
      quizDurationSeconds: row.quizDurationSeconds,
      cheatsheetDurationSeconds: row.cheatsheetDurationSeconds,
    });
  }

  const daysOut: DailyActivity[] = [];
  for (let i = 0; i < days; i++) {
    const dateOnlyUtc = new Date(startDateOnlyUtc.getTime() + i * 24 * 60 * 60 * 1000);
    const date = dateOnlyUtc.toISOString().slice(0, 10);
    const existing = byDate.get(date) || {
      totalDurationSeconds: 0,
      cardDurationSeconds: 0,
      quizDurationSeconds: 0,
      cheatsheetDurationSeconds: 0,
    };
    daysOut.push({ date, ...existing, level: 0 });
  }

  const maxTotal = Math.max(
    ...daysOut.map((d) => d.totalDurationSeconds),
    1,
  );

  let totalDurationSeconds = 0;
  let activeDays = 0;
  for (const day of daysOut) {
    totalDurationSeconds += day.totalDurationSeconds;
    if (day.totalDurationSeconds > 0) activeDays++;
    day.level = calculateLevel(day.totalDurationSeconds, maxTotal);
  }

  return {
    days: daysOut,
    totalDays: activeDays,
    totalDurationSeconds,
  };
}

/**
 * 计算热力等级 (0-3)
 * 0: 无活动
 * 1: 低 (1-25% of max)
 * 2: 中 (25-50% of max)
 * 3: 高 (50%+ of max)
 */
function calculateLevel(totalDurationSeconds: number, maxTotalDurationSeconds: number): number {
  if (totalDurationSeconds === 0) return 0;
  const ratio = totalDurationSeconds / maxTotalDurationSeconds;
  if (ratio >= 0.5) return 3;
  if (ratio >= 0.25) return 2;
  return 1;
}
