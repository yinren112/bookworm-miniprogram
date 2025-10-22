// src/services/errorClassification.ts
// Unified error classification service for payment notifications
// Implements Strategy + Chain of Responsibility patterns

import { Prisma } from "@prisma/client";
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

/**
 * Error classifier interface
 *
 * Each classifier handles one specific error category.
 * Follows Single Responsibility Principle.
 */
interface ErrorClassifier {
  canHandle(error: unknown): boolean;
  classify(error: unknown): ErrorClassification;
}

/**
 * Security Validation Error Classifier
 *
 * Handles: TIMESTAMP_INVALID, TIMESTAMP_EXPIRED, SIGNATURE_INVALID
 * Policy: Permanent errors (no retry), but response depends on WXPAY_ACK_STRICT mode
 */
class SecurityValidationErrorClassifier implements ErrorClassifier {
  canHandle(error: unknown): boolean {
    return error instanceof ApiError &&
           ['TIMESTAMP_INVALID', 'TIMESTAMP_EXPIRED', 'SIGNATURE_INVALID'].includes(error.code);
  }

  classify(_: unknown): ErrorClassification {
    const strictMode = process.env.WXPAY_ACK_STRICT === 'true';
    return {
      httpStatus: strictMode ? 400 : 200,
      responseCode: strictMode ? "BAD_REQUEST" : WECHAT_CONSTANTS.SUCCESS_CODE,
      responseMessage: strictMode ? "Security validation failed" : WECHAT_CONSTANTS.SUCCESS_MESSAGE,
      shouldRetry: false, // Permanent error
      logLevel: 'warn',
    };
  }
}

/**
 * Transient Business Error Classifier
 *
 * Handles: PAY_TRANSIENT_STATE, WECHAT_QUERY_FAILED_TRANSIENT
 * Policy: Temporary errors (should retry)
 */
class TransientBusinessErrorClassifier implements ErrorClassifier {
  canHandle(error: unknown): boolean {
    return (error instanceof ApiError && error.code === 'PAY_TRANSIENT_STATE') ||
           (error instanceof PaymentQueryError && error.code === 'WECHAT_QUERY_FAILED_TRANSIENT');
  }

  classify(_: unknown): ErrorClassification {
    return {
      httpStatus: 503,
      responseCode: WECHAT_CONSTANTS.FAIL_CODE,
      responseMessage: WECHAT_CONSTANTS.RETRY_MESSAGE,
      shouldRetry: true,
      logLevel: 'warn',
    };
  }
}

/**
 * Database Transient Error Classifier
 *
 * Handles: P1001 (connection failed), P1002 (timeout), P1008 (operation timeout)
 * Policy: Temporary errors (should retry)
 */
class DatabaseTransientErrorClassifier implements ErrorClassifier {
  private transientCodes = ['P1001', 'P1002', 'P1008'];

  canHandle(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError &&
           this.transientCodes.includes(error.code);
  }

  classify(_: unknown): ErrorClassification {
    return {
      httpStatus: 503,
      responseCode: WECHAT_CONSTANTS.FAIL_CODE,
      responseMessage: "数据库暂时不可用，请稍后重试",
      shouldRetry: true,
      logLevel: 'error',
    };
  }
}

/**
 * Default Error Classifier (Fallback)
 *
 * Handles: All other errors
 * Policy: Treat as permanent errors, return 200 to prevent infinite retries
 */
class DefaultErrorClassifier implements ErrorClassifier {
  canHandle(_: unknown): boolean {
    return true; // Catch-all
  }

  classify(_: unknown): ErrorClassification {
    return {
      httpStatus: 200,
      responseCode: WECHAT_CONSTANTS.SUCCESS_CODE,
      responseMessage: WECHAT_CONSTANTS.SUCCESS_MESSAGE,
      shouldRetry: false, // Permanent error, avoid retry storm
      logLevel: 'warn',
    };
  }
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
  private classifiers: ErrorClassifier[];

  constructor() {
    this.classifiers = [
      new SecurityValidationErrorClassifier(),
      new TransientBusinessErrorClassifier(),
      new DatabaseTransientErrorClassifier(),
      new DefaultErrorClassifier(), // MUST be last (catch-all)
    ];
  }

  /**
   * Classify an error into HTTP response parameters
   *
   * @param error - Any error thrown during payment notification processing
   * @returns Error classification with HTTP status, response code, and retry policy
   */
  classify(error: unknown): ErrorClassification {
    for (const classifier of this.classifiers) {
      if (classifier.canHandle(error)) {
        return classifier.classify(error);
      }
    }

    // Unreachable: DefaultErrorClassifier always handles
    throw new Error('Unreachable: DefaultErrorClassifier should catch all errors');
  }
}

/**
 * Global singleton instance
 *
 * Linus principle: "Good code has no special cases."
 * Use this single instance everywhere for consistent error classification.
 */
export const paymentErrorClassifier = new PaymentErrorClassificationService();
