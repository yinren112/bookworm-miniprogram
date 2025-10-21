import { describe, it, expect, beforeAll } from "vitest";
import { Prisma, PrismaClient, OrderStatus, OrderType, SettlementType } from "@prisma/client";
import { getPrismaClientForWorker, createTestUser, createTestInventoryItems } from "./globalSetup";
import { withTxRetry } from "../db/transaction";

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("Database-level Business Rules", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = getPrismaClientForWorker();
  });

  describe("withTxRetry", () => {
    it("retries deterministically on serialization conflicts", async () => {
      const [itemId] = await createTestInventoryItems(1);
      let attempts = 0;

      const lockGate = createDeferred<void>();
      const lockReady = createDeferred<void>();

      const lockingTransaction = prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM "inventoryitem" WHERE id = ${itemId} FOR UPDATE`;
        lockReady.resolve();
        await lockGate.promise;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

      await lockReady.promise;

      const retriedUpdate = withTxRetry(
        prisma,
        async (tx) => {
          attempts += 1;
          await tx.$queryRaw`SELECT 1 FROM "inventoryitem" WHERE id = ${itemId} FOR UPDATE NOWAIT`;
          return tx.inventoryItem.update({
            where: { id: itemId },
            data: { cost: 2222 },
          });
        },
        { maxRetries: 3, baseDelayMs: 5, jitter: false },
      );

      setTimeout(() => lockGate.resolve(), 50);

      const [, retryResult] = await Promise.allSettled([lockingTransaction, retriedUpdate]);

      expect(retryResult.status).toBe("fulfilled");
      expect(attempts).toBeGreaterThan(1);

      const finalRecord = await prisma.inventoryItem.findUnique({ where: { id: itemId } });
      expect(finalRecord).not.toBeNull();
      expect(Number(finalRecord!.cost)).toBe(2222);
    });

    it("does not retry for non-retryable errors", async () => {
      const dupOpenId = `dup-${Date.now()}`;
      await prisma.user.create({
        data: {
          openid: dupOpenId,
        },
      });

      let attempts = 0;

      await expect(
        withTxRetry(
          prisma,
          async (tx) => {
            attempts += 1;
            await tx.user.create({
              data: {
                openid: dupOpenId,
              },
            });
          },
          { maxRetries: 3, baseDelayMs: 5, jitter: false },
        ),
      ).rejects.toMatchObject({ code: "P2002" });

      expect(attempts).toBe(1);
    });
  });

  it("should enforce MAX_RESERVED_ITEMS_PER_USER via trigger using custom setting", async () => {
    const { userId } = await createTestUser();
    const itemIds = await createTestInventoryItems(4);
    const baseExpire = new Date(Date.now() + 60 * 60 * 1000);

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL bookworm.max_reserved_items_per_user = '3'");

        const orderIds: number[] = [];
        for (let i = 0; i < 4; i++) {
          const order = await tx.order.create({
            data: {
              user_id: userId,
              status: OrderStatus.COMPLETED,
              total_amount: 100,
              pickup_code: "DBRULE" + i.toString().padStart(2, "0"),
              paymentExpiresAt: baseExpire,
            },
          });
          orderIds.push(order.id);
        }

        for (let i = 0; i < 3; i++) {
          await tx.inventoryReservation.create({
            data: {
              inventory_item_id: itemIds[i],
              order_id: orderIds[i],
            },
          });
        }

        await tx.inventoryReservation.create({
          data: {
            inventory_item_id: itemIds[3],
            order_id: orderIds[3],
          },
        });
      })
    ).rejects.toThrow(/MAX_RESERVED_ITEMS_PER_USER/);
  });

  describe("Order type consistency check", () => {
    const futureDate = () => new Date(Date.now() + 60 * 60 * 1000);
    const uniquePickup = (label: string) => {
      const suffix = (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)).toUpperCase();
      const base = `${label}${suffix}`;
      return base.slice(0, 16);
    };

    it("should reject a PURCHASE order carrying SELL-specific columns", async () => {
      const { userId } = await createTestUser();

      await expect(
        prisma.order.create({
          data: {
            user_id: userId,
            type: OrderType.PURCHASE,
            total_amount: 800,
            pickup_code: uniquePickup("PURCHK"),
            paymentExpiresAt: futureDate(),
            totalWeightKg: 5,
            unitPrice: 160,
            settlementType: SettlementType.CASH,
          },
        })
      ).rejects.toThrow(/chk_order_type_consistency/i);
    });

    // Phase 3: Legacy SELL field tests removed
    // After migrating to order_sell_details table, SELL orders no longer store
    // data in Order table legacy fields (totalWeightKg, unitPrice, etc.)
    // Corresponding tests moved to sellOrders.integration.test.ts

    it("should accept a valid SELL order (without legacy fields)", async () => {
      const { userId } = await createTestUser();

      // Phase 3: SELL orders now only store basic order info in Order table
      const order = await prisma.order.create({
        data: {
          user_id: userId,
          type: OrderType.SELL,
          total_amount: 1200,
          pickup_code: uniquePickup("SELOK"),
          paymentExpiresAt: futureDate(),
          // Legacy SELL fields must be NULL (enforced by chk_order_type_consistency)
        },
      });

      expect(order).toBeDefined();
      expect(order.type).toBe(OrderType.SELL);
      expect(order.totalWeightKg).toBeNull();
      expect(order.unitPrice).toBeNull();

      await prisma.order.delete({ where: { id: order.id } });
    });
  });
  describe("Source order type trigger", () => {
    const randomPickupCode = (prefix: string) => {
      const randomPart = (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)).toUpperCase();
      return `${prefix}${randomPart}`.slice(0, 16);
    };

    const oneHourLater = () => new Date(Date.now() + 60 * 60 * 1000);

    const createSku = async () => {
      const isbnSeed = `${Date.now()}${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`;
      const isbn13 = isbnSeed.slice(0, 13);
      const master = await prisma.bookMaster.create({
        data: {
          isbn13,
          title: `Trigger Guard ${isbn13}`,
        },
      });

      const sku = await prisma.bookSku.create({
        data: {
          master_id: master.id,
          edition: `TRG-${isbn13.slice(-4)}`,
        },
      });

      return { masterId: master.id, skuId: sku.id };
    };

    it("should reject an inventory item referencing a PURCHASE order", async () => {
      const { userId } = await createTestUser();
      const purchaseOrder = await prisma.order.create({
        data: {
          user_id: userId,
          type: OrderType.PURCHASE,
          status: OrderStatus.COMPLETED,
          total_amount: 1200,
          pickup_code: randomPickupCode("PURTRG"),
          paymentExpiresAt: oneHourLater(),
        },
      });

      const { skuId, masterId } = await createSku();

      await expect(
        prisma.inventoryItem.create({
          data: {
            sku_id: skuId,
            condition: "GOOD",
            cost: 2000, // 20 yuan = 2000 cents
            selling_price: 4000, // 40 yuan = 4000 cents
            status: "BULK_ACQUISITION",
            sourceOrderId: purchaseOrder.id,
          },
        })
      ).rejects.toThrow(/source_order_id must reference an Order with type = 'SELL'/i);

      await prisma.bookSku.delete({ where: { id: skuId } });
      await prisma.bookMaster.delete({ where: { id: masterId } });
      await prisma.order.delete({ where: { id: purchaseOrder.id } });
    });

    it("should allow an inventory item referencing a SELL order", async () => {
      const { userId } = await createTestUser();
      // Phase 3: Create SELL order without legacy fields
      const sellOrder = await prisma.order.create({
        data: {
          user_id: userId,
          type: OrderType.SELL,
          status: OrderStatus.COMPLETED,
          total_amount: 600,
          pickup_code: randomPickupCode("SELLTRG"),
          paymentExpiresAt: oneHourLater(),
          // Legacy SELL fields removed (now in order_sell_details table)
        },
      });

      const { skuId, masterId } = await createSku();

      const item = await prisma.inventoryItem.create({
        data: {
          sku_id: skuId,
          condition: "GOOD",
          cost: 1000, // 10 yuan = 1000 cents
          selling_price: 2500, // 25 yuan = 2500 cents
          status: "BULK_ACQUISITION",
          sourceOrderId: sellOrder.id,
        },
      });

      expect(item.sourceOrderId).toBe(sellOrder.id);

      await prisma.inventoryItem.delete({ where: { id: item.id } });
      await prisma.bookSku.delete({ where: { id: skuId } });
      await prisma.bookMaster.delete({ where: { id: masterId } });
      await prisma.order.delete({ where: { id: sellOrder.id } });
    });
  });
});
