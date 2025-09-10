// bookworm-backend/src/tests/paymentService.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generatePaymentParams } from '../services/orderService';
import { prismaMock } from './setup';
import WechatPay from 'wechatpay-node-v3';

// Mock the entire wechatpay-node-v3 library
vi.mock('wechatpay-node-v3');

// Mock the config module
vi.mock('../config', () => ({
  default: {
    wxAppId: 'test_app_id',
    wxPayMchId: 'test_mch_id',
    wxPayPrivateKey: Buffer.from('test_private_key'),
    wxPayCertSerialNo: 'test_serial_no',
    wxPayApiV3Key: 'test_api_v3_key',
    wxPayNotifyUrl: 'https://test.com/notify'
  }
}));

describe('generatePaymentParams', () => {
  let mockPay: WechatPay;
  
  beforeEach(() => {
    // Reset mocks before each test
    vi.resetAllMocks();
    
    // Create a mock WechatPay instance
    mockPay = {
      transactions_jsapi: vi.fn().mockResolvedValue({
        // Mock successful payment params
        timeStamp: '12345',
        nonceStr: 'abcde',
        package: 'prepay_id=xyz',
        signType: 'RSA',
        paySign: 'fghij'
      })
    } as any;
  });

  it('should generate payment parameters for a valid order', async () => {
    // 1. Mock a valid order with orderitems and book data
    const mockOrder = {
      id: 1,
      status: 'PENDING_PAYMENT',
      total_amount: 199.99,
      orderitem: [
        {
          inventory_item_id: 101,
          inventoryitem: {
            booksku: {
              bookmaster: {
                title: 'JavaScript权威指南'
              }
            }
          }
        },
        {
          inventory_item_id: 102,
          inventoryitem: {
            booksku: {
              bookmaster: {
                title: 'Node.js实战'
              }
            }
          }
        }
      ]
    };

    prismaMock.order.findUnique.mockResolvedValue(mockOrder as any);
    
    // 2. Call the function
    const result = await generatePaymentParams(mockPay, 1, 'test-openid');
    
    // 3. Verify the result
    expect(result).toEqual({
      result: {
        timeStamp: '12345',
        nonceStr: 'abcde',
        package: 'prepay_id=xyz',
        signType: 'RSA',
        paySign: 'fghij'
      },
      outTradeNo: 'BOOKWORM_1'
    });

    // 4. Verify the order was queried correctly
    expect(prismaMock.order.findUnique).toHaveBeenCalledWith({
      where: { id: 1 },
      include: {
        orderitem: {
          include: {
            inventoryitem: {
              include: {
                booksku: {
                  include: {
                    bookmaster: true
                  }
                }
              }
            }
          }
        }
      }
    });
  });

  it('should throw an error if the order is not found', async () => {
    // 1. Mock prisma.order.findUnique to return null (order not found)
    prismaMock.order.findUnique.mockResolvedValue(null);
    
    // 2. Call the function and expect it to throw
    await expect(generatePaymentParams(mockPay, 999, 'test-openid')).rejects.toThrow('Order not found');
    
    // 3. Verify that findUnique was called with correct parameters
    expect(prismaMock.order.findUnique).toHaveBeenCalledWith({
      where: { id: 999 },
      include: expect.any(Object)
    });
  });

  it('should throw an error if the order status is not PENDING_PAYMENT', async () => {
    // 1. Mock an order with wrong status
    const mockCompletedOrder = {
      id: 1,
      status: 'COMPLETED',
      total_amount: 199.99,
      orderitem: []
    };

    prismaMock.order.findUnique.mockResolvedValue(mockCompletedOrder as any);
    
    // 2. Call the function and expect it to throw
    await expect(generatePaymentParams(mockPay, 1, 'test-openid')).rejects.toThrow('Order is not in PENDING_PAYMENT status');
    
    // 3. Verify the order was queried
    expect(prismaMock.order.findUnique).toHaveBeenCalledTimes(1);
  });

  it('should throw an error if the WechatPay SDK fails', async () => {
    // 1. Mock a valid order
    const mockOrder = {
      id: 1,
      status: 'PENDING_PAYMENT',
      total_amount: 199.99,
      orderitem: [
        {
          inventory_item_id: 101,
          inventoryitem: {
            booksku: {
              bookmaster: {
                title: 'Test Book'
              }
            }
          }
        }
      ]
    };

    prismaMock.order.findUnique.mockResolvedValue(mockOrder as any);
    
    // 2. Override the mock pay instance to make transactions_jsapi throw an error
    mockPay.transactions_jsapi = vi.fn().mockRejectedValue(new Error('WeChat Pay API error'));
    
    // 3. Call the function and expect it to throw our wrapped error
    await expect(generatePaymentParams(mockPay, 1, 'test-openid')).rejects.toThrow('Failed to generate payment parameters');
    
    // 4. Verify the order was queried
    expect(prismaMock.order.findUnique).toHaveBeenCalledTimes(1);
  });

  it('should handle orders with more than 3 books in description', async () => {
    // Test the description generation logic for orders with many books
    const mockOrderWithManyBooks = {
      id: 1,
      status: 'PENDING_PAYMENT',
      total_amount: 399.99,
      orderitem: [
        {
          inventory_item_id: 101,
          inventoryitem: {
            booksku: {
              bookmaster: {
                title: '书籍1'
              }
            }
          }
        },
        {
          inventory_item_id: 102,
          inventoryitem: {
            booksku: {
              bookmaster: {
                title: '书籍2'
              }
            }
          }
        },
        {
          inventory_item_id: 103,
          inventoryitem: {
            booksku: {
              bookmaster: {
                title: '书籍3'
              }
            }
          }
        },
        {
          inventory_item_id: 104,
          inventoryitem: {
            booksku: {
              bookmaster: {
                title: '书籍4'
              }
            }
          }
        }
      ]
    };

    prismaMock.order.findUnique.mockResolvedValue(mockOrderWithManyBooks as any);
    
    const result = await generatePaymentParams(mockPay, 1, 'test-openid');
    
    expect(result.outTradeNo).toBe('BOOKWORM_1');
    
    // The transactions_jsapi method should have been called
    expect(mockPay.transactions_jsapi).toHaveBeenCalled();
  });

});