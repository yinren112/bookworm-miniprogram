// src/tests/errorClassification.test.ts
// Unit tests for Payment Error Classification Service

import { describe, it, expect } from 'vitest';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { PaymentErrorClassificationService } from '../services/errorClassification';
import { ApiError, PaymentQueryError } from '../errors';

describe('PaymentErrorClassificationService', () => {
  const classifier = new PaymentErrorClassificationService();

  describe('Security Validation Errors', () => {
    it('should classify TIMESTAMP_INVALID as security error', () => {
      const error = new ApiError(400, 'Invalid timestamp', 'TIMESTAMP_INVALID');
      const result = classifier.classify(error);

      expect(result.shouldRetry).toBe(false);
      expect(result.logLevel).toBe('warn');
      // Note: httpStatus depends on WXPAY_ACK_STRICT config
    });

    it('should classify TIMESTAMP_EXPIRED as security error', () => {
      const error = new ApiError(400, 'Expired timestamp', 'TIMESTAMP_EXPIRED');
      const result = classifier.classify(error);

      expect(result.shouldRetry).toBe(false);
      expect(result.logLevel).toBe('warn');
    });

    it('should classify SIGNATURE_INVALID as security error', () => {
      const error = new ApiError(400, 'Invalid signature', 'SIGNATURE_INVALID');
      const result = classifier.classify(error);

      expect(result.shouldRetry).toBe(false);
      expect(result.logLevel).toBe('warn');
    });
  });

  describe('Transient Business Errors', () => {
    it('should classify PAY_TRANSIENT_STATE as retryable', () => {
      const error = new ApiError(503, 'Payment in transient state', 'PAY_TRANSIENT_STATE');
      const result = classifier.classify(error);

      expect(result.httpStatus).toBe(503);
      expect(result.shouldRetry).toBe(true);
      expect(result.logLevel).toBe('warn');
      expect(result.responseCode).toBe('FAIL');
    });

    it('should classify WECHAT_QUERY_FAILED_TRANSIENT as retryable', () => {
      const error = new PaymentQueryError('WECHAT_QUERY_FAILED_TRANSIENT');
      const result = classifier.classify(error);

      expect(result.httpStatus).toBe(503);
      expect(result.shouldRetry).toBe(true);
      expect(result.logLevel).toBe('warn');
    });
  });

  describe('Database Transient Errors', () => {
    it('should classify P1001 (connection failed) as retryable', () => {
      const error = new PrismaClientKnownRequestError('Connection failed', {
        code: 'P1001',
        clientVersion: '5.0.0',
      });
      const result = classifier.classify(error);

      expect(result.httpStatus).toBe(503);
      expect(result.shouldRetry).toBe(true);
      expect(result.logLevel).toBe('error');
      expect(result.responseCode).toBe('FAIL');
    });

    it('should classify P1002 (connection timeout) as retryable', () => {
      const error = new PrismaClientKnownRequestError('Connection timeout', {
        code: 'P1002',
        clientVersion: '5.0.0',
      });
      const result = classifier.classify(error);

      expect(result.httpStatus).toBe(503);
      expect(result.shouldRetry).toBe(true);
      expect(result.logLevel).toBe('error');
    });

    it('should classify P1008 (operation timeout) as retryable', () => {
      const error = new PrismaClientKnownRequestError('Operation timeout', {
        code: 'P1008',
        clientVersion: '5.0.0',
      });
      const result = classifier.classify(error);

      expect(result.httpStatus).toBe(503);
      expect(result.shouldRetry).toBe(true);
    });

    it('should NOT classify other Prisma errors as retryable', () => {
      const error = new PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      const result = classifier.classify(error);

      // Should fall through to default classifier
      expect(result.httpStatus).toBe(200);
      expect(result.shouldRetry).toBe(false);
      expect(result.logLevel).toBe('warn');
    });
  });

  describe('Default Classifier (Fallback)', () => {
    it('should classify unknown errors as permanent (no retry)', () => {
      const error = new Error('Some random error');
      const result = classifier.classify(error);

      expect(result.httpStatus).toBe(200);
      expect(result.responseCode).toBe('SUCCESS');
      expect(result.shouldRetry).toBe(false);
      expect(result.logLevel).toBe('warn');
    });

    it('should classify ApiError with unknown code as permanent', () => {
      const error = new ApiError(404, 'Order not found', 'ORDER_NOT_FOUND');
      const result = classifier.classify(error);

      expect(result.httpStatus).toBe(200);
      expect(result.shouldRetry).toBe(false);
    });

    it('should classify string errors as permanent', () => {
      const error = 'Something went wrong';
      const result = classifier.classify(error);

      expect(result.httpStatus).toBe(200);
      expect(result.shouldRetry).toBe(false);
    });

    it('should classify null/undefined as permanent', () => {
      const resultNull = classifier.classify(null);
      const resultUndefined = classifier.classify(undefined);

      expect(resultNull.httpStatus).toBe(200);
      expect(resultNull.shouldRetry).toBe(false);
      expect(resultUndefined.httpStatus).toBe(200);
      expect(resultUndefined.shouldRetry).toBe(false);
    });
  });

  describe('Chain of Responsibility Order', () => {
    it('should process classifiers in correct order', () => {
      // Security errors should be caught before default
      const securityError = new ApiError(400, 'Invalid', 'TIMESTAMP_INVALID');
      const securityResult = classifier.classify(securityError);
      expect(securityResult.shouldRetry).toBe(false);

      // Transient errors should be caught before default
      const transientError = new ApiError(503, 'Transient', 'PAY_TRANSIENT_STATE');
      const transientResult = classifier.classify(transientError);
      expect(transientResult.shouldRetry).toBe(true);

      // Unknown errors should fall through to default
      const unknownError = new ApiError(500, 'Unknown', 'UNKNOWN_CODE');
      const defaultResult = classifier.classify(unknownError);
      expect(defaultResult.shouldRetry).toBe(false);
      expect(defaultResult.httpStatus).toBe(200);
    });
  });

  describe('Error Classification Properties', () => {
    it('should always return valid HTTP status codes', () => {
      const errors = [
        new ApiError(400, 'Invalid', 'TIMESTAMP_INVALID'),
        new PaymentQueryError('WECHAT_QUERY_FAILED_TRANSIENT'),
        new PrismaClientKnownRequestError('Timeout', { code: 'P1008', clientVersion: '5.0.0' }),
        new Error('Random'),
      ];

      errors.forEach(error => {
        const result = classifier.classify(error);
        expect(result.httpStatus).toBeGreaterThanOrEqual(200);
        expect(result.httpStatus).toBeLessThan(600);
      });
    });

    it('should always return valid log levels', () => {
      const errors = [
        new ApiError(400, 'Invalid', 'TIMESTAMP_INVALID'),
        new PaymentQueryError('WECHAT_QUERY_FAILED_TRANSIENT'),
        new Error('Random'),
      ];

      errors.forEach(error => {
        const result = classifier.classify(error);
        expect(['warn', 'error']).toContain(result.logLevel);
      });
    });

    it('should always return non-empty response codes and messages', () => {
      const errors = [
        new ApiError(400, 'Invalid', 'TIMESTAMP_INVALID'),
        new PaymentQueryError('WECHAT_QUERY_FAILED_TRANSIENT'),
        new Error('Random'),
      ];

      errors.forEach(error => {
        const result = classifier.classify(error);
        expect(result.responseCode).toBeTruthy();
        expect(result.responseCode.length).toBeGreaterThan(0);
        expect(result.responseMessage).toBeTruthy();
        expect(result.responseMessage.length).toBeGreaterThan(0);
      });
    });
  });
});
