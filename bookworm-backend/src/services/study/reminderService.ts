// src/services/study/reminderService.ts
// 复习提醒订阅与发送服务
import axios from "axios";
import crypto from "crypto";
import { PrismaClient, Prisma, StudyReminderStatus } from "@prisma/client";
import config from "../../config";
import { retryAsync } from "../../utils/retry";
import { isSameDayBeijing, toBeijingDate } from "../../utils/timezone";
import { getTodayQueueSummary } from "./cardScheduler";
import { resolveCurrentCourse, getQuizPendingStats, getWrongCount } from "./studyStats";
import { WECHAT_CONSTANTS } from "../../constants";
import { log } from "../../lib/logger";
import { reminderSubscriptionWithUserInclude } from "../../db/views";
import { REMINDER_TEMPLATE_KEYS } from "./studyReminderTemplate";

type DbCtx = PrismaClient | Prisma.TransactionClient;

const DEFAULT_TIMEZONE = "Asia/Shanghai";
const DEFAULT_SEND_HOUR = 9;
const DEFAULT_SEND_MINUTE = 0;
const REMINDER_ENTRY_PAGE = "pages/review/index?source=reminder";

interface ReminderSendResult {
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
}

interface SubscribeResult {
  status: StudyReminderStatus;
  nextSendAt: Date | null;
}

interface ReminderStatusResult {
  status: StudyReminderStatus | "UNKNOWN";
  templateId: string | null;
  lastSentAt: Date | null;
  nextSendAt: Date | null;
}

interface WechatSubscribeResponse {
  errcode?: number;
  errmsg?: string;
  msgid?: number;
}

interface WxAccessTokenResponse {
  access_token?: string;
  expires_in?: number;
  errcode?: number;
  errmsg?: string;
}

let accessTokenCache: { token: string; expiresAt: number } | null = null;
let accessTokenPromise: Promise<string> | null = null;

function isValidTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function getZonedDateParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const lookup: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      lookup[part.type] = part.value;
    }
  }
  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: Number(lookup.hour),
    minute: Number(lookup.minute),
    second: Number(lookup.second),
  };
}

function getTimeZoneOffsetMinutes(timeZone: string, date: Date): number {
  const zoned = getZonedDateParts(date, timeZone);
  const utcTimestamp = Date.UTC(
    zoned.year,
    zoned.month - 1,
    zoned.day,
    zoned.hour,
    zoned.minute,
    zoned.second,
  );
  return (utcTimestamp - date.getTime()) / 60000;
}

function zonedTimeToUtcDate(
  timeZone: string,
  parts: { year: number; month: number; day: number; hour: number; minute: number; second: number },
): Date {
  const utcApprox = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second),
  );
  const offsetMinutes = getTimeZoneOffsetMinutes(timeZone, utcApprox);
  return new Date(utcApprox.getTime() - offsetMinutes * 60 * 1000);
}

export async function upsertStudyReminderSubscription(
  dbCtx: DbCtx,
  userId: number,
  templateId: string,
  result: "accept" | "reject",
  timezone?: string,
): Promise<SubscribeResult> {
  const status = result === "accept" ? StudyReminderStatus.ACTIVE : StudyReminderStatus.REJECT;
  const now = new Date();
  const normalizedTimezone = timezone || DEFAULT_TIMEZONE;
  const nextSendAt = status === StudyReminderStatus.ACTIVE
    ? getNextSendAt(now, normalizedTimezone)
    : null;

  const subscription = await dbCtx.studyReminderSubscription.upsert({
    where: {
      userId_templateId: {
        userId,
        templateId,
      },
    },
    create: {
      userId,
      templateId,
      status,
      consentAt: now,
      nextSendAt,
      timezone: normalizedTimezone,
    },
    update: {
      status,
      consentAt: now,
      nextSendAt,
      timezone: normalizedTimezone,
    },
  });

  return {
    status: subscription.status,
    nextSendAt: subscription.nextSendAt,
  };
}

export async function getStudyReminderStatus(
  dbCtx: DbCtx,
  userId: number,
  templateId?: string,
): Promise<ReminderStatusResult> {
  const subscription = templateId
    ? await dbCtx.studyReminderSubscription.findUnique({
        where: {
          userId_templateId: { userId, templateId },
        },
      })
    : await dbCtx.studyReminderSubscription.findFirst({
        where: { userId },
        orderBy: { updatedAt: "desc" },
      });

  if (!subscription) {
    return {
      status: "UNKNOWN",
      templateId: templateId ?? null,
      lastSentAt: null,
      nextSendAt: null,
    };
  }

  return {
    status: subscription.status,
    templateId: subscription.templateId,
    lastSentAt: subscription.lastSentAt,
    nextSendAt: subscription.nextSendAt,
  };
}

export async function sendStudyReminders(dbCtx: PrismaClient): Promise<ReminderSendResult> {
  const now = new Date();
  const subscriptions = await dbCtx.studyReminderSubscription.findMany({
    where: {
      status: StudyReminderStatus.ACTIVE,
      nextSendAt: { lte: now },
    },
    include: reminderSubscriptionWithUserInclude,
  });

  const result: ReminderSendResult = {
    processed: subscriptions.length,
    sent: 0,
    skipped: 0,
    failed: 0,
  };

  for (const subscription of subscriptions) {
    const timezone = subscription.timezone || DEFAULT_TIMEZONE;
    if (!subscription.user?.openid) {
      result.failed += 1;
      continue;
    }
    const shouldSkip = subscription.lastSentAt
      ? isSameDayBeijing(subscription.lastSentAt, now)
      : false;

    if (shouldSkip) {
      await updateNextSendAt(dbCtx, subscription.id, timezone);
      result.skipped += 1;
      continue;
    }

    const payload = await buildReminderPayload(dbCtx, subscription.userId, subscription.templateId);
    if (!payload) {
      await updateNextSendAt(dbCtx, subscription.id, timezone);
      result.skipped += 1;
      continue;
    }

    const payloadHash = hashPayload(payload);

    try {
      const sendResult = await sendWechatSubscribeMessage(subscription.user.openid, payload);
      const isSuccess = sendResult.resultCode === "OK";

      await dbCtx.studyReminderSendLog.create({
        data: {
          subscriptionId: subscription.id,
          resultCode: sendResult.resultCode,
          resultMsg: sendResult.resultMsg,
          payloadHash,
        },
      });

      if (sendResult.resultCode === "SKIPPED") {
         // Environment skipped, treat as SENT to avoid loop in non-prod, or keep ACTIVE?
         // If we keep ACTIVE, it loops forever in dev. Better to mark SENT or logic handles test env.
         // Let's mark as SENT for simulation.
         await dbCtx.studyReminderSubscription.update({
          where: { id: subscription.id },
          data: {
            status: StudyReminderStatus.SENT, // Consumed
            lastSentAt: now,
            sentAt: now,
            lastPayloadHash: payloadHash,
            nextSendAt: null, // No next send for one-time
          },
        });
        result.skipped += 1;
      } else if (isSuccess) {
        // Success: Consume subscription
        await dbCtx.studyReminderSubscription.update({
          where: { id: subscription.id },
          data: {
            status: StudyReminderStatus.SENT,
            lastSentAt: now,
            sentAt: now,
            lastPayloadHash: payloadHash,
            nextSendAt: null,
          },
        });
        result.sent += 1;
      } else {
        // Failed: Mark FAILED? Or retry? 
        // User said: "发送失败要落库失败原因，避免无限重试刷屏".
        // Mark FAILED to stop retry.
        await dbCtx.studyReminderSubscription.update({
            where: { id: subscription.id },
            data: {
              status: StudyReminderStatus.FAILED,
              lastError: sendResult.resultMsg,
              // nextSendAt: null? If we stop retry.
              nextSendAt: null, 
            }
        });
        result.failed += 1;
      }
    } catch (error) {
      result.failed += 1;
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      log.error(
        { err: error, subscriptionId: subscription.id },
        "Failed to send study reminder",
      );
      await dbCtx.studyReminderSendLog.create({
        data: {
          subscriptionId: subscription.id,
          resultCode: "FAILED",
          resultMsg: errorMsg,
          payloadHash,
        },
      });
      // Also update subscription to FAILED
      await dbCtx.studyReminderSubscription.update({
          where: { id: subscription.id },
          data: {
            status: StudyReminderStatus.FAILED,
            lastError: errorMsg,
            nextSendAt: null,
          }
      });
    }
  }

  return result;
}

function getNextSendAt(now: Date, timezone: string): Date {
  const resolvedTimezone = isValidTimeZone(timezone) ? timezone : DEFAULT_TIMEZONE;
  const nowParts = getZonedDateParts(now, resolvedTimezone);
  const baseUtc = new Date(Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day));
  const nextDayUtc = new Date(baseUtc.getTime() + 24 * 60 * 60 * 1000);
  return zonedTimeToUtcDate(resolvedTimezone, {
    year: nextDayUtc.getUTCFullYear(),
    month: nextDayUtc.getUTCMonth() + 1,
    day: nextDayUtc.getUTCDate(),
    hour: DEFAULT_SEND_HOUR,
    minute: DEFAULT_SEND_MINUTE,
    second: 0,
  });
}

async function updateNextSendAt(
  dbCtx: PrismaClient,
  subscriptionId: number,
  timezone: string,
): Promise<void> {
  await dbCtx.studyReminderSubscription.update({
    where: { id: subscriptionId },
    data: {
      nextSendAt: getNextSendAt(new Date(), timezone),
    },
  });
}

async function buildReminderPayload(
  dbCtx: PrismaClient,
  userId: number,
  templateId: string,
): Promise<{
  templateId: string;
  page: string;
  data: Record<string, { value: string }>;
} | null> {
  const course = await resolveCurrentCourse(dbCtx, userId);
  if (!course) return null;

  const [todaySummary, quizStats, wrongCount] = await Promise.all([
    getTodayQueueSummary(dbCtx, userId, course.id),
    getQuizPendingStats(dbCtx, userId, course.id, course.totalQuestions),
    getWrongCount(dbCtx, userId, course.id),
  ]);

  const dueCardCount = todaySummary.dueCards;
  const dueQuizCount = quizStats.pendingCount;
  const hasTasks = dueCardCount > 0 || dueQuizCount > 0 || wrongCount > 0;

  if (!hasTasks) return null;

  const reviewCount = Math.max(0, dueCardCount + dueQuizCount + wrongCount);
  const contentText = truncateText(course.title ? `${course.title} 复习` : "今日复习任务", 20);
  const startTimeText = formatBeijingDateTime(new Date());
  const remarkText = "15分钟内有效，点击查看";

  return {
    templateId,
    page: REMINDER_ENTRY_PAGE,
    data: {
      [REMINDER_TEMPLATE_KEYS.CONTENT]: { value: contentText },
      [REMINDER_TEMPLATE_KEYS.COUNT]: { value: String(reviewCount) },
      [REMINDER_TEMPLATE_KEYS.TIME]: { value: startTimeText },
      [REMINDER_TEMPLATE_KEYS.REMARK]: { value: remarkText },
    },
  };
}

function formatBeijingDateTime(date: Date): string {
  const beijingDate = toBeijingDate(date);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${beijingDate.getFullYear()}-${pad(beijingDate.getMonth() + 1)}-${pad(beijingDate.getDate())} ${pad(beijingDate.getHours())}:${pad(beijingDate.getMinutes())}`;
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength);
}

function hashPayload(payload: unknown): string {
  const data = JSON.stringify(payload);
  return crypto.createHash("sha256").update(data).digest("hex");
}

async function sendWechatSubscribeMessage(
  openid: string,
  payload: { templateId: string; page: string; data: Record<string, { value: string }> },
): Promise<{ resultCode: string; resultMsg: string }> {
  if (!shouldCallWechatApi()) {
    return { resultCode: "SKIPPED", resultMsg: "Skipped in non-production environment" };
  }

  const accessToken = await getAccessToken();
  const url = `${WECHAT_CONSTANTS.SUBSCRIBE_MESSAGE_URL}?access_token=${accessToken}`;

  const response = await retryAsync(
    async () => {
      const { data } = await axios.post<WechatSubscribeResponse>(url, {
        touser: openid,
        template_id: payload.templateId,
        page: payload.page,
        data: payload.data,
        miniprogram_state: config.NODE_ENV === "staging" ? "trial" : "formal",
      });

      if (data.errcode && data.errcode !== 0) {
        throw new Error(`WeChat subscribe error: ${data.errmsg || data.errcode}`);
      }

      return data;
    },
    3,
    200,
  );

  return {
    resultCode: response.errcode ? String(response.errcode) : "OK",
    resultMsg: response.errmsg ?? "OK",
  };
}

function shouldCallWechatApi(): boolean {
  if (config.NODE_ENV !== "production" && config.NODE_ENV !== "staging") {
    return false;
  }
  if (!config.WX_APP_ID || !config.WX_APP_SECRET) {
    return false;
  }
  if (config.WX_APP_ID.startsWith("dummy") || config.WX_APP_SECRET.startsWith("dummy")) {
    return false;
  }
  return true;
}

async function getAccessToken(): Promise<string> {
  if (accessTokenPromise) {
    return accessTokenPromise;
  }

  const now = Date.now();
  if (accessTokenCache && accessTokenCache.expiresAt > now) {
    return accessTokenCache.token;
  }

  accessTokenPromise = (async () => {
    try {
      const url = `${WECHAT_CONSTANTS.GET_ACCESS_TOKEN_URL}?grant_type=client_credential&appid=${config.WX_APP_ID}&secret=${config.WX_APP_SECRET}`;
      const data = await retryAsync(async () => {
        const response = await axios.get<WxAccessTokenResponse>(url);
        if (response.data.errcode || !response.data.access_token || !response.data.expires_in) {
          throw new Error(`WeChat Access Token Error: ${response.data.errmsg || "Invalid response"}`);
        }
        return response.data;
      }, 3, 200);

      const expiresIn = data.expires_in!;
      const accessToken = data.access_token!;
      const expiresAt = now + (expiresIn - 300) * 1000;
      accessTokenCache = { token: accessToken, expiresAt };
      return accessToken;
    } finally {
      accessTokenPromise = null;
    }
  })();

  return accessTokenPromise;
}
