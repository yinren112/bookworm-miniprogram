// src/tests/concurrent-order-control.integration.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { getPrismaClientForWorker, createTestUser, createTestInventoryItems } from './globalSetup';
import { createOrder } from "../services/orderService";
import { ApiError } from "../errors";

describe("Concurrent Order Control Integration Tests", () => {
  let prisma: any;

  beforeAll(async () => {
    prisma = getPrismaClientForWorker();
  });

  describe("数据库层面：部分唯一索引规则", () => {
    it("应该防止同一用户创建多个PENDING_PAYMENT订单", async () => {
      // 创建测试用户和库存
      const { userId: testUserId } = await createTestUser("USER");
      const testInventoryItemIds = await createTestInventoryItems(10);

      // 第一次创建订单应该成功
      const firstOrder = await createOrder(prisma, {
        userId: testUserId,
        inventoryItemIds: testInventoryItemIds.slice(0, 2),
      });

      expect(firstOrder.status).toBe("PENDING_PAYMENT");
      expect(firstOrder.user_id).toBe(testUserId);

      // Linus式测试：明确系统的行为，而不是"可能是这个或那个"
      // 第二次创建订单应该失败，因为同一用户已有PENDING_PAYMENT订单
      // 系统应该在库存检查前就拒绝（数据库唯一索引或应用层检查）
      await expect(
        createOrder(prisma, {
          userId: testUserId,
          inventoryItemIds: testInventoryItemIds.slice(2, 4),
        })
      ).rejects.toThrow(ApiError);

      // 验证错误码是CONCURRENT_PENDING_ORDER
      // 如果这个断言失败，说明系统行为与预期不符，需要修复代码而不是测试
      try {
        await createOrder(prisma, {
          userId: testUserId,
          inventoryItemIds: testInventoryItemIds.slice(2, 4),
        });
        expect.fail("Expected createOrder to throw an error, but it succeeded");
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).code).toBe("CONCURRENT_PENDING_ORDER");
      }
    });

    it("应该允许不同用户同时创建PENDING_PAYMENT订单", async () => {
      const { userId: testUserA } = await createTestUser("USER");
      const { userId: testUserB } = await createTestUser("USER");
      const testInventoryItemIds = await createTestInventoryItems(10);

      const orderA = await createOrder(prisma, {
        userId: testUserA,
        inventoryItemIds: testInventoryItemIds.slice(0, 2),
      });

      const orderB = await createOrder(prisma, {
        userId: testUserB,
        inventoryItemIds: testInventoryItemIds.slice(2, 4),
      });

      expect(orderA.status).toBe("PENDING_PAYMENT");
      expect(orderB.status).toBe("PENDING_PAYMENT");
      expect(orderA.user_id).toBe(testUserA);
      expect(orderB.user_id).toBe(testUserB);
    });

    it("并发竞争同一库存时应仅一笔成功", async () => {
      const { userId: userA } = await createTestUser("USER");
      const { userId: userB } = await createTestUser("USER");
      const [sharedItemId] = await createTestInventoryItems(1);

      const results = await Promise.allSettled([
        createOrder(prisma, {
          userId: userA,
          inventoryItemIds: [sharedItemId],
        }),
        createOrder(prisma, {
          userId: userB,
          inventoryItemIds: [sharedItemId],
        }),
      ]);

      const successes = results.filter((result) => result.status === "fulfilled");
      const failures = results.filter((result) => result.status === "rejected");

      expect(successes).toHaveLength(1);
      expect((successes[0] as PromiseFulfilledResult<any>).value.status).toBe("PENDING_PAYMENT");
      expect([userA, userB]).toContain((successes[0] as PromiseFulfilledResult<any>).value.user_id);

      expect(failures).toHaveLength(1);
      const failureReason = (failures[0] as PromiseRejectedResult).reason as ApiError;
      expect(failureReason).toBeInstanceOf(ApiError);
      expect(["INVENTORY_RACE_CONDITION", "INSUFFICIENT_INVENTORY_PRECHECK"]).toContain(failureReason.code);
    });

    it("用户订单状态变化后应该能创建新订单", async () => {
      // 创建测试用户和库存
      const { userId: testUserId } = await createTestUser("USER");
      const testInventoryItemIds = await createTestInventoryItems(10);

      // 创建第一个订单
      const firstOrder = await createOrder(prisma, {
        userId: testUserId,
        inventoryItemIds: testInventoryItemIds.slice(0, 2),
      });

      expect(firstOrder.status).toBe("PENDING_PAYMENT");

      // 手动更新订单状态（模拟支付完成或取消）
      await prisma.order.update({
        where: { id: firstOrder.id },
        data: { status: "COMPLETED" },
      });

      // 现在应该能创建新订单
      const secondOrder = await createOrder(prisma, {
        userId: testUserId,
        inventoryItemIds: testInventoryItemIds.slice(2, 4),
      });

      expect(secondOrder.status).toBe("PENDING_PAYMENT");
      expect(secondOrder.id).not.toBe(firstOrder.id);
    });
  });

  describe("应用层面：总库存上限检查", () => {
    it("应该防止用户预留超过上限的商品总数", async () => {
      // 创建测试用户和大量库存
      const { userId: testUserId } = await createTestUser("USER");
      const testInventoryItemIds = await createTestInventoryItems(25); // 超过默认20件上限

      // 尝试创建超过单笔订单上限的订单应该失败 (25 > 10 MAX_ITEMS_PER_ORDER)
      await expect(
        createOrder(prisma, {
          userId: testUserId,
          inventoryItemIds: testInventoryItemIds, // 全部25件
        }),
      ).rejects.toThrow(ApiError);

      // 验证错误类型 - 应该是ORDER_SIZE_EXCEEDED因为25 > MAX_ITEMS_PER_ORDER(10)
      try {
        await createOrder(prisma, {
          userId: testUserId,
          inventoryItemIds: testInventoryItemIds,
        });
        expect.fail("Expected createOrder to throw an error, but it succeeded");
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).code).toBe(
          "ORDER_SIZE_EXCEEDED",
        );
      }
    });

    it("应该通过部分唯一索引防止用户创建多个pending订单", async () => {
      // 创建测试用户和大量库存
      const { userId: testUserId } = await createTestUser("USER");
      const testInventoryItemIds1 = await createTestInventoryItems(10); // 第一批
      const testInventoryItemIds2 = await createTestInventoryItems(10); // 第二批

      // 该测试的目标是验证MAX_RESERVED_ITEMS_PER_USER逻辑
      // 但由于部分唯一索引限制，用户不能同时有多个PENDING_PAYMENT订单
      // 所以我们需要使用不同的策略来测试这个逻辑

      // 策略：创建一个订单正好超过单个订单限制，看它是否被首先拦截
      // 第一个订单：10件 (达到单笔订单上限)
      const firstOrder = await createOrder(prisma, {
        userId: testUserId,
        inventoryItemIds: testInventoryItemIds1, // 10件
      });
      expect(firstOrder.status).toBe("PENDING_PAYMENT");

      // 由于部分唯一索引，用户不能有多个PENDING_PAYMENT订单
      // 所以当我们尝试创建第二个订单时，会直接被CONCURRENT_PENDING_ORDER拦截
      // 这正好证明了部分唯一索引的作用

      // 尝试创建第二个订单，应该被CONCURRENT_PENDING_ORDER拦截
      try {
        await createOrder(prisma, {
          userId: testUserId,
          inventoryItemIds: testInventoryItemIds2.slice(0, 5), // 只要5件，不超过单笔订单限制
        });
        expect.fail("Expected createOrder to throw CONCURRENT_PENDING_ORDER error, but it succeeded");
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        // 应该被CONCURRENT_PENDING_ORDER拦截
        expect((error as ApiError).code).toBe("CONCURRENT_PENDING_ORDER");
      }
    });

    it("应该通过模拟数据测试MAX_RESERVED_ITEMS_PER_USER逻辑", async () => {
      // 由于部分唯一索引的限制，我们无法直接创建多个pending订单来测试MAX_RESERVED_ITEMS_PER_USER
      // 但我们可以通过模拟数据来测试这个逻辑
      const { userId: testUserId } = await createTestUser("USER");
      const testInventoryItemIds = await createTestInventoryItems(25);

      // 直接模拟一个在数据库中已经有pending订单的情况
      // 先创建一个订单用来占用部分库存
      const existingOrder = await prisma.order.create({
        data: {
          user_id: testUserId,
          status: "PENDING_PAYMENT",
          total_amount: 880.0, // 11 * 80
          pickup_code: "TESTCODE",
          paymentExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
        },
      });

      // 创建11个订单项，占用前11个库存项（超过单笔订单上限但我们是直接模拟数据）
      await prisma.orderItem.createMany({
        data: testInventoryItemIds.slice(0, 11).map((itemId, index) => ({
          order_id: existingOrder.id,
          inventory_item_id: itemId,
          price: 80.0,
        })),
      });

      // 更新库存项状态为reserved
      await prisma.inventoryItem.updateMany({
        where: { id: { in: testInventoryItemIds.slice(0, 11) } },
        data: {
          status: "reserved",
        },
      });

      await prisma.inventoryReservation.createMany({
        data: testInventoryItemIds.slice(0, 11).map((itemId) => ({
          inventory_item_id: itemId,
          order_id: existingOrder.id,
        })),
        skipDuplicates: true,
      });

      // 现在用户已经有11件pending的商品
      // 尝试创建一个新的10件订单，总计21件，会超过20件上限
      try {
        await createOrder(prisma, {
          userId: testUserId,
          inventoryItemIds: testInventoryItemIds.slice(11, 21), // 10件，总计 11+10=21 > 20上限
        });
        expect.fail("Expected createOrder to throw MAX_RESERVED_ITEMS_EXCEEDED error, but it succeeded");
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).code).toBe("MAX_RESERVED_ITEMS_EXCEEDED");
      }
    });

    it("应该允许在单笔订单上限内创建订单", async () => {
      // 创建测试用户和库存
      const { userId: testUserId } = await createTestUser("USER");
      const testInventoryItemIds = await createTestInventoryItems(25);

      // 创建在单笔订单上限内的订单应该成功 (10件是MAX_ITEMS_PER_ORDER)
      const order = await createOrder(prisma, {
        userId: testUserId,
        inventoryItemIds: testInventoryItemIds.slice(0, 10), // 10件，在单笔订单上限内
      });

      expect(order.status).toBe("PENDING_PAYMENT");
      expect(order.user_id).toBe(testUserId);

      // 验证订单包含正确数量的商品
      const orderItems = await prisma.orderItem.findMany({
        where: { order_id: order.id },
      });
      expect(orderItems.length).toBe(10);
    });

    it("应该允许在总预留上限内创建多个订单", async () => {
      // 创建测试用户和库存
      const { userId: testUserId } = await createTestUser("USER");
      const testInventoryItemIds1 = await createTestInventoryItems(10);
      const testInventoryItemIds2 = await createTestInventoryItems(10);

      // 创建第一个订单：10件
      const firstOrder = await createOrder(prisma, {
        userId: testUserId,
        inventoryItemIds: testInventoryItemIds1,
      });
      expect(firstOrder.status).toBe("PENDING_PAYMENT");

      // 由于部分唯一索引限制，用户不能有多个PENDING_PAYMENT订单
      // 所以我们完成第一个订单来模拟用户在时间轴上的多个订单
      await prisma.order.update({
        where: { id: firstOrder.id },
        data: { status: "COMPLETED" },
      });

      // 创建第二个订单：也是10件，这次使用新的库存项
      const secondOrder = await createOrder(prisma, {
        userId: testUserId,
        inventoryItemIds: testInventoryItemIds2,
      });
      expect(secondOrder.status).toBe("PENDING_PAYMENT");

      // 验证第二个订单包含正确数量的商品
      const orderItems = await prisma.orderItem.findMany({
        where: { order_id: secondOrder.id },
      });
      expect(orderItems.length).toBe(10);
    });
  });

  describe("双重保护机制协同工作", () => {
    it("两个规则应该独立工作，不互相干扰", async () => {
      // 创建测试用户和库存
      const { userId: testUserId } = await createTestUser("USER");
      const testInventoryItemIds = await createTestInventoryItems(25);

      // 第一个订单：在总量上限内，应该成功
      const firstOrder = await createOrder(prisma, {
        userId: testUserId,
        inventoryItemIds: testInventoryItemIds.slice(0, 10),
      });

      expect(firstOrder.status).toBe("PENDING_PAYMENT");

      // 第二个订单：违反了部分唯一索引（同一用户已有PENDING_PAYMENT订单）
      await expect(
        createOrder(prisma, {
          userId: testUserId,
          inventoryItemIds: testInventoryItemIds.slice(10, 15), // 这会使总数是15，仍在上限内
        }),
      ).rejects.toThrow(ApiError);

      // 完成第一个订单，释放约束
      await prisma.order.update({
        where: { id: firstOrder.id },
        data: { status: "COMPLETED" },
      });

      // 第三个订单：现在数据库约束解除，但如果超过单笔订单上限应该被应用层拦截
      const testInventoryItemIds3 = await createTestInventoryItems(15); // 新的库存项
      await expect(
        createOrder(prisma, {
          userId: testUserId,
          inventoryItemIds: testInventoryItemIds3, // 15件，超过10件单笔订单上限
        }),
      ).rejects.toThrow(ApiError);

      // 验证这是ORDER_SIZE_EXCEEDED错误而不是MAX_RESERVED_ITEMS_EXCEEDED
      try {
        await createOrder(prisma, {
          userId: testUserId,
          inventoryItemIds: testInventoryItemIds3,
        });
        expect.fail("Expected createOrder to throw an error, but it succeeded");
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).code).toBe("ORDER_SIZE_EXCEEDED");
      }

      // 第四个订单：在所有约束内，应该成功
      const testInventoryItemIds4 = await createTestInventoryItems(5); // 新的库存项
      const fourthOrder = await createOrder(prisma, {
        userId: testUserId,
        inventoryItemIds: testInventoryItemIds4, // 5件，在单笔订单上限内
      });

      expect(fourthOrder.status).toBe("PENDING_PAYMENT");
    });
  });

  describe("数据库防线", () => {
    it("超出数据库预留上限时应直接拒绝", async () => {
      const prisma = getPrismaClientForWorker();
      const { userId } = await createTestUser("USER");
      const pickupCode = `TC${Date.now().toString(36).slice(-10)}`.toUpperCase().slice(0, 14);
      const order = await prisma.order.create({
        data: {
          user_id: userId,
          status: "PENDING_PAYMENT",
          total_amount: 0,
          pickup_code: pickupCode,
          paymentExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
        },
      });

      const inventoryItemIds = await createTestInventoryItems(21);

      for (let i = 0; i < 20; i++) {
        await prisma.inventoryItem.update({
          where: { id: inventoryItemIds[i] },
          data: {
            status: "reserved",
          },
        });
        await prisma.inventoryReservation.create({
          data: {
            inventory_item_id: inventoryItemIds[i],
            order_id: order.id,
          },
        });
      }

      await prisma.inventoryItem.update({
        where: { id: inventoryItemIds[20] },
        data: {
          status: "reserved",
        },
      });

      await expect(
        prisma.inventoryReservation.create({
          data: {
            inventory_item_id: inventoryItemIds[20],
            order_id: order.id,
          },
        }),
      ).rejects.toThrow(/MAX_RESERVED_ITEMS_PER_USER/);

      await prisma.order.delete({ where: { id: order.id } }).catch(() => undefined);
      await prisma.inventoryItem.updateMany({
        where: { id: { in: inventoryItemIds } },
        data: {
          status: "in_stock",
        },
      });
      await prisma.inventoryReservation.deleteMany({
        where: { inventory_item_id: { in: inventoryItemIds } },
      });
    });
  });

  describe("边界情况测试", () => {
    it("应该正确处理空商品列表", async () => {
      const { userId: testUserId } = await createTestUser("USER");

      await expect(
        createOrder(prisma, {
          userId: testUserId,
          inventoryItemIds: [], // 空列表
        }),
      ).rejects.toThrow(ApiError);
    });

    it("应该正确处理不存在的商品ID", async () => {
      const { userId: testUserId } = await createTestUser("USER");

      await expect(
        createOrder(prisma, {
          userId: testUserId,
          inventoryItemIds: [99999, 99998], // 不存在的ID
        }),
      ).rejects.toThrow(ApiError);
    });

    it("应该正确处理部分无效的商品ID", async () => {
      const { userId: testUserId } = await createTestUser("USER");
      const testInventoryItemIds = await createTestInventoryItems(5);

      await expect(
        createOrder(prisma, {
          userId: testUserId,
          inventoryItemIds: [testInventoryItemIds[0], 99999], // 一个有效，一个无效
        }),
      ).rejects.toThrow(ApiError);
    });
  });
});
