/**
 * Unified Logger (Pino Wrapper)
 *
 * 提供统一的日志接口，生产环境默认关闭debug日志。
 * 设置 LOG_DEBUG=1 可在生产环境开启debug日志。
 */

import pino from 'pino';
import { buildRedactions, parseEnvRedactions } from '../log/redaction';

const isProd = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';
const isTest = process.env.NODE_ENV === 'test';
const enableDebug = !isProd || process.env.LOG_DEBUG === '1';

// Centralized redaction with env override support
const extraRedactions = parseEnvRedactions();

export const logger = pino({
  level: enableDebug ? 'debug' : 'info',
  redact: {
    paths: buildRedactions(extraRedactions),
    remove: true,  // Completely remove sensitive fields
  },
  // 测试环境使用简单JSON输出，生产环境不输出，开发环境尝试使用pino-pretty
  transport: isProd || isTest ? undefined : {
    target: 'pino-pretty',
    options: { singleLine: true }
  }
});

const isErrorLike = (value: unknown): value is Error => value instanceof Error;

const formatLogArgs = (args: unknown[], defaultMessage: string) => {
  if (args.length === 0) {
    return { payload: {}, message: defaultMessage };
  }

  if (args.length === 1) {
    const [first] = args;
    if (isErrorLike(first)) {
      return { payload: { err: first }, message: first.message || defaultMessage };
    }
    if (typeof first === "object") {
      return { payload: first };
    }
    return { payload: { data: [first] }, message: defaultMessage };
  }

  if (args.length === 2) {
    const [first, second] = args;
    if (isErrorLike(first) && typeof second === "string") {
      return { payload: { err: first }, message: second };
    }
    if (typeof first === "string" && isErrorLike(second)) {
      return { payload: { err: second }, message: first };
    }
    if (typeof first === "object" && typeof second === "string") {
      return { payload: first, message: second };
    }
  }

  return { payload: { data: args }, message: defaultMessage };
};

/**
 * 便捷日志方法
 */
export const log = {
  /**
   * Debug级别日志（开发环境默认开启，生产环境默认关闭）
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  debug: (...args: any[]) => {
    if (enableDebug) {
      const { payload, message } = formatLogArgs(args, "debug log");
      if (message) {
        logger.debug(payload, message);
      } else {
        logger.debug(payload);
      }
    }
  },

  /**
   * Info级别日志（所有环境开启）
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  info: (...args: any[]) => {
    const { payload, message } = formatLogArgs(args, "info log");
    if (message) {
      logger.info(payload, message);
    } else {
      logger.info(payload);
    }
  },

  /**
   * Warn级别日志
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  warn: (...args: any[]) => {
    const { payload, message } = formatLogArgs(args, "warn log");
    if (message) {
      logger.warn(payload, message);
    } else {
      logger.warn(payload);
    }
  },

  /**
   * Error级别日志
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error: (...args: any[]) => {
    const { payload, message } = formatLogArgs(args, "error log");
    if (message) {
      logger.error(payload, message);
    } else {
      logger.error(payload);
    }
  },
};
