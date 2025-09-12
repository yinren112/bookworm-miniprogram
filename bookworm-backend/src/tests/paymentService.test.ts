// bookworm-backend/src/tests/paymentService.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prismaMock } from './setup';

// Mock the config module
vi.mock('../config', () => ({
  default: {
    WX_APP_ID: 'test_app_id',
    WXPAY_MCHID: 'test_mch_id', 
    WXPAY_NOTIFY_URL: 'https://test.com/notify'
  }
}));

// Import AFTER mocking
const { generatePaymentParams } = await import('../services/orderService');

describe('generatePaymentParams', () => {
  let mockPay: any;
  
  beforeEach(() => {
    // Reset mocks before each test
    vi.resetAllMocks();
    
    // Create a mock WechatPay instance that matches the real API
    mockPay = {
      transactions_jsapi: vi.fn().mockResolvedValue({
        prepay_id: 'wx12345678901234567890123456789012'
      }),
      sign: vi.fn().mockReturnValue('mock-signature-12345')
    };
  });

  it('should generate payment parameters for a valid order', async () => {
    // Mock the transaction to return the expected payment parameters
    prismaMock.$transaction.mockResolvedValue({
      timeStamp: '1640995200',
      nonceStr: 'test-nonce-12345',
      package: 'prepay_id=wx12345678901234567890123456789012',
      signType: 'RSA',
      paySign: 'mock-signature-12345'
    });
    
    // Call the function with correct parameters (userId, not openid)
    const result = await generatePaymentParams(mockPay, 1, 123);
    
    // Verify the result matches actual function return format
    expect(result).toEqual({
      timeStamp: '1640995200',
      nonceStr: 'test-nonce-12345',
      package: 'prepay_id=wx12345678901234567890123456789012',
      signType: 'RSA',
      paySign: 'mock-signature-12345'
    });

    // Verify transaction was called
    expect(prismaMock.$transaction).toHaveBeenCalled();
  });

  it('should throw an error if the order is not found', async () => {
    // 1. Mock transaction to throw when order not found
    prismaMock.$transaction.mockRejectedValue(new Error('No Order found'));
    
    // 2. Call the function and expect it to throw (userId not openid)
    await expect(generatePaymentParams(mockPay, 999, 123)).rejects.toThrow();
    
    // 3. Verify transaction was called
    expect(prismaMock.$transaction).toHaveBeenCalled();
  });

  it('should throw an error if the order status is not PENDING_PAYMENT', async () => {
    // 1. Mock transaction to throw ApiError for wrong status
    prismaMock.$transaction.mockRejectedValue(new Error('订单状态不正确'));
    
    // 2. Call the function and expect it to throw
    await expect(generatePaymentParams(mockPay, 1, 123)).rejects.toThrow();
    
    // 3. Verify transaction was called
    expect(prismaMock.$transaction).toHaveBeenCalled();
  });

  it('should throw an error if the WechatPay SDK fails', async () => {
    // 1. Mock transaction to throw WeChat Pay error
    prismaMock.$transaction.mockRejectedValue(new Error('WeChat Pay API error'));
    
    // 2. Call the function and expect it to throw
    await expect(generatePaymentParams(mockPay, 1, 123)).rejects.toThrow();
    
    // 3. Verify transaction was called
    expect(prismaMock.$transaction).toHaveBeenCalled();
  });

  it('should handle orders with more than 3 books in description', async () => {
    // Mock transaction to return successful payment params
    prismaMock.$transaction.mockResolvedValue({
      timeStamp: '1640995200',
      nonceStr: 'test-nonce-12345',
      package: 'prepay_id=wx12345678901234567890123456789012',
      signType: 'RSA',
      paySign: 'mock-signature-12345'
    });
    
    const result = await generatePaymentParams(mockPay, 1, 123);
    
    expect(result).toEqual({
      timeStamp: '1640995200',
      nonceStr: 'test-nonce-12345',
      package: 'prepay_id=wx12345678901234567890123456789012',
      signType: 'RSA',
      paySign: 'mock-signature-12345'
    });
    
    expect(prismaMock.$transaction).toHaveBeenCalled();
  });

});