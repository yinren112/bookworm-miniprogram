// src/tests/orderService.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import { PrismaClient, Prisma } from "@prisma/client";
import { createOrder } from "../services/orderService";
import { ApiError } from "../errors";
import {
  setupDefaultCreateOrderMocks,
  createMockInventoryItems,
  createMockOrder,
} from "./test-helpers/orderService.helper";
import {
  createPickupCodeConstraintError,
  createPrismaSerializationError
} from "./test-helpers/errorHelpers";

// 模拟 db
vi.mock("../db", () => {
  const prismaMock = mockDeep<PrismaClient>();
  return { default: prismaMock };
});

// 模拟 config
vi.mock("../config", () => ({
  default: {
    MAX_ITEMS_PER_ORDER: 10,
    MAX_RESERVED_ITEMS_PER_USER: 20,
    ORDER_PAYMENT_TTL_MINUTES: 15,
    ORDER_PICKUP_CODE_BYTES: 5,
    ORDER_PICKUP_CODE_LENGTH: 8,
    DB_TRANSACTION_RETRY_COUNT: 3,
    DB_TRANSACTION_RETRY_BASE_DELAY_MS: 20,
    DB_TRANSACTION_RETRY_JITTER_MS: 40,
    PICKUP_CODE_RETRY_COUNT: 5,
  },
}));

// 模拟 metrics
vi.mock("../plugins/metrics", () => ({
  metrics: {
    ordersCreated: { inc: vi.fn() },
    dbTransactionRetries: { inc: vi.fn() },
  },
}));

// 获取模拟的 prisma 实例
import prisma from "../db";
const prismaMock = prisma as any;

describe("Order Service", () => {
  beforeEach(() => {
    mockReset(prismaMock);
    setupDefaultCreateOrderMocks(prismaMock);
  });

  describe("createOrder", () => {
    it("should create an order successfully when inventory is available", async () => {
      const userId = 1;
      const inventoryItemIds = [101, 102];

      // Mock direct database calls (no transaction wrapper)
      // Mock要预留的商品查询
      prismaMock.inventoryItem.findMany.mockResolvedValueOnce(
        createMockInventoryItems([
          { id: 101, price: "10.00" },
          { id: 102, price: "15.50" },
        ]),
      );
      // Mock现有预留商品检查 - 确保返回空数组
      prismaMock.order.findMany.mockResolvedValueOnce([]);
      prismaMock.order.create.mockResolvedValueOnce(
        createMockOrder({ user_id: userId, total_amount: "25.50" }),
      );
      prismaMock.inventoryItem.updateMany.mockResolvedValueOnce({ count: 2 });
      prismaMock.orderItem.createMany.mockResolvedValueOnce({ count: 2 });

      const order = await createOrder(prismaMock, { userId, inventoryItemIds });

      expect(order).toBeDefined();
      expect(order.user_id).toBe(userId);
      expect(order.total_amount.toString()).toBe("25.5");
      expect(order.pickup_code).toBe("ABCD1234");
      expect(prismaMock.inventoryItem.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: { in: inventoryItemIds },
            status: "in_stock",
          },
          data: {
            status: "reserved",
            reserved_by_order_id: expect.any(Number),
          },
        }),
      );
    });

    it("should throw EMPTY_ITEMS error when inventoryItemIds is empty", async () => {
      const userId = 1;
      const inventoryItemIds: number[] = [];

      await expect(createOrder(prismaMock, { userId, inventoryItemIds })).rejects.toThrow(
        new ApiError(400, "没有选择任何书籍", "EMPTY_ITEMS"),
      );
    });

    it("should throw INSUFFICIENT_INVENTORY error when some items are already sold", async () => {
      const userId = 1;
      const inventoryItemIds = [101, 102, 103];

      // Mock只有2个可用商品，第3个已被抢购
      prismaMock.inventoryItem.findMany.mockResolvedValueOnce(
        createMockInventoryItems([
          { id: 101, price: "10.50" },
          { id: 102, price: "15.00" },
        ]),
      );

      await expect(createOrder(prismaMock, { userId, inventoryItemIds })).rejects.toThrow(
        new ApiError(
          409,
          "部分书籍已不可用，请刷新后重试",
          "INSUFFICIENT_INVENTORY_PRECHECK",
        ),
      );
    });

    it("should throw MAX_RESERVED_ITEMS_EXCEEDED when user has too many reserved items", async () => {
      const userId = 1;
      const inventoryItemIds = [101, 102];

      prismaMock.inventoryItem.findMany.mockResolvedValueOnce(
        createMockInventoryItems([
          { id: 101, price: "10.00" },
          { id: 102, price: "15.50" },
        ]),
      );

      // Mock现有预留商品检查 - 返回19件已预留，再加2件就超过20件限制
      prismaMock.order.findMany.mockResolvedValueOnce([
        { _count: { orderItem: 10 } },
        { _count: { orderItem: 9 } },
      ] as any);

      await expect(createOrder(prismaMock, { userId, inventoryItemIds })).rejects.toThrow(
        new ApiError(
          403,
          "您预留的商品总数已达上限(20件)，请先完成或取消部分订单",
          "MAX_RESERVED_ITEMS_EXCEEDED",
        ),
      );
    });

    it("should deduplicate inventoryItemIds before processing", async () => {
      const userId = 1;
      const inventoryItemIds = [101, 102, 101]; // 重复的ID

      prismaMock.inventoryItem.findMany.mockResolvedValueOnce(
        createMockInventoryItems([
          { id: 101, price: "10.00" },
          { id: 102, price: "15.50" },
        ]),
      );
      prismaMock.order.findMany.mockResolvedValueOnce([]);
      prismaMock.order.create.mockResolvedValueOnce(
        createMockOrder({ user_id: userId, total_amount: "25.50" }),
      );
      prismaMock.inventoryItem.updateMany.mockResolvedValueOnce({ count: 2 });
      prismaMock.orderItem.createMany.mockResolvedValueOnce({ count: 2 });

      const order = await createOrder(prismaMock, { userId, inventoryItemIds });

      expect(order).toBeDefined();
      // 验证去重后只处理了2个不同的商品
      expect(prismaMock.inventoryItem.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: { in: [101, 102] }, // 去重后的结果
            status: "in_stock",
          },
        }),
      );
    });

    it("should handle pickup_code generation collision and retry", async () => {
      const userId = 1;
      const inventoryItemIds = [101];

      let orderCreateAttempts = 0;

      prismaMock.inventoryItem.findMany.mockResolvedValueOnce(
        createMockInventoryItems([{ id: 101, price: "10.00" }]),
      );
      prismaMock.order.findMany.mockResolvedValueOnce([]);

      // Mock pickup_code冲突后重试
      prismaMock.order.create.mockImplementation(() => {
        orderCreateAttempts++;
        if (orderCreateAttempts === 1) {
          throw createPickupCodeConstraintError();
        }
        return Promise.resolve(
          createMockOrder({
            user_id: userId,
            total_amount: "10.00",
            pickup_code: "EFGH5678",
          }),
        );
      });

      prismaMock.inventoryItem.updateMany.mockResolvedValueOnce({ count: 1 });
      prismaMock.orderItem.createMany.mockResolvedValueOnce({ count: 1 });

      const order = await createOrder(prismaMock, { userId, inventoryItemIds });

      expect(order).toBeDefined();
      expect(orderCreateAttempts).toBe(2); // 确认重试了一次
    });

    it("should throw PICKUP_CODE_GEN_FAILED after 5 failed attempts", async () => {
      const userId = 1;
      const inventoryItemIds = [101];

      prismaMock.inventoryItem.findMany.mockResolvedValueOnce(
        createMockInventoryItems([{ id: 101, price: "10.00" }]),
      );
      prismaMock.order.findMany.mockResolvedValueOnce([]);

      // Mock pickup_code一直冲突
      prismaMock.order.create.mockImplementation(() => {
        throw createPickupCodeConstraintError();
      });

      await expect(createOrder(prismaMock, { userId, inventoryItemIds })).rejects.toThrow(
        new ApiError(500, "无法生成唯一订单取货码", "PICKUP_CODE_GEN_FAILED"),
      );
    });

    it("should re-throw non-pickup_code related database errors immediately", async () => {
      const userId = 1;
      const inventoryItemIds = [101];

      prismaMock.inventoryItem.findMany.mockResolvedValueOnce(
        createMockInventoryItems([{ id: 101, price: "10.00" }]),
      );
      prismaMock.order.findMany.mockResolvedValueOnce([]);

      prismaMock.order.create.mockRejectedValueOnce(
        new Error("Database connection failed"),
      );

      await expect(createOrder(prismaMock, { userId, inventoryItemIds })).rejects.toThrow(
        "Database connection failed",
      );
    });

    it("should calculate total amount correctly with decimal precision", async () => {
      const userId = 1;
      const inventoryItemIds = [101, 102, 103];

      prismaMock.inventoryItem.findMany.mockResolvedValueOnce(
        createMockInventoryItems([
          { id: 101, price: "10.99" },
          { id: 102, price: "15.01" },
          { id: 103, price: "23.50" },
        ]),
      );
      prismaMock.order.findMany.mockResolvedValueOnce([]);
      prismaMock.order.create.mockResolvedValueOnce(
        createMockOrder({ user_id: userId, total_amount: "49.50" }),
      );
      prismaMock.inventoryItem.updateMany.mockResolvedValueOnce({ count: 3 });
      prismaMock.orderItem.createMany.mockResolvedValueOnce({ count: 3 });

      const order = await createOrder(prismaMock, { userId, inventoryItemIds });

      expect(order.total_amount.toString()).toBe("49.5");
    });

    it("should handle transaction serialization failure with retry logic", async () => {
      const userId = 1;
      const inventoryItemIds = [101];

      let callCount = 0;

      // Mock createOrder to fail once with serialization error, then succeed
      const originalCreateOrder = createOrder;

      // Mock serialization error on first call, success on second
      prismaMock.inventoryItem.findMany
        .mockRejectedValueOnce((() => {
          callCount++;
          return createPrismaSerializationError();
        })())
        .mockResolvedValueOnce(
          createMockInventoryItems([{ id: 101, price: "10.00" }]),
        );

      prismaMock.order.findMany.mockResolvedValueOnce([]);
      prismaMock.order.create.mockResolvedValueOnce(
        createMockOrder({ user_id: userId, total_amount: "10.00" }),
      );
      prismaMock.inventoryItem.updateMany.mockResolvedValueOnce({ count: 1 });
      prismaMock.orderItem.createMany.mockResolvedValueOnce({ count: 1 });

      const order = await createOrder(prismaMock, { userId, inventoryItemIds });

      expect(order).toBeDefined();
    });

    it("should throw TX_RETRY_EXCEEDED after 3 serialization failures", async () => {
      const userId = 1;
      const inventoryItemIds = [101];

      // Mock连续3次序列化失败
      prismaMock.inventoryItem.findMany.mockImplementation(async () => {
        throw createPrismaSerializationError();
      });

      await expect(createOrder(prismaMock, { userId, inventoryItemIds })).rejects.toThrow(
        new ApiError(409, "系统繁忙，请稍后重试", "TX_RETRY_EXCEEDED"),
      );
    });
  });
});
