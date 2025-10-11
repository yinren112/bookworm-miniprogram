import { describe, it, expect, beforeAll } from "vitest";
import { Prisma, PrismaClient, OrderStatus, OrderType, SettlementType } from "@prisma/client";
import { getPrismaClientForWorker, createTestUser, createTestInventoryItems } from "./globalSetup";
import { isPrismaRetryableError } from "../utils/typeGuards";
import { withTxRetry } from "../services/orderService";

describe("Database-level Business Rules", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = getPrismaClientForWorker();
  });

  describe("withTxRetry", () => {
    it("should retry and succeed on a P2034 serialization failure", { timeout: 15000 }, async () => {
      const itemIds = await createTestInventoryItems(1);
      const itemId = itemIds[0];

      let attemptCount = 0;
      let hasInitiallyFailed = false;

      const conflictingFunction = async () => {
        attemptCount += 1;

        return prisma.$transaction(async (tx) => {
          await tx.inventoryItem.findUnique({ where: { id: itemId } });

          if (attemptCount === 1) {
            prisma.inventoryItem.update({
              where: { id: itemId },
              data: { cost: 99 },
            }).catch(() => undefined);
            await new Promise((res) => setTimeout(res, 20));
          }

          try {
            return await tx.inventoryItem.update({
              where: { id: itemId },
              data: { cost: 101 },
            });
          } catch (e) {
            if (isPrismaRetryableError(e)) {
              hasInitiallyFailed = true;
            }
            throw e;
          }
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      };

      await withTxRetry(conflictingFunction);

      expect(hasInitiallyFailed).toBe(true);
      expect(attemptCount).toBeGreaterThan(1);

      const finalItem = await prisma.inventoryItem.findUnique({ where: { id: itemId } });
      expect(finalItem?.cost.toNumber()).toBe(101);
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

    it("should reject a SELL order missing unitPrice", async () => {
      const { userId } = await createTestUser();

      await expect(
        prisma.order.create({
          data: {
            user_id: userId,
            type: OrderType.SELL,
            total_amount: 900,
            pickup_code: uniquePickup("SELMIS"),
            paymentExpiresAt: futureDate(),
            totalWeightKg: 6,
            unitPrice: null,
            settlementType: SettlementType.CASH,
          },
        })
      ).rejects.toThrow(/chk_order_type_consistency/i);
    });

    it("should reject a VOUCHER sell order without voucherFaceValue", async () => {
      const { userId } = await createTestUser();

      await expect(
        prisma.order.create({
          data: {
            user_id: userId,
            type: OrderType.SELL,
            total_amount: 1000,
            pickup_code: uniquePickup("SELVCH"),
            paymentExpiresAt: futureDate(),
            totalWeightKg: 4,
            unitPrice: 200,
            settlementType: SettlementType.VOUCHER,
            voucherFaceValue: null,
          },
        })
      ).rejects.toThrow(/chk_order_type_consistency/i);
    });

    it("should accept a valid SELL order for CASH settlement", async () => {
      const { userId } = await createTestUser();

      const order = await prisma.order.create({
        data: {
          user_id: userId,
          type: OrderType.SELL,
          total_amount: 1200,
          pickup_code: uniquePickup("SELCASH"),
          paymentExpiresAt: futureDate(),
          totalWeightKg: 6,
          unitPrice: 200,
          settlementType: SettlementType.CASH,
          voucherFaceValue: null,
        },
      });

      expect(order).toBeDefined();

      await prisma.order.delete({ where: { id: order.id } });
    });

    it("should accept a valid SELL order for VOUCHER settlement", async () => {
      const { userId } = await createTestUser();

      const order = await prisma.order.create({
        data: {
          user_id: userId,
          type: OrderType.SELL,
          total_amount: 800,
          pickup_code: uniquePickup("SELVOUCH"),
          paymentExpiresAt: futureDate(),
          totalWeightKg: 4,
          unitPrice: 200,
          settlementType: SettlementType.VOUCHER,
          voucherFaceValue: 1600,
        },
      });

      expect(order.voucherFaceValue).toBe(1600);

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
            cost: 20,
            selling_price: 40,
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
      const sellOrder = await prisma.order.create({
        data: {
          user_id: userId,
          type: OrderType.SELL,
          status: OrderStatus.COMPLETED,
          total_amount: 600,
          pickup_code: randomPickupCode("SELLTRG"),
          paymentExpiresAt: oneHourLater(),
          totalWeightKg: 3,
          unitPrice: 200,
          settlementType: SettlementType.CASH,
          voucherFaceValue: null,
        },
      });

      const { skuId, masterId } = await createSku();

      const item = await prisma.inventoryItem.create({
        data: {
          sku_id: skuId,
          condition: "GOOD",
          cost: 10,
          selling_price: 25,
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
