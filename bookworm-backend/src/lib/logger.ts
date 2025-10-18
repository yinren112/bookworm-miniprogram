/**
 * Unified Logger (Pino Wrapper)
 *
 * 提供统一的日志接口，生产环境默认关闭debug日志。
 * 设置 LOG_DEBUG=1 可在生产环境开启debug日志。
 */

import pino from 'pino';

const isProd = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';
const enableDebug = !isProd || process.env.LOG_DEBUG === '1';

export const logger = pino({
  level: enableDebug ? 'debug' : 'info',
  redact: {
    paths: ['req.headers.authorization', '*.phone', '*.openid', '*.pickupCode'],
    censor: '[REDACTED]'
  },
  // 测试环境使用简单JSON输出，生产环境不输出，开发环境尝试使用pino-pretty
  transport: isProd || isTest ? undefined : {
    target: 'pino-pretty',
    options: { singleLine: true }
  }
});

/**
 * 便捷日志方法
 */
export const log = {
  /**
   * Debug级别日志（开发环境默认开启，生产环境默认关闭）
   */
  debug: (...args: any[]) => {
    if (enableDebug) {
      if (args.length === 1 && typeof args[0] === 'object') {
        logger.debug(args[0]);
      } else if (args.length === 2 && typeof args[0] === 'object' && typeof args[1] === 'string') {
        logger.debug(args[0], args[1]);
      } else {
        logger.debug({ data: args }, 'debug log');
      }
    }
  },

  /**
   * Info级别日志（所有环境开启）
   */
  info: (...args: any[]) => {
    if (args.length === 1 && typeof args[0] === 'object') {
      logger.info(args[0]);
    } else if (args.length === 2 && typeof args[0] === 'object' && typeof args[1] === 'string') {
      logger.info(args[0], args[1]);
    } else {
      logger.info({ data: args }, 'info log');
    }
  },

  /**
   * Warn级别日志
   */
  warn: (...args: any[]) => {
    if (args.length === 1 && typeof args[0] === 'object') {
      logger.warn(args[0]);
    } else if (args.length === 2 && typeof args[0] === 'object' && typeof args[1] === 'string') {
      logger.warn(args[0], args[1]);
    } else {
      logger.warn({ data: args }, 'warn log');
    }
  },

  /**
   * Error级别日志
   */
  error: (...args: any[]) => {
    if (args.length === 1 && typeof args[0] === 'object') {
      logger.error(args[0]);
    } else if (args.length === 2 && typeof args[0] === 'object' && typeof args[1] === 'string') {
      logger.error(args[0], args[1]);
    } else {
      logger.error({ data: args }, 'error log');
    }
  },
};
