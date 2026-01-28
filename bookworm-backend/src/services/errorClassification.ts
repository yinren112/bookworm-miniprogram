// src/services/errorClassification.ts
// Unified error classification service for payment notifications

import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { ApiError, PaymentQueryError } from "../errors";
import { WECHAT_CONSTANTS } from "../constants";

/**
 * Error classification result
 *
 * This structure separates concerns:
 * - HTTP layer (httpStatus, responseCode, responseMessage)
 * - Retry policy (shouldRetry)
 * - Logging policy (logLevel)
 */
export interface ErrorClassification {
  httpStatus: number;
  responseCode: string;
  responseMessage: string;
  shouldRetry: boolean;
  logLevel: 'warn' | 'error';
}

const SECURITY_ERROR_CODES = new Set([
  'TIMESTAMP_INVALID',
  'TIMESTAMP_EXPIRED',
  'SIGNATURE_INVALID',
]);

const TRANSIENT_BUSINESS_CODES = new Set([
  'PAY_TRANSIENT_STATE',
]);

const TRANSIENT_QUERY_CODES = new Set([
  'WECHAT_QUERY_FAILED_TRANSIENT',
]);

const DB_TRANSIENT_CODES = new Set([
  'P1001',
  'P1002',
  'P1008',
]);

function classifyPaymentError(error: unknown): ErrorClassification {
  if (error instanceof ApiError && SECURITY_ERROR_CODES.has(error.code)) {
    const strictMode = process.env.WXPAY_ACK_STRICT === 'true';
    return {
      httpStatus: strictMode ? 400 : 200,
      responseCode: strictMode ? "BAD_REQUEST" : WECHAT_CONSTANTS.SUCCESS_CODE,
      responseMessage: strictMode ? "Security validation failed" : WECHAT_CONSTANTS.SUCCESS_MESSAGE,
      shouldRetry: false,
      logLevel: 'warn',
    };
  }

  if (
    (error instanceof ApiError && TRANSIENT_BUSINESS_CODES.has(error.code)) ||
    (error instanceof PaymentQueryError && TRANSIENT_QUERY_CODES.has(error.code))
  ) {
    return {
      httpStatus: 503,
      responseCode: WECHAT_CONSTANTS.FAIL_CODE,
      responseMessage: WECHAT_CONSTANTS.RETRY_MESSAGE,
      shouldRetry: true,
      logLevel: 'warn',
    };
  }

  if (error instanceof PrismaClientKnownRequestError && DB_TRANSIENT_CODES.has(error.code)) {
    return {
      httpStatus: 503,
      responseCode: WECHAT_CONSTANTS.FAIL_CODE,
      responseMessage: "数据库暂时不可用，请稍后重试",
      shouldRetry: true,
      logLevel: 'error',
    };
  }

  return {
    httpStatus: 200,
    responseCode: WECHAT_CONSTANTS.SUCCESS_CODE,
    responseMessage: WECHAT_CONSTANTS.SUCCESS_MESSAGE,
    shouldRetry: false,
    logLevel: 'warn',
  };
}

/**
 * Payment Error Classification Service
 *
 * Uses Chain of Responsibility pattern to classify errors.
 * Each classifier is tried in order until one handles the error.
 *
 * Usage:
 * ```typescript
 * const classification = paymentErrorClassifier.classify(error);
 * reply.code(classification.httpStatus).send({
 *   code: classification.responseCode,
 *   message: classification.responseMessage,
 * });
 * ```
 */
export class PaymentErrorClassificationService {
  /**
   * Classify an error into HTTP response parameters
   *
   * @param error - Any error thrown during payment notification processing
   * @returns Error classification with HTTP status, response code, and retry policy
   */
  classify(error: unknown): ErrorClassification {
    return classifyPaymentError(error);
  }
}

/**
 * Global singleton instance
 *
 * Linus principle: "Good code has no special cases."
 * Use this single instance everywhere for consistent error classification.
 */
export const paymentErrorClassifier = new PaymentErrorClassificationService();
