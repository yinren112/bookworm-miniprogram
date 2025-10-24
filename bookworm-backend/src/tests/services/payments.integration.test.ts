// bookworm-backend/src/tests/services/payments.integration.test.ts
// Comprehensive integration tests for payments.ts module
// Target: 30%+ coverage of payment processing logic

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import { PrismaClient } from "@prisma/client";
import { getPrismaClientForWorker } from "../globalSetup";
import { resetDatabase } from "../utils/resetDb";
import {
  preparePaymentIntent,
  processPaymentNotification,
  buildWechatPaymentRequest,
  buildClientPaymentSignature,
} from "../../services/orders/payments";
import { WechatPayAdapter } from "../../adapters/wechatPayAdapter";
import config from "../../config";
import { ApiError, PaymentQueryError } from "../../errors";
import { metrics } from "../../plugins/metrics";

// Mock WechatPayAdapter
const mockWechatPayAdapter = {
  verifySignature: vi.fn(),
  queryPaymentStatus: vi.fn(),
  createPaymentOrder: vi.fn(),
  generateSignature: vi.fn(),
  createRefund: vi.fn(),
} as unknown as WechatPayAdapter;

describe("Payments Integration Tests", () => {
  let prisma: PrismaClient;
  let testUserId: number;
  let testOrderId: number;

  beforeAll(async () => {
    prisma = getPrismaClientForWorker();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    vi.clearAllMocks();

    // Create test data
    const user = await prisma.user.create({
      data: {
        openid: "test-openid-123",
        role: "CUSTOMER",
        status: "REGISTERED",
      },
    });
    testUserId = user.id;

    const bookMaster = await prisma.bookMaster.create({
      data: {
        isbn13: "9781234567890",
        title: "测试教材",
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

    const inventoryItem = await prisma.inventoryItem.create({
      data: {
        sku_id: bookSku.id,
        condition: "GOOD",
        cost: 50.0,
        selling_price: 75.0,
        status: "RESERVED",
      },
    });

    const order = await prisma.order.create({
      data: {
        user_id: testUserId,
        status: "PENDING_PAYMENT",
        type: "PURCHASE",
        total_amount: 7500, // 75.00 yuan in cents
        paymentExpiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 min from now
        pickup_code: "TEST123456",
      },
    });
    testOrderId = order.id;

    await prisma.orderItem.create({
      data: {
        order_id: order.id,
        inventory_item_id: inventoryItem.id,
        price: 7500,
      },
    });

    // Update inventory to link to order
    await prisma.inventoryItem.update({
      where: { id: inventoryItem.id },
      data: { reserved_by_order_id: order.id },
    });

    // Create pending payment order record
    await prisma.pendingPaymentOrder.create({
      data: {
        order_id: order.id,
        user_id: testUserId,
      },
    });
  });

  describe("preparePaymentIntent", () => {
    it("should successfully prepare payment intent for valid order", async () => {
      const intent = await preparePaymentIntent(prisma, testOrderId, testUserId);

      expect(intent.outTradeNo).toBe(`BOOKWORM_${testOrderId}`);
      expect(intent.amountTotal).toBe(7500);
      expect(intent.description).toContain("测试教材");
      expect(intent.openid).toBe("test-openid-123");
      expect(new Date(intent.timeExpireIso)).toBeInstanceOf(Date);

      // Verify payment record was created
      const paymentRecord = await prisma.paymentRecord.findUnique({
        where: { out_trade_no: `BOOKWORM_${testOrderId}` },
      });
      expect(paymentRecord).toBeDefined();
      expect(paymentRecord?.status).toBe("PENDING");
      expect(paymentRecord?.amount_total).toBe(7500);
    });

    it("should throw 403 when user does not own the order", async () => {
      const anotherUser = await prisma.user.create({
        data: {
          openid: "another-user-openid",
          role: "CUSTOMER",
          status: "REGISTERED",
        },
      });

      await expect(
        preparePaymentIntent(prisma, testOrderId, anotherUser.id)
      ).rejects.toThrow(ApiError);

      await expect(
        preparePaymentIntent(prisma, testOrderId, anotherUser.id)
      ).rejects.toMatchObject({
        statusCode: 403,
        code: "FORBIDDEN",
      });
    });

    it("should throw 409 when order status is not PENDING_PAYMENT", async () => {
      await prisma.order.update({
        where: { id: testOrderId },
        data: { status: "PENDING_PICKUP" },
      });

      await expect(
        preparePaymentIntent(prisma, testOrderId, testUserId)
      ).rejects.toThrow(ApiError);

      await expect(
        preparePaymentIntent(prisma, testOrderId, testUserId)
      ).rejects.toMatchObject({
        statusCode: 409,
        code: "ORDER_STATE_INVALID",
      });
    });

    it("should throw 500 and increment metric when amount mismatch detected", async () => {
      // Spy on metrics counter
      const metricsSpy = vi.spyOn(metrics.amountMismatchDetected, "inc");

      // Corrupt order total (simulate data corruption)
      await prisma.order.update({
        where: { id: testOrderId },
        data: { total_amount: 99999 }, // Mismatch with orderItem price (7500)
      });

      await expect(
        preparePaymentIntent(prisma, testOrderId, testUserId)
      ).rejects.toThrow(ApiError);

      await expect(
        preparePaymentIntent(prisma, testOrderId, testUserId)
      ).rejects.toMatchObject({
        statusCode: 500,
        code: "AMOUNT_MISMATCH_FATAL",
      });

      // Verify metric was incremented
      expect(metricsSpy).toHaveBeenCalledOnce();
    });

    it("should throw 400 for invalid amount (negative)", async () => {
      await prisma.order.update({
        where: { id: testOrderId },
        data: { total_amount: -100 },
      });

      await prisma.orderItem.updateMany({
        where: { order_id: testOrderId },
        data: { price: -100 },
      });

      await expect(
        preparePaymentIntent(prisma, testOrderId, testUserId)
      ).rejects.toThrow(ApiError);

      await expect(
        preparePaymentIntent(prisma, testOrderId, testUserId)
      ).rejects.toMatchObject({
        statusCode: 400,
        code: "INVALID_AMOUNT",
      });
    });

    it("should be idempotent (calling twice creates only one payment record)", async () => {
      const intent1 = await preparePaymentIntent(prisma, testOrderId, testUserId);
      const intent2 = await preparePaymentIntent(prisma, testOrderId, testUserId);

      expect(intent1.outTradeNo).toBe(intent2.outTradeNo);

      const paymentRecords = await prisma.paymentRecord.findMany({
        where: { order_id: testOrderId },
      });
      expect(paymentRecords).toHaveLength(1);
    });
  });

  describe("processPaymentNotification", () => {
    const validNotificationData = {
      timestamp: Math.floor(Date.now() / 1000).toString(),
      nonce: "test-nonce",
      signature: "test-signature",
      serial: "test-serial",
      body: JSON.stringify({ out_trade_no: `BOOKWORM_1` }),
      out_trade_no: `BOOKWORM_1`,
    };

    beforeEach(async () => {
      // Create payment record for notification processing
      await prisma.paymentRecord.create({
        data: {
          out_trade_no: `BOOKWORM_${testOrderId}`,
          order_id: testOrderId,
          status: "PENDING",
          amount_total: 7500,
          appid: config.WX_APP_ID,
          mchid: config.WXPAY_MCHID || "test-mchid",
        },
      });
    });

    it("should successfully process valid payment notification", async () => {
      const notificationData = {
        ...validNotificationData,
        out_trade_no: `BOOKWORM_${testOrderId}`,
      };

      // Mock successful verification and query
      mockWechatPayAdapter.verifySignature.mockReturnValue(true);
      mockWechatPayAdapter.queryPaymentStatus.mockResolvedValue({
        trade_state: "SUCCESS",
        amount: { total: 7500, currency: "CNY" },
        payer: { openid: "test-openid-123" },
        mchid: config.WXPAY_MCHID || "test-mchid",
        appid: config.WX_APP_ID,
        transaction_id: "wx-transaction-123",
      });

      await processPaymentNotification(
        prisma,
        mockWechatPayAdapter,
        notificationData
      );

      // Verify order status updated
      const order = await prisma.order.findUnique({
        where: { id: testOrderId },
      });
      expect(order?.status).toBe("PENDING_PICKUP");
      expect(order?.paid_at).toBeInstanceOf(Date);

      // Verify payment record updated
      const paymentRecord = await prisma.paymentRecord.findUnique({
        where: { out_trade_no: `BOOKWORM_${testOrderId}` },
      });
      expect(paymentRecord?.status).toBe("SUCCESS");
      expect(paymentRecord?.transaction_id).toBe("wx-transaction-123");
    });

    it("should reject notification with future timestamp", async () => {
      const futureTimestamp = Math.floor(Date.now() / 1000) + 120; // 2 minutes in future
      const notificationData = {
        ...validNotificationData,
        timestamp: futureTimestamp.toString(),
        out_trade_no: `BOOKWORM_${testOrderId}`,
      };

      await expect(
        processPaymentNotification(
          prisma,
          mockWechatPayAdapter,
          notificationData
        )
      ).rejects.toThrow(ApiError);

      await expect(
        processPaymentNotification(
          prisma,
          mockWechatPayAdapter,
          notificationData
        )
      ).rejects.toMatchObject({
        statusCode: 400,
        code: "TIMESTAMP_INVALID",
      });
    });

    it("should reject notification with expired timestamp", async () => {
      const expiredTimestamp =
        Math.floor(Date.now() / 1000) - (config.PAYMENT_TIMESTAMP_TOLERANCE_SECONDS + 10);
      const notificationData = {
        ...validNotificationData,
        timestamp: expiredTimestamp.toString(),
        out_trade_no: `BOOKWORM_${testOrderId}`,
      };

      await expect(
        processPaymentNotification(
          prisma,
          mockWechatPayAdapter,
          notificationData
        )
      ).rejects.toThrow(ApiError);

      await expect(
        processPaymentNotification(
          prisma,
          mockWechatPayAdapter,
          notificationData
        )
      ).rejects.toMatchObject({
        statusCode: 400,
        code: "TIMESTAMP_EXPIRED",
      });
    });

    it("should reject notification with invalid signature", async () => {
      const notificationData = {
        ...validNotificationData,
        out_trade_no: `BOOKWORM_${testOrderId}`,
      };

      mockWechatPayAdapter.verifySignature.mockReturnValue(false);

      await expect(
        processPaymentNotification(
          prisma,
          mockWechatPayAdapter,
          notificationData
        )
      ).rejects.toThrow(ApiError);

      await expect(
        processPaymentNotification(
          prisma,
          mockWechatPayAdapter,
          notificationData
        )
      ).rejects.toMatchObject({
        statusCode: 400,
        code: "SIGNATURE_INVALID",
      });
    });

    it("should be idempotent (processing same notification twice)", async () => {
      const notificationData = {
        ...validNotificationData,
        out_trade_no: `BOOKWORM_${testOrderId}`,
      };

      mockWechatPayAdapter.verifySignature.mockReturnValue(true);
      mockWechatPayAdapter.queryPaymentStatus.mockResolvedValue({
        trade_state: "SUCCESS",
        amount: { total: 7500, currency: "CNY" },
        payer: { openid: "test-openid-123" },
        mchid: config.WXPAY_MCHID || "test-mchid",
        appid: config.WX_APP_ID,
        transaction_id: "wx-transaction-123",
      });

      // Process first time
      await processPaymentNotification(
        prisma,
        mockWechatPayAdapter,
        notificationData
      );

      const order1 = await prisma.order.findUnique({
        where: { id: testOrderId },
      });
      const payment1 = await prisma.paymentRecord.findUnique({
        where: { out_trade_no: `BOOKWORM_${testOrderId}` },
      });

      // Process second time (should be idempotent)
      await processPaymentNotification(
        prisma,
        mockWechatPayAdapter,
        notificationData
      );

      const order2 = await prisma.order.findUnique({
        where: { id: testOrderId },
      });
      const payment2 = await prisma.paymentRecord.findUnique({
        where: { out_trade_no: `BOOKWORM_${testOrderId}` },
      });

      // Verify state unchanged
      expect(order2?.status).toBe(order1?.status);
      expect(payment2?.status).toBe(payment1?.status);
      expect(mockWechatPayAdapter.queryPaymentStatus).toHaveBeenCalledTimes(1); // Only first call queries
    });

    it("should mark payment as REFUND_REQUIRED when order is cancelled", async () => {
      // Simulate order cancellation before payment notification
      await prisma.order.update({
        where: { id: testOrderId },
        data: { status: "CANCELLED" },
      });

      const notificationData = {
        ...validNotificationData,
        out_trade_no: `BOOKWORM_${testOrderId}`,
      };

      mockWechatPayAdapter.verifySignature.mockReturnValue(true);
      mockWechatPayAdapter.queryPaymentStatus.mockResolvedValue({
        trade_state: "SUCCESS",
        amount: { total: 7500, currency: "CNY" },
        payer: { openid: "test-openid-123" },
        mchid: config.WXPAY_MCHID || "test-mchid",
        appid: config.WX_APP_ID,
        transaction_id: "wx-transaction-123",
      });

      await processPaymentNotification(
        prisma,
        mockWechatPayAdapter,
        notificationData
      );

      // Verify payment marked for refund
      const paymentRecord = await prisma.paymentRecord.findUnique({
        where: { out_trade_no: `BOOKWORM_${testOrderId}` },
      });
      expect(paymentRecord?.status).toBe("REFUND_REQUIRED");

      // Verify order status unchanged (still CANCELLED)
      const order = await prisma.order.findUnique({
        where: { id: testOrderId },
      });
      expect(order?.status).toBe("CANCELLED");
    });

    it("should skip processing for unknown out_trade_no", async () => {
      const notificationData = {
        ...validNotificationData,
        out_trade_no: "BOOKWORM_99999", // Non-existent order
      };

      mockWechatPayAdapter.verifySignature.mockReturnValue(true);

      // Should not throw, just log warning and return
      await processPaymentNotification(
        prisma,
        mockWechatPayAdapter,
        notificationData
      );

      // Verify no payment record created
      const paymentRecord = await prisma.paymentRecord.findUnique({
        where: { out_trade_no: "BOOKWORM_99999" },
      });
      expect(paymentRecord).toBeNull();
    });
  });

  describe("buildWechatPaymentRequest", () => {
    it("should build valid WeChat payment request", () => {
      const intent = {
        outTradeNo: "BOOKWORM_123",
        amountTotal: 7500,
        description: "测试教材",
        timeExpireIso: new Date("2025-01-01T12:00:00Z").toISOString(),
        openid: "test-openid",
      };

      const request = buildWechatPaymentRequest(intent);

      expect(request).toMatchObject({
        appid: config.WX_APP_ID,
        mchid: config.WXPAY_MCHID || "",
        description: "测试教材",
        out_trade_no: "BOOKWORM_123",
        notify_url: config.WXPAY_NOTIFY_URL,
        time_expire: intent.timeExpireIso,
        amount: { total: 7500, currency: "CNY" },
        payer: { openid: "test-openid" },
      });
    });
  });

  describe("buildClientPaymentSignature", () => {
    it("should generate valid client payment signature", () => {
      const intent = {
        outTradeNo: "BOOKWORM_123",
        amountTotal: 7500,
        description: "测试教材",
        timeExpireIso: new Date().toISOString(),
        openid: "test-openid",
      };

      mockWechatPayAdapter.generateSignature.mockReturnValue(
        "mock-signature-string"
      );

      const signature = buildClientPaymentSignature(
        intent,
        "prepay-id-123",
        mockWechatPayAdapter
      );

      expect(signature).toMatchObject({
        timeStamp: expect.any(String),
        nonceStr: expect.stringMatching(/^[a-f0-9]{32}$/), // 16 bytes hex = 32 chars
        package: "prepay_id=prepay-id-123",
        signType: "RSA",
        paySign: "mock-signature-string",
      });

      expect(mockWechatPayAdapter.generateSignature).toHaveBeenCalledWith({
        message: expect.stringContaining(config.WX_APP_ID),
      });
    });
  });
});
