// bookworm-backend/src/tests/services/create.integration.test.ts
// Comprehensive integration tests for create.ts module
// Target: 30%+ coverage of order creation logic

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import { PrismaClient } from "@prisma/client";
import { getPrismaClientForWorker } from "../globalSetup";
import { resetDatabase } from "../utils/resetDb";
import { createOrder } from "../../services/orders/create";
import { ApiError } from "../../errors";
import config from "../../config";
import { metrics } from "../../plugins/metrics";

describe("Order Creation Integration Tests", () => {
  let prisma: PrismaClient;
  let testUserId: number;
  let testInventoryItemIds: number[];

  beforeAll(async () => {
    prisma = getPrismaClientForWorker();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);

    // Create test user
    const user = await prisma.user.create({
      data: {
        openid: "test-user-create-openid",
        role: "CUSTOMER",
        status: "REGISTERED",
      },
    });
    testUserId = user.id;

    // Create test inventory items
    const bookMaster = await prisma.bookMaster.create({
      data: {
        isbn13: "9781234567891",
        title: "测试订单教材",
        author: "测试作者",
        publisher: "测试出版社",
        original_price: 100.0,
      },
    });

    const bookSku = await prisma.bookSku.create({
      data: {
        master_id: bookMaster.id,
        edition: "第一版",
        cover_image_url: "https://example.com/cover.jpg",
      },
    });

    // Create 3 available inventory items
    const item1 = await prisma.inventoryItem.create({
      data: {
        sku_id: bookSku.id,
        condition: "GOOD",
        cost: 50.0,
        selling_price: 75.0,
        status: "IN_STOCK",
      },
    });

    const item2 = await prisma.inventoryItem.create({
      data: {
        sku_id: bookSku.id,
        condition: "NEW",
        cost: 60.0,
        selling_price: 85.0,
        status: "IN_STOCK",
      },
    });

    const item3 = await prisma.inventoryItem.create({
      data: {
        sku_id: bookSku.id,
        condition: "ACCEPTABLE",
        cost: 40.0,
        selling_price: 60.0,
        status: "IN_STOCK",
      },
    });

    testInventoryItemIds = [item1.id, item2.id, item3.id];
  });

  describe("createOrder - Happy Path", () => {
    it("should successfully create order with single item", async () => {
      const order = await createOrder(prisma, {
        userId: testUserId,
        inventoryItemIds: [testInventoryItemIds[0]],
      });

      expect(order).toBeDefined();
      expect(order.user_id).toBe(testUserId);
      expect(order.status).toBe("PENDING_PAYMENT");
      expect(order.total_amount).toBe(7500); // 75.0 yuan = 7500 cents
      expect(order.pickup_code).toMatch(/^[A-Z0-9]{10}$/);
      expect(order.paymentExpiresAt).toBeInstanceOf(Date);

      // Verify inventory reserved
      const inventoryItem = await prisma.inventoryItem.findUnique({
        where: { id: testInventoryItemIds[0] },
      });
      expect(inventoryItem?.status).toBe("RESERVED");

      // Verify order items created
      const orderItems = await prisma.orderItem.findMany({
        where: { order_id: order.id },
      });
      expect(orderItems).toHaveLength(1);
      expect(orderItems[0].price).toBe(7500);

      // Verify inventory reservation created
      const reservations = await prisma.inventoryReservation.findMany({
        where: { order_id: order.id },
      });
      expect(reservations).toHaveLength(1);
    });

    it("should successfully create order with multiple items", async () => {
      const order = await createOrder(prisma, {
        userId: testUserId,
        inventoryItemIds: testInventoryItemIds,
      });

      expect(order.total_amount).toBe(7500 + 8500 + 6000); // Sum of selling prices in cents
      expect(order.status).toBe("PENDING_PAYMENT");

      // Verify all items reserved
      const inventoryItems = await prisma.inventoryItem.findMany({
        where: { id: { in: testInventoryItemIds } },
      });
      expect(inventoryItems.every((item) => item.status === "RESERVED")).toBe(true);

      // Verify order items created
      const orderItems = await prisma.orderItem.findMany({
        where: { order_id: order.id },
      });
      expect(orderItems).toHaveLength(3);
    });

    it("should deduplicate inventory item IDs", async () => {
      const duplicatedIds = [testInventoryItemIds[0], testInventoryItemIds[0], testInventoryItemIds[1]];

      const order = await createOrder(prisma, {
        userId: testUserId,
        inventoryItemIds: duplicatedIds,
      });

      // Should only create order for unique items
      const orderItems = await prisma.orderItem.findMany({
        where: { order_id: order.id },
      });
      expect(orderItems).toHaveLength(2);
    });

    it("should create pending payment order record", async () => {
      const order = await createOrder(prisma, {
        userId: testUserId,
        inventoryItemIds: [testInventoryItemIds[0]],
      });

      const pendingPaymentOrder = await prisma.pendingPaymentOrder.findUnique({
        where: {
          user_id_order_id: {
            user_id: testUserId,
            order_id: order.id,
          },
        },
      });

      expect(pendingPaymentOrder).toBeDefined();
    });
  });

  describe("createOrder - Input Validation", () => {
    it("should throw 400 for empty inventory item list", async () => {
      await expect(
        createOrder(prisma, {
          userId: testUserId,
          inventoryItemIds: [],
        })
      ).rejects.toThrow(ApiError);

      await expect(
        createOrder(prisma, {
          userId: testUserId,
          inventoryItemIds: [],
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: "EMPTY_ITEMS",
      });
    });

    it("should throw 400 when exceeding MAX_ITEMS_PER_ORDER", async () => {
      const tooManyItems = Array(config.MAX_ITEMS_PER_ORDER + 1).fill(testInventoryItemIds[0]);

      await expect(
        createOrder(prisma, {
          userId: testUserId,
          inventoryItemIds: tooManyItems,
        })
      ).rejects.toThrow(ApiError);

      await expect(
        createOrder(prisma, {
          userId: testUserId,
          inventoryItemIds: tooManyItems,
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: "ORDER_SIZE_EXCEEDED",
      });
    });
  });

  describe("createOrder - Inventory Validation", () => {
    it("should throw 409 when inventory items are not available", async () => {
      await expect(
        createOrder(prisma, {
          userId: testUserId,
          inventoryItemIds: [99999], // Non-existent ID
        })
      ).rejects.toThrow(ApiError);

      await expect(
        createOrder(prisma, {
          userId: testUserId,
          inventoryItemIds: [99999],
        })
      ).rejects.toMatchObject({
        statusCode: 409,
        code: "INSUFFICIENT_INVENTORY_PRECHECK",
      });
    });

    it("should throw 409 when items are already reserved", async () => {
      // Reserve item by creating first order
      await createOrder(prisma, {
        userId: testUserId,
        inventoryItemIds: [testInventoryItemIds[0]],
      });

      // Try to create second order with same item
      const anotherUser = await prisma.user.create({
        data: {
          openid: "another-user-openid",
          role: "CUSTOMER",
          status: "REGISTERED",
        },
      });

      await expect(
        createOrder(prisma, {
          userId: anotherUser.id,
          inventoryItemIds: [testInventoryItemIds[0]],
        })
      ).rejects.toThrow(ApiError);

      await expect(
        createOrder(prisma, {
          userId: anotherUser.id,
          inventoryItemIds: [testInventoryItemIds[0]],
        })
      ).rejects.toMatchObject({
        statusCode: 409,
        code: "INSUFFICIENT_INVENTORY_PRECHECK",
      });
    });

    it("should throw 409 when partial inventory unavailable", async () => {
      // Reserve one item
      await createOrder(prisma, {
        userId: testUserId,
        inventoryItemIds: [testInventoryItemIds[0]],
      });

      const anotherUser = await prisma.user.create({
        data: {
          openid: "another-user-openid-2",
          role: "CUSTOMER",
          status: "REGISTERED",
        },
      });

      // Try to create order with both reserved and available items
      await expect(
        createOrder(prisma, {
          userId: anotherUser.id,
          inventoryItemIds: [testInventoryItemIds[0], testInventoryItemIds[1]],
        })
      ).rejects.toThrow(ApiError);

      // Verify second item is still available (transaction rolled back)
      const item2 = await prisma.inventoryItem.findUnique({
        where: { id: testInventoryItemIds[1] },
      });
      expect(item2?.status).toBe("IN_STOCK");
    });
  });

  describe("createOrder - User Reservation Limits", () => {
    it("should throw 403 when user exceeds MAX_RESERVED_ITEMS_PER_USER", async () => {
      // Create MAX_RESERVED_ITEMS_PER_USER inventory items
      const bookMaster = await prisma.bookMaster.create({
        data: {
          isbn13: "9781234567892",
          title: "批量测试教材",
          author: "测试作者",
          publisher: "测试出版社",
          original_price: 50.0,
        },
      });

      const bookSku = await prisma.bookSku.create({
        data: {
          master_id: bookMaster.id,
          edition: "第一版",
          cover_image_url: "https://example.com/cover.jpg",
        },
      });

      const manyItemIds: number[] = [];
      for (let i = 0; i < config.MAX_RESERVED_ITEMS_PER_USER; i++) {
        const item = await prisma.inventoryItem.create({
          data: {
            sku_id: bookSku.id,
            condition: "GOOD",
            cost: 20.0,
            selling_price: 30.0,
            status: "IN_STOCK",
          },
        });
        manyItemIds.push(item.id);
      }

      // Create first order with MAX_RESERVED_ITEMS_PER_USER items
      await createOrder(prisma, {
        userId: testUserId,
        inventoryItemIds: manyItemIds,
      });

      // Try to create second order (should fail due to limit)
      await expect(
        createOrder(prisma, {
          userId: testUserId,
          inventoryItemIds: [testInventoryItemIds[0]],
        })
      ).rejects.toThrow(ApiError);

      await expect(
        createOrder(prisma, {
          userId: testUserId,
          inventoryItemIds: [testInventoryItemIds[0]],
        })
      ).rejects.toMatchObject({
        statusCode: 403,
        code: "MAX_RESERVED_ITEMS_EXCEEDED",
      });
    });
  });

  describe("createOrder - Concurrent Order Protection", () => {
    it("should throw 409 when user already has pending payment order", async () => {
      // Create first order
      await createOrder(prisma, {
        userId: testUserId,
        inventoryItemIds: [testInventoryItemIds[0]],
      });

      // Try to create second order while first is still pending
      await expect(
        createOrder(prisma, {
          userId: testUserId,
          inventoryItemIds: [testInventoryItemIds[1]],
        })
      ).rejects.toThrow(ApiError);

      await expect(
        createOrder(prisma, {
          userId: testUserId,
          inventoryItemIds: [testInventoryItemIds[1]],
        })
      ).rejects.toMatchObject({
        statusCode: 409,
        code: "CONCURRENT_PENDING_ORDER",
      });
    });

    it("should allow creating new order after previous order is paid", async () => {
      // Create first order
      const firstOrder = await createOrder(prisma, {
        userId: testUserId,
        inventoryItemIds: [testInventoryItemIds[0]],
      });

      // Mark first order as paid
      await prisma.order.update({
        where: { id: firstOrder.id },
        data: { status: "PENDING_PICKUP", paid_at: new Date() },
      });

      // Delete pending payment order record
      await prisma.pendingPaymentOrder.delete({
        where: {
          user_id_order_id: {
            user_id: testUserId,
            order_id: firstOrder.id,
          },
        },
      });

      // Should be able to create second order
      const secondOrder = await createOrder(prisma, {
        userId: testUserId,
        inventoryItemIds: [testInventoryItemIds[1]],
      });

      expect(secondOrder).toBeDefined();
      expect(secondOrder.id).not.toBe(firstOrder.id);
    });
  });

  describe("createOrder - Transaction Atomicity", () => {
    it("should rollback transaction if order creation fails", async () => {
      // Create item that will cause failure (non-existent mix with valid)
      const invalidItemIds = [testInventoryItemIds[0], 99999];

      const initialItemStatus = await prisma.inventoryItem.findUnique({
        where: { id: testInventoryItemIds[0] },
      });
      expect(initialItemStatus?.status).toBe("IN_STOCK");

      // Try to create order (should fail)
      await expect(
        createOrder(prisma, {
          userId: testUserId,
          inventoryItemIds: invalidItemIds,
        })
      ).rejects.toThrow();

      // Verify inventory status unchanged (transaction rolled back)
      const afterFailStatus = await prisma.inventoryItem.findUnique({
        where: { id: testInventoryItemIds[0] },
      });
      expect(afterFailStatus?.status).toBe("IN_STOCK");

      // Verify no order created
      const orders = await prisma.order.findMany({
        where: { user_id: testUserId },
      });
      expect(orders).toHaveLength(0);
    });
  });

  describe("createOrder - Metrics", () => {
    it("should increment ordersCreated metric on success", async () => {
      const initialMetric = await metrics.ordersCreated.get();
      const initialValue = initialMetric.values[0]?.value || 0;

      await createOrder(prisma, {
        userId: testUserId,
        inventoryItemIds: [testInventoryItemIds[0]],
      });

      const afterMetric = await metrics.ordersCreated.get();
      const afterValue = afterMetric.values[0]?.value || 0;

      expect(afterValue).toBe(initialValue + 1);
    });
  });

  describe("createOrder - Pickup Code Generation", () => {
    it("should generate unique pickup code for each order", async () => {
      const order1 = await createOrder(prisma, {
        userId: testUserId,
        inventoryItemIds: [testInventoryItemIds[0]],
      });

      // Mark first order as paid to allow second order
      await prisma.order.update({
        where: { id: order1.id },
        data: { status: "PENDING_PICKUP", paid_at: new Date() },
      });
      await prisma.pendingPaymentOrder.delete({
        where: {
          user_id_order_id: {
            user_id: testUserId,
            order_id: order1.id,
          },
        },
      });

      const order2 = await createOrder(prisma, {
        userId: testUserId,
        inventoryItemIds: [testInventoryItemIds[1]],
      });

      expect(order1.pickup_code).not.toBe(order2.pickup_code);
      expect(order1.pickup_code).toMatch(/^[A-Z0-9]{10}$/);
      expect(order2.pickup_code).toMatch(/^[A-Z0-9]{10}$/);
    });
  });

  describe("createOrder - Payment Expiration", () => {
    it("should set paymentExpiresAt based on ORDER_PAYMENT_TTL_MINUTES", async () => {
      const beforeCreate = Date.now();

      const order = await createOrder(prisma, {
        userId: testUserId,
        inventoryItemIds: [testInventoryItemIds[0]],
      });

      const afterCreate = Date.now();
      const expiresAt = order.paymentExpiresAt.getTime();

      const expectedMin = beforeCreate + config.ORDER_PAYMENT_TTL_MINUTES * 60 * 1000;
      const expectedMax = afterCreate + config.ORDER_PAYMENT_TTL_MINUTES * 60 * 1000;

      expect(expiresAt).toBeGreaterThanOrEqual(expectedMin);
      expect(expiresAt).toBeLessThanOrEqual(expectedMax);
    });
  });
});
