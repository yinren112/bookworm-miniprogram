import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { Prisma, PrismaClient } from "@prisma/client";
import { processPendingRefunds } from "../services/refundService";
import { WechatPayAdapter } from "../adapters/wechatPayAdapter";
import { BUSINESS_LIMITS } from "../constants";
import { getPrismaClientForWorker, createTestUser } from "./globalSetup";

describe("Refund Recovery Integration", () => {
  let prisma: PrismaClient;

  const cleanupDatabase = async () => {
    await prisma.recommendedBookItem.deleteMany();
    await prisma.recommendedBookList.deleteMany();
    await prisma.paymentRecord.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.inventoryItem.deleteMany();
    await prisma.acquisition.deleteMany(); // Delete Acquisition before User
    await prisma.order.deleteMany();
    await prisma.bookSku.deleteMany();
    await prisma.bookMaster.deleteMany();
    await prisma.userProfile.deleteMany();
    await prisma.user.deleteMany();
  };

  beforeAll(async () => {
    prisma = getPrismaClientForWorker();
  });

  beforeEach(async () => {
    await cleanupDatabase();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  it("should resume processing refunds that are stuck in REFUND_PROCESSING", async () => {
    const { userId } = await createTestUser("USER");

    const pickupCode = `RF${Date.now().toString(36)}${Math.random()
      .toString(36)
      .slice(2, 10)}`
      .toUpperCase()
      .slice(0, 16);

    const order = await prisma.order.create({
      data: {
        user_id: userId,
        status: "CANCELLED",
        total_amount: 120 * 100,
        pickup_code: pickupCode,
        paymentExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
        cancelled_at: new Date(),
      },
    });

    const paymentRecord = await prisma.paymentRecord.create({
      data: {
        order_id: order.id,
        out_trade_no: `STUCK_${order.id}_${Date.now()}`,
        status: "REFUND_REQUIRED",
        amount_total: 12000,
      },
    });

    await prisma.paymentRecord.update({
      where: { id: paymentRecord.id },
      data: {
        status: "REFUND_PROCESSING",
        refund_attempts: 1,
      },
    });

    const staleTimestamp = new Date(Date.now() - 60 * 60 * 1000);
    await prisma.$executeRaw`UPDATE "PaymentRecord" SET "updatedAt" = ${staleTimestamp} WHERE "id" = ${paymentRecord.id}`;

    const createRefund = vi.fn().mockResolvedValue({
      status: "SUCCESS",
      out_refund_no: "MOCK_REFUND_ID",
      out_trade_no: paymentRecord.out_trade_no,
    });

    const mockAdapter = { createRefund } as unknown as WechatPayAdapter;

    const result = await processPendingRefunds(prisma, mockAdapter);

    expect(result.processedCount).toBe(1);
    expect(result.successCount).toBe(1);
    expect(result.failureCount).toBe(0);
    expect(createRefund).toHaveBeenCalledTimes(1);

    const refreshedRecord = await prisma.paymentRecord.findUniqueOrThrow({
      where: { id: paymentRecord.id },
    });

    expect(refreshedRecord.status).toBe("REFUNDED");
    expect(refreshedRecord.refund_id).toBeDefined();
    expect(refreshedRecord.refunded_at).toBeInstanceOf(Date);
  });
  it("should mark refund as FAILED after exceeding max attempts", async () => {
    const { userId } = await createTestUser("USER");

    const order = await prisma.order.create({
      data: {
        user_id: userId,
        status: "CANCELLED",
        total_amount: 150 * 100,
        pickup_code: `RF${Date.now().toString(36).slice(-10).toUpperCase()}`,
        paymentExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
        cancelled_at: new Date(),
      },
    });

    const paymentRecord = await prisma.paymentRecord.create({
      data: {
        order_id: order.id,
        out_trade_no: `FAIL_${order.id}_${Date.now()}`,
        status: "REFUND_REQUIRED",
        amount_total: 15000,
        refund_attempts: BUSINESS_LIMITS.MAX_REFUND_ATTEMPTS - 1,
      },
    });

    const staleTimestamp = new Date(Date.now() - 90 * 60 * 1000);
    await prisma.$executeRaw`UPDATE "PaymentRecord" SET "updatedAt" = ${staleTimestamp} WHERE "id" = ${paymentRecord.id}`;

    const createRefund = vi.fn().mockRejectedValue(new Error("permanent failure"));
    const mockAdapter = { createRefund } as unknown as WechatPayAdapter;

    const result = await processPendingRefunds(prisma, mockAdapter);

    expect(result.processedCount).toBe(1);
    expect(result.successCount).toBe(0);
    expect(result.failureCount).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].outTradeNo).toBe(paymentRecord.out_trade_no);
    expect(createRefund).toHaveBeenCalledTimes(1);

    const refreshedRecord = await prisma.paymentRecord.findUniqueOrThrow({
      where: { id: paymentRecord.id },
    });

    expect(refreshedRecord.status).toBe("FAILED");
    expect(refreshedRecord.refund_attempts).toBe(BUSINESS_LIMITS.MAX_REFUND_ATTEMPTS);
  });

});
