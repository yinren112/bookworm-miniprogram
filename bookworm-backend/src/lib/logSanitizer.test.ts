// src/lib/logSanitizer.test.ts
import { describe, it, expect } from 'vitest';
import {
  maskPhoneNumber,
  maskOpenId,
  maskPickupCode,
  maskUnionId,
  sanitizeUser,
  sanitizeOrder,
  sanitizeObject,
} from './logSanitizer';

describe('logSanitizer', () => {
  describe('maskPhoneNumber', () => {
    it('should mask middle digits of phone number', () => {
      expect(maskPhoneNumber('13800138000')).toBe('138****8000');
      expect(maskPhoneNumber('18612345678')).toBe('186****5678');
    });

    it('should handle null and undefined', () => {
      expect(maskPhoneNumber(null)).toBe('[NULL]');
      expect(maskPhoneNumber(undefined)).toBe('[NULL]');
    });

    it('should handle invalid phone numbers', () => {
      expect(maskPhoneNumber('123')).toBe('***'); // Too short
      expect(maskPhoneNumber('')).toBe('***');
    });
  });

  describe('maskOpenId', () => {
    it('should mask openid keeping only first 6 chars', () => {
      expect(maskOpenId('oABC123def456ghi789')).toBe('oABC12***');
      expect(maskOpenId('wx_test_openid_123456')).toBe('wx_tes***');
    });

    it('should handle placeholder openids', () => {
      expect(maskOpenId('placeholder_13800138000_1234567890')).toBe('[PLACEHOLDER]');
    });

    it('should handle null and undefined', () => {
      expect(maskOpenId(null)).toBe('[NULL]');
      expect(maskOpenId(undefined)).toBe('[NULL]');
    });
  });

  describe('maskPickupCode', () => {
    it('should completely hide pickup code', () => {
      expect(maskPickupCode('ABCD1234')).toBe('[REDACTED]');
      expect(maskPickupCode('XYZ789')).toBe('[REDACTED]');
    });

    it('should handle null and undefined', () => {
      expect(maskPickupCode(null)).toBe('[NULL]');
      expect(maskPickupCode(undefined)).toBe('[NULL]');
    });
  });

  describe('maskUnionId', () => {
    it('should mask unionid keeping only first 6 chars', () => {
      expect(maskUnionId('o6_bmjrPTlm6_2sgVt7hMZOPfL2M')).toBe('o6_bmj***');
    });

    it('should handle null and undefined', () => {
      expect(maskUnionId(null)).toBe('[NULL]');
      expect(maskUnionId(undefined)).toBe('[NULL]');
    });
  });

  describe('sanitizeUser', () => {
    it('should sanitize all sensitive user fields', () => {
      const user = {
        id: 123,
        phone_number: '13800138000',
        openid: 'oABC123def456',
        unionid: 'o6_bmjrPTlm6',
        role: 'USER',
        status: 'REGISTERED',
      };

      const sanitized = sanitizeUser(user);

      expect(sanitized).toEqual({
        id: 123,
        phone_number: '138****8000',
        openid: 'oABC12***',
        unionid: 'o6_bmj***',
        role: 'USER',
        status: 'REGISTERED',
      });
    });

    it('should handle users with null phone number', () => {
      const user = {
        id: 456,
        phone_number: null,
        openid: 'wx_test',
        role: 'STAFF',
      };

      const sanitized = sanitizeUser(user);

      expect(sanitized.phone_number).toBe('[NULL]');
      expect(sanitized.openid).toBe('wx_tes***');
    });

    it('should handle null user', () => {
      expect(sanitizeUser(null)).toEqual({ user: '[NULL]' });
      expect(sanitizeUser(undefined)).toEqual({ user: '[NULL]' });
    });
  });

  describe('sanitizeOrder', () => {
    it('should sanitize pickup code', () => {
      const order = {
        id: 789,
        pickup_code: 'SECRET123',
        status: 'pending_pickup',
        total_amount_cents: 5000,
      };

      const sanitized = sanitizeOrder(order);

      expect(sanitized).toEqual({
        id: 789,
        pickup_code: '[REDACTED]',
        status: 'pending_pickup',
        total_amount_cents: 5000,
      });
    });

    it('should handle null order', () => {
      expect(sanitizeOrder(null)).toEqual({ order: '[NULL]' });
    });
  });

  describe('sanitizeObject', () => {
    it('should auto-detect and sanitize sensitive fields', () => {
      const obj = {
        userId: 123,
        phoneNumber: '13800138000',
        openid: 'oABC123',
        name: 'Test User',
      };

      const sanitized = sanitizeObject(obj);

      expect(sanitized).toEqual({
        userId: 123,
        phoneNumber: '138****8000',
        openid: 'oABC12***',
        name: 'Test User',
      });
    });

    it('should handle snake_case field names', () => {
      const obj = {
        user_id: 456,
        phone_number: '18612345678',
        pickup_code: 'CODE123',
      };

      const sanitized = sanitizeObject(obj);

      expect(sanitized.phone_number).toBe('186****5678');
      expect(sanitized.pickup_code).toBe('[REDACTED]');
    });

    it('should recursively sanitize nested objects', () => {
      const obj = {
        user: {
          id: 789,
          phoneNumber: '13800138000',
        },
        order: {
          pickupCode: 'SECRET',
        },
      };

      const sanitized = sanitizeObject(obj);

      expect(sanitized).toEqual({
        user: {
          id: 789,
          phoneNumber: '138****8000',
        },
        order: {
          pickupCode: '[REDACTED]',
        },
      });
    });

    it('should handle customerPhoneNumber field', () => {
      const obj = {
        customerPhoneNumber: '13900139000',
        totalAmount: 1000,
      };

      const sanitized = sanitizeObject(obj);

      expect(sanitized.customerPhoneNumber).toBe('139****9000');
      expect(sanitized.totalAmount).toBe(1000);
    });

    it('should preserve non-sensitive fields', () => {
      const obj = {
        id: 999,
        name: 'Test',
        email: 'test@example.com',
        amount: 5000,
        items: ['item1', 'item2'],
      };

      const sanitized = sanitizeObject(obj);

      expect(sanitized).toEqual(obj);
    });
  });
});
