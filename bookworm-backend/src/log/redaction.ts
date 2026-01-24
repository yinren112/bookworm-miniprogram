// src/log/redaction.ts
// Centralized Pino redaction configuration

/**
 * Default sensitive field paths to redact in logs
 * Using Pino's wildcard syntax: https://getpino.io/#/docs/redaction
 */
export const defaultRedactions = [
  // Authorization headers
  'req.headers.authorization',
  'headers.authorization',
  'res.headers.authorization',

  // Authentication credentials
  'req.body.password',
  'req.body.paySecret',
  'body.password',
  'body.paySecret',
  'body.phoneCode',
  'req.body.phoneCode',

  // User PII
  '*.phone_number',
  '*.phoneNumber',
  '*.customerPhoneNumber',
  '*.openid',
  '*.unionid',
  'user.phone_number',
  'user.openid',
  'user.unionid',

  // Order sensitive data
  '*.pickup_code',
  '*.pickupCode',
  'order.pickup_code',

  // Payment data
  'res.payload.payment.*.cardNumber',
  '*.payment.*.cardNumber',
] as const;

/**
 * Build final redaction paths by merging defaults with environment overrides
 * @param extraPaths - Additional paths from LOG_REDACT_PATHS env var
 * @returns De-duplicated array of paths to redact
 */
export function buildRedactions(extraPaths: string[] = []): string[] {
  const allPaths = [...defaultRedactions, ...extraPaths.filter(Boolean)];
  return Array.from(new Set(allPaths));
}

/**
 * Parse redaction paths from environment variable
 * Format: comma-separated list, e.g., "body.secret,headers.api-key"
 */
export function parseEnvRedactions(): string[] {
  const envPaths = process.env.LOG_REDACT_PATHS || '';
  return envPaths
    .split(',')
    .map(path => path.trim())
    .filter(path => path.length > 0);
}
