// src/utils/timezone.ts
// 统一的北京时间 (UTC+8) 工具函数
// 确保所有日期边界计算使用一致的时区
//
// ## 设计原则
// 1. 所有返回 Date 对象的函数，其时间戳 (getTime()) 均为 **UTC 时间戳**
// 2. "北京时间"指的是日历日期边界（如"今天"/"本周一"）按 UTC+8 计算
// 3. 函数命名中 "Start" 后缀表示返回该时刻的 UTC 时间戳
// 4. 函数命名中 "DateOnly" 后缀表示返回 YYYY-MM-DD 格式字符串

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000; // UTC+8

/**
 * 获取当前时刻对应的"北京时间组件"
 *
 * @returns Date 对象，其 year/month/date/hour 等组件表示北京时间的值
 *
 * @example
 * // 当 UTC 时间为 2026-01-28T16:00:00Z 时
 * // 返回的 Date 对象解析为本地时间时显示 2026-01-29 00:00:00
 * // 但注意：这个 Date 的 getTime() 不是真实的 UTC 时间戳
 *
 * @deprecated 推荐使用 getBeijingTodayStart() 或 getBeijingDateOnlyString() 替代
 *             此函数返回的"伪时间戳"容易导致混淆
 */
export function getBeijingNow(): Date {
  const now = new Date();
  return new Date(now.getTime() + BEIJING_OFFSET_MS + now.getTimezoneOffset() * 60 * 1000);
}

/**
 * 获取北京时间"今天 00:00:00"对应的 **UTC 时间戳**
 *
 * @returns Date 对象，其 getTime() 返回 UTC 时间戳
 *
 * @example
 * // 当北京时间为 2026-01-29 10:30:00 时 (UTC: 2026-01-29 02:30:00)
 * // 返回的 Date 表示 2026-01-28T16:00:00Z (即北京时间 2026-01-29 00:00:00)
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
 * 获取指定 UTC 时间戳对应的北京时间"当天 00:00:00"的 **UTC 时间戳**
 *
 * @param date - 任意 Date 对象（使用其 UTC 时间戳）
 * @returns Date 对象，其 getTime() 返回 UTC 时间戳
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
 * 获取北京时间"今天"的日期组件（仅 year/month/date，时间部分为 00:00:00 本地时间）
 *
 * @returns Date 对象，其 year/month/date 表示北京时间的今天
 *
 * @note 此函数返回的 Date 对象的 getTime() **不是** UTC 时间戳
 *       仅用于提取日期组件进行比较，不要存储到数据库
 *
 * @deprecated 推荐使用 getBeijingDateOnlyString() 替代，返回 YYYY-MM-DD 字符串更清晰
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
 * 获取北京时间"本周一 00:00:00"对应的日期组件
 *
 * @returns Date 对象，其 year/month/date 表示北京时间本周一
 *
 * @note 与 getBeijingToday() 相同，返回的不是 UTC 时间戳
 */
export function getBeijingWeekStart(): Date {
  const today = getBeijingToday();
  const dayOfWeek = today.getDay();
  // 周日为0，需要调整为周一开始
  const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  return new Date(today.getTime() - daysToSubtract * 24 * 60 * 60 * 1000);
}

/**
 * 判断两个 UTC 时间戳是否为同一天（按北京时间日历日期）
 *
 * @param date1 - 第一个 Date 对象
 * @param date2 - 第二个 Date 对象
 * @returns 是否为同一天
 */
export function isSameDayBeijing(date1: Date, date2: Date): boolean {
  const d1 = toBeijingDate(date1);
  const d2 = toBeijingDate(date2);
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

/**
 * 判断 date1 是否是 date2 的前一天（按北京时间日历日期）
 *
 * @param date1 - 较早的 Date 对象
 * @param date2 - 较晚的 Date 对象
 * @returns date1 是否是 date2 的前一天
 */
export function isYesterdayBeijing(date1: Date, date2: Date): boolean {
  const d1 = toBeijingDate(date1);
  const d2 = toBeijingDate(date2);

  const day1 = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate()).getTime();
  const day2 = new Date(d2.getFullYear(), d2.getMonth(), d2.getDate()).getTime();

  const oneDayMs = 24 * 60 * 60 * 1000;
  return day2 - day1 === oneDayMs;
}

/**
 * 将 UTC 时间戳转换为"北京时间组件"Date 对象
 *
 * @param date - 任意 Date 对象
 * @returns Date 对象，其 year/month/date/hour 等组件表示北京时间的值
 *
 * @note 返回的 Date 对象的 getTime() **不是** UTC 时间戳
 *       仅用于提取时间组件
 */
export function toBeijingDate(date: Date): Date {
  return new Date(date.getTime() + BEIJING_OFFSET_MS + date.getTimezoneOffset() * 60 * 1000);
}

// ============================================
// 推荐的新 API：返回类型更明确
// ============================================

/**
 * 获取北京时间"今天"的 YYYY-MM-DD 字符串
 *
 * @returns 格式为 "YYYY-MM-DD" 的字符串
 *
 * @example
 * // 当北京时间为 2026-01-29 10:30:00 时
 * // 返回 "2026-01-29"
 */
export function getBeijingDateOnlyString(): string {
  const d = getBeijingNow();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * 将 UTC 时间戳转换为北京时间的 YYYY-MM-DD 字符串
 *
 * @param date - 任意 Date 对象
 * @returns 格式为 "YYYY-MM-DD" 的字符串
 */
export function toBeijingDateOnlyString(date: Date): string {
  const d = toBeijingDate(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * 获取北京时间"今天 00:00:00"对应的 **UTC 时间戳**（毫秒）
 *
 * @returns UTC 时间戳（毫秒）
 *
 * @note 这是存储到数据库的推荐格式
 */
export function getBeijingTodayStartMs(): number {
  return getBeijingTodayStart().getTime();
}

/**
 * 获取北京时间"本周一 00:00:00"对应的 **UTC 时间戳**（毫秒）
 *
 * @returns UTC 时间戳（毫秒）
 */
export function getBeijingWeekStartMs(): number {
  const weekStart = getBeijingWeekStart();
  return Date.UTC(
    weekStart.getFullYear(),
    weekStart.getMonth(),
    weekStart.getDate(),
    0, 0, 0, 0
  ) - BEIJING_OFFSET_MS;
}
