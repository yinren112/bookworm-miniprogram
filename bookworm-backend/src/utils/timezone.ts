// src/utils/timezone.ts
// 统一的北京时间 (UTC+8) 工具函数
// 确保所有日期边界计算使用一致的时区

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000; // UTC+8

/**
 * 获取当前北京时间
 */
export function getBeijingNow(): Date {
  const now = new Date();
  return new Date(now.getTime() + BEIJING_OFFSET_MS + now.getTimezoneOffset() * 60 * 1000);
}

/**
 * 获取今天的日期 (北京时间 00:00:00)
 * 返回的 Date 对象表示北京时间当天的开始
 */
export function getBeijingTodayStart(): Date {
  const beijingNow = getBeijingNow();
  return new Date(
    Date.UTC(
      beijingNow.getFullYear(),
      beijingNow.getMonth(),
      beijingNow.getDate(),
      0, 0, 0, 0
    ) - BEIJING_OFFSET_MS
  );
}

/**
 * 获取指定日期的北京时间起始时刻 (00:00:00)
 */
export function getBeijingDateStart(date: Date): Date {
  const beijingDate = toBeijingDate(date);
  return new Date(
    Date.UTC(
      beijingDate.getFullYear(),
      beijingDate.getMonth(),
      beijingDate.getDate(),
      0, 0, 0, 0
    ) - BEIJING_OFFSET_MS
  );
}

/**
 * 获取今天的日期（仅日期部分，用于比较）
 * 返回一个 Date 对象，其 year/month/date 表示北京时间的今天
 */
export function getBeijingToday(): Date {
  const beijingNow = getBeijingNow();
  return new Date(
    beijingNow.getFullYear(),
    beijingNow.getMonth(),
    beijingNow.getDate()
  );
}

/**
 * 获取本周一的日期 (北京时间)
 */
export function getBeijingWeekStart(): Date {
  const today = getBeijingToday();
  const dayOfWeek = today.getDay();
  // 周日为0，需要调整为周一开始
  const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  return new Date(today.getTime() - daysToSubtract * 24 * 60 * 60 * 1000);
}

/**
 * 判断两个日期是否为同一天（北京时间）
 */
export function isSameDayBeijing(date1: Date, date2: Date): boolean {
  // 转换两个日期到北京时间
  const d1 = toBeijingDate(date1);
  const d2 = toBeijingDate(date2);
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

/**
 * 判断 date1 是否是 date2 的前一天（北京时间）
 */
export function isYesterdayBeijing(date1: Date, date2: Date): boolean {
  const d1 = toBeijingDate(date1);
  const d2 = toBeijingDate(date2);
  
  // 获取两个日期的日期部分（忽略时间）
  const day1 = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate()).getTime();
  const day2 = new Date(d2.getFullYear(), d2.getMonth(), d2.getDate()).getTime();
  
  const oneDayMs = 24 * 60 * 60 * 1000;
  return day2 - day1 === oneDayMs;
}

/**
 * 将 UTC 时间转换为北京时间的 Date 对象
 */
export function toBeijingDate(date: Date): Date {
  return new Date(date.getTime() + BEIJING_OFFSET_MS + date.getTimezoneOffset() * 60 * 1000);
}
