// src/lib/logSanitizer.ts
/**
 * 日志脱敏工具
 *
 * 核心原则：默认安全。任何敏感信息在进入日志流前必须脱敏。
 *
 * 敏感字段定义：
 * - phone_number / phoneNumber: 手机号
 * - openid: 微信用户 OpenID
 * - pickup_code / pickupCode: 订单取货码
 * - unionid: 微信 UnionID
 */

/**
 * 脱敏手机号：保留前3位和后4位，中间用 * 替换
 * 示例: 13800138000 -> 138****8000
 */
export function maskPhoneNumber(phone: string | null | undefined): string {
  if (phone === null || phone === undefined) return '[NULL]';
  if (typeof phone !== 'string') return '[INVALID_PHONE]';
  if (phone === '' || phone.length < 7) return '***'; // 空字符串或太短

  return phone.slice(0, 3) + '****' + phone.slice(-4);
}

/**
 * 脱敏 OpenID：仅保留前6个字符
 * 示例: oABC123def456ghi789 -> oABC12***
 */
export function maskOpenId(openid: string | null | undefined): string {
  if (!openid) return '[NULL]';
  if (typeof openid !== 'string') return '[INVALID_OPENID]';
  if (openid.startsWith('placeholder_')) return '[PLACEHOLDER]'; // 临时账户

  return openid.slice(0, 6) + '***';
}

/**
 * 脱敏取货码：完全隐藏（不显示任何字符）
 * 取货码是极度敏感的，任何泄露都可能导致订单被冒领
 */
export function maskPickupCode(code: string | null | undefined): string {
  if (!code) return '[NULL]';
  return '[REDACTED]';
}

/**
 * 脱敏 UnionID：仅保留前6个字符
 */
export function maskUnionId(unionid: string | null | undefined): string {
  if (!unionid) return '[NULL]';
  if (typeof unionid !== 'string') return '[INVALID_UNIONID]';

  return unionid.slice(0, 6) + '***';
}

/**
 * 用户对象脱敏
 * 用于日志输出前清理用户数据
 */
export interface SanitizableUser {
  id?: number;
  phone_number?: string | null;
  openid?: string;
  unionid?: string | null;
  role?: string;
  status?: string;
  [key: string]: unknown;
}

export function sanitizeUser(user: SanitizableUser | null | undefined): Record<string, unknown> {
  if (!user) return { user: '[NULL]' };

  return {
    id: user.id,
    phone_number: user.phone_number ? maskPhoneNumber(user.phone_number) : '[NULL]',
    openid: user.openid ? maskOpenId(user.openid) : '[NULL]',
    unionid: user.unionid ? maskUnionId(user.unionid) : '[NULL]',
    role: user.role,
    status: user.status,
  };
}

/**
 * 订单对象脱敏
 */
export interface SanitizableOrder {
  id?: number;
  pickup_code?: string;
  status?: string;
  total_amount_cents?: number;
  [key: string]: unknown;
}

export function sanitizeOrder(order: SanitizableOrder | null | undefined): Record<string, unknown> {
  if (!order) return { order: '[NULL]' };

  return {
    id: order.id,
    pickup_code: order.pickup_code ? maskPickupCode(order.pickup_code) : '[NULL]',
    status: order.status,
    total_amount_cents: order.total_amount_cents,
  };
}

/**
 * 通用对象脱敏：自动检测并脱敏常见敏感字段
 * 用于脱敏任意对象（如 API 请求体、响应体）
 */
export function sanitizeObject<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  if (!obj || typeof obj !== 'object') return {};

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    // 检测敏感字段名（不区分大小写和下划线/驼峰命名）
    const normalizedKey = key.toLowerCase().replace(/_/g, '');

    if (normalizedKey === 'phonenumber' || normalizedKey === 'phone' || normalizedKey === 'customerphonenumber') {
      sanitized[key] = typeof value === 'string' ? maskPhoneNumber(value) : '[INVALID]';
    } else if (normalizedKey === 'openid') {
      sanitized[key] = typeof value === 'string' ? maskOpenId(value) : '[INVALID]';
    } else if (normalizedKey === 'pickupcode') {
      sanitized[key] = typeof value === 'string' ? maskPickupCode(value) : '[INVALID]';
    } else if (normalizedKey === 'unionid') {
      sanitized[key] = typeof value === 'string' ? maskUnionId(value) : '[INVALID]';
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // 递归处理嵌套对象
      sanitized[key] = sanitizeObject(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}
