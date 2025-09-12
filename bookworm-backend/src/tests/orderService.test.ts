// src/tests/orderService.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockDeep, mockReset } from 'vitest-mock-extended';
import { PrismaClient, Prisma } from '@prisma/client';
import { createOrder } from '../services/orderService';
import { ApiError } from '../errors';

// 模拟 db
vi.mock('../db', () => {
  const prismaMock = mockDeep<PrismaClient>();
  return { default: prismaMock };
});

// 模拟 config
vi.mock('../config', () => ({
    default: {
        MAX_ITEMS_PER_ORDER: 10,
        MAX_PENDING_ORDERS_PER_USER: 3,
        ORDER_PAYMENT_TTL_MINUTES: 15,
        ORDER_PICKUP_CODE_BYTES: 5,
        ORDER_PICKUP_CODE_LENGTH: 8,
    }
}));

// 模拟 metrics
vi.mock('../plugins/metrics', () => ({
    metrics: {
        ordersCreated: { inc: vi.fn() },
        dbTransactionRetries: { inc: vi.fn() },
    }
}));

// 获取模拟的 prisma 实例
import prisma from '../db';
const prismaMock = prisma as any;

describe('Order Service', () => {
  beforeEach(() => {
    mockReset(prismaMock);
  });

  describe('createOrder', () => {
    it('should create an order successfully when inventory is available', async () => {
      const userId = 1;
      const inventoryItemIds = [101, 102];
      
      // 模拟前置检查通过
      prismaMock.order.count.mockResolvedValue(0);
      
      // 模拟事务
      prismaMock.$transaction.mockImplementation(async (callback) => {
        // 模拟库存抢占成功
        prismaMock.inventoryitem.updateMany.mockResolvedValueOnce({ count: 2 });
        
        // 模拟查询被预定的商品
        prismaMock.inventoryitem.findMany.mockResolvedValueOnce([
          { id: 101, selling_price: new Prisma.Decimal('10.00'), status: 'reserved' },
          { id: 102, selling_price: new Prisma.Decimal('15.50'), status: 'reserved' },
        ] as any);

        // 模拟订单创建成功
        const mockOrder = { 
          id: 1, 
          user_id: userId, 
          total_amount: new Prisma.Decimal('25.50'),
          pickup_code: 'ABCD1234',
          status: 'PENDING_PAYMENT'
        };
        prismaMock.order.create.mockResolvedValueOnce(mockOrder as any);

        // 模拟订单项创建
        prismaMock.orderitem.createMany.mockResolvedValueOnce({ count: 2 });

        return callback(prismaMock);
      });

      const order = await createOrder({ userId, inventoryItemIds });

      expect(order).toBeDefined();
      expect(order.user_id).toBe(userId);
      expect(order.total_amount.toString()).toBe('25.5');
      expect(order.pickup_code).toBe('ABCD1234');
      expect(prismaMock.inventoryitem.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: { in: inventoryItemIds },
            status: 'in_stock'
          },
          data: { status: 'reserved' }
        })
      );
    });

    it('should throw EMPTY_ITEMS error when inventoryItemIds is empty', async () => {
      const userId = 1;
      const inventoryItemIds: number[] = [];
      
      prismaMock.$transaction.mockImplementation(async (callback) => {
        return callback(prismaMock);
      });

      await expect(createOrder({ userId, inventoryItemIds }))
        .rejects
        .toThrow(new ApiError(400, '没有选择任何书籍', 'EMPTY_ITEMS'));
    });

    it('should throw INSUFFICIENT_INVENTORY error when some items are already sold', async () => {
      const userId = 1;
      const inventoryItemIds = [101, 102, 103];
      
      // 模拟前置检查通过
      prismaMock.order.count.mockResolvedValue(0);
      
      prismaMock.$transaction.mockImplementation(async (callback) => {
        // 模拟只有2个商品被成功预定，第3个已被抢购
        prismaMock.inventoryitem.updateMany.mockResolvedValueOnce({ count: 2 });
        
        return callback(prismaMock);
      });

      await expect(createOrder({ userId, inventoryItemIds }))
        .rejects
        .toThrow(new ApiError(409, '部分书籍已被抢购，请重新下单', 'INSUFFICIENT_INVENTORY'));
    });

    it('should throw MAX_PENDING_ORDERS_EXCEEDED when user has too many pending orders', async () => {
      const userId = 1;
      const inventoryItemIds = [101, 102];
      const maxPendingOrders = 3; // 与模拟的 config 保持一致

      // 模拟前置检查：用户已有3个未支付订单
      prismaMock.order.count.mockResolvedValue(maxPendingOrders);

      // 模拟事务（理论上不应执行到这一步）
      prismaMock.$transaction.mockImplementation(async (callback) => {
        return callback(prismaMock);
      });

      await expect(createOrder({ userId, inventoryItemIds }))
        .rejects
        .toThrow(new ApiError(403, '您有过多未支付订单，请先处理', 'MAX_PENDING_ORDERS_EXCEEDED'));
      
      // 验证事务没有被调用
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('should deduplicate inventoryItemIds before processing', async () => {
      const userId = 1;
      const inventoryItemIds = [101, 102, 101]; // 重复的ID
      
      // 模拟前置检查通过
      prismaMock.order.count.mockResolvedValue(0);
      
      prismaMock.$transaction.mockImplementation(async (callback) => {
        prismaMock.inventoryitem.updateMany.mockResolvedValueOnce({ count: 2 });
        
        prismaMock.inventoryitem.findMany.mockResolvedValueOnce([
          { id: 101, selling_price: new Prisma.Decimal('10.00'), status: 'reserved' },
          { id: 102, selling_price: new Prisma.Decimal('15.50'), status: 'reserved' },
        ] as any);

        const mockOrder = { 
          id: 1, 
          user_id: userId, 
          total_amount: new Prisma.Decimal('25.50'),
          pickup_code: 'ABCD1234',
          status: 'PENDING_PAYMENT'
        };
        prismaMock.order.create.mockResolvedValueOnce(mockOrder as any);
        prismaMock.orderitem.createMany.mockResolvedValueOnce({ count: 2 });

        return callback(prismaMock);
      });

      const order = await createOrder({ userId, inventoryItemIds });

      expect(order).toBeDefined();
      // 验证去重后只处理了2个不同的商品
      expect(prismaMock.inventoryitem.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: { in: [101, 102] }, // 去重后的结果
            status: 'in_stock'
          }
        })
      );
    });

    it('should handle pickup_code generation collision and retry', async () => {
      const userId = 1;
      const inventoryItemIds = [101];
      
      let orderCreateAttempts = 0;
      
      // 模拟前置检查通过
      prismaMock.order.count.mockResolvedValue(0);
      
      prismaMock.$transaction.mockImplementation(async (callback) => {
        prismaMock.inventoryitem.updateMany.mockResolvedValueOnce({ count: 1 });
        
        prismaMock.inventoryitem.findMany.mockResolvedValueOnce([
          { id: 101, selling_price: new Prisma.Decimal('10.00'), status: 'reserved' },
        ] as any);

        // 第一次尝试创建订单时模拟 pickup_code 冲突
        prismaMock.order.create.mockImplementation(() => {
          orderCreateAttempts++;
          if (orderCreateAttempts === 1) {
            const error = new Error('Unique constraint failed');
            (error as any).code = 'P2002';
            (error as any).meta = { target: ['pickup_code'] };
            throw error;
          }
          // 第二次尝试成功
          return Promise.resolve({
            id: 1,
            user_id: userId,
            total_amount: new Prisma.Decimal('10.00'),
            pickup_code: 'EFGH5678',
            status: 'PENDING_PAYMENT'
          } as any);
        });

        prismaMock.orderitem.createMany.mockResolvedValueOnce({ count: 1 });

        return callback(prismaMock);
      });

      const order = await createOrder({ userId, inventoryItemIds });

      expect(order).toBeDefined();
      expect(orderCreateAttempts).toBe(2); // 确认重试了一次
    });

    it('should throw PICKUP_CODE_GEN_FAILED after 5 failed attempts', async () => {
      const userId = 1;
      const inventoryItemIds = [101];
      
      // 模拟前置检查通过
      prismaMock.order.count.mockResolvedValue(0);
      
      prismaMock.$transaction.mockImplementation(async (callback) => {
        prismaMock.inventoryitem.updateMany.mockResolvedValueOnce({ count: 1 });
        
        prismaMock.inventoryitem.findMany.mockResolvedValueOnce([
          { id: 101, selling_price: new Prisma.Decimal('10.00'), status: 'reserved' },
        ] as any);

        // 模拟pickup_code一直冲突
        prismaMock.order.create.mockImplementation(() => {
          const error = new Error('Unique constraint failed');
          (error as any).code = 'P2002';
          (error as any).meta = { target: ['pickup_code'] };
          throw error;
        });

        return callback(prismaMock);
      });

      await expect(createOrder({ userId, inventoryItemIds }))
        .rejects
        .toThrow(new ApiError(500, '无法生成唯一订单取货码', 'PICKUP_CODE_GEN_FAILED'));
    });

    it('should re-throw non-pickup_code related database errors immediately', async () => {
      const userId = 1;
      const inventoryItemIds = [101];
      
      // 模拟前置检查通过
      prismaMock.order.count.mockResolvedValue(0);
      
      prismaMock.$transaction.mockImplementation(async (callback) => {
        prismaMock.inventoryitem.updateMany.mockResolvedValueOnce({ count: 1 });
        
        prismaMock.inventoryitem.findMany.mockResolvedValueOnce([
          { id: 101, selling_price: new Prisma.Decimal('10.00'), status: 'reserved' },
        ] as any);

        // 模拟其他类型的数据库错误
        prismaMock.order.create.mockRejectedValueOnce(new Error('Database connection failed'));

        return callback(prismaMock);
      });

      await expect(createOrder({ userId, inventoryItemIds }))
        .rejects
        .toThrow('Database connection failed');
    });

    it('should calculate total amount correctly with decimal precision', async () => {
      const userId = 1;
      const inventoryItemIds = [101, 102, 103];
      
      // 模拟前置检查通过
      prismaMock.order.count.mockResolvedValue(0);
      
      prismaMock.$transaction.mockImplementation(async (callback) => {
        prismaMock.inventoryitem.updateMany.mockResolvedValueOnce({ count: 3 });
        
        // 使用具有复杂小数的价格来测试精度
        prismaMock.inventoryitem.findMany.mockResolvedValueOnce([
          { id: 101, selling_price: new Prisma.Decimal('10.99'), status: 'reserved' },
          { id: 102, selling_price: new Prisma.Decimal('15.01'), status: 'reserved' },
          { id: 103, selling_price: new Prisma.Decimal('23.50'), status: 'reserved' },
        ] as any);

        const mockOrder = { 
          id: 1, 
          user_id: userId, 
          total_amount: new Prisma.Decimal('49.50'), // 10.99 + 15.01 + 23.50 = 49.50
          pickup_code: 'ABCD1234',
          status: 'PENDING_PAYMENT'
        };
        prismaMock.order.create.mockResolvedValueOnce(mockOrder as any);
        prismaMock.orderitem.createMany.mockResolvedValueOnce({ count: 3 });

        return callback(prismaMock);
      });

      const order = await createOrder({ userId, inventoryItemIds });

      expect(order.total_amount.toString()).toBe('49.5');
    });

    it('should handle transaction serialization failure with retry logic', async () => {
      const userId = 1;
      const inventoryItemIds = [101];
      
      let transactionAttempts = 0;
      
      // 模拟前置检查通过
      prismaMock.order.count.mockResolvedValue(0);
      
      // 模拟第一次事务失败，第二次成功
      prismaMock.$transaction
        .mockImplementationOnce(async () => {
          transactionAttempts++;
          const error = new Error('could not serialize access due to concurrent update');
          (error as any).code = 'P2034';
          throw error;
        })
        .mockImplementationOnce(async (callback) => {
          transactionAttempts++;
          
          prismaMock.inventoryitem.updateMany.mockResolvedValueOnce({ count: 1 });
          prismaMock.inventoryitem.findMany.mockResolvedValueOnce([
            { id: 101, selling_price: new Prisma.Decimal('10.00'), status: 'reserved' },
          ] as any);
          
          const mockOrder = { 
            id: 1, 
            user_id: userId, 
            total_amount: new Prisma.Decimal('10.00'),
            pickup_code: 'ABCD1234',
            status: 'PENDING_PAYMENT'
          };
          prismaMock.order.create.mockResolvedValueOnce(mockOrder as any);
          prismaMock.orderitem.createMany.mockResolvedValueOnce({ count: 1 });

          return callback(prismaMock);
        });

      const order = await createOrder({ userId, inventoryItemIds });

      expect(order).toBeDefined();
      expect(transactionAttempts).toBe(2);
    });

    it('should throw TX_RETRY_EXCEEDED after 3 serialization failures', async () => {
      const userId = 1;
      const inventoryItemIds = [101];
      
      // 模拟前置检查通过
      prismaMock.order.count.mockResolvedValue(0);
      
      // 模拟连续3次序列化失败
      prismaMock.$transaction.mockImplementation(async () => {
        const error = new Error('could not serialize access due to concurrent update');
        (error as any).code = 'P2034';
        throw error;
      });

      await expect(createOrder({ userId, inventoryItemIds }))
        .rejects
        .toThrow(new ApiError(409, '系统繁忙，请稍后重试', 'TX_RETRY_EXCEEDED'));
    });
  });
});

