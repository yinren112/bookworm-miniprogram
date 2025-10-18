// bookworm-backend/src/tests/paymentSecurity.integration.test.ts
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import request from "supertest";
import { createTestApp } from "../app-factory";
import { FastifyInstance } from "fastify";
import { getPrismaClientForWorker } from './globalSetup';
import config from "../config";
import { Prisma } from "@prisma/client";
import WechatPay from "wechatpay-node-v3";
import { preparePaymentIntent } from "../services/orderService";
import { metrics } from "../plugins/metrics";

// --- Mocks ---
// Mock WechatPayAdapter to control its behavior during tests
const mockWechatPayAdapter = {
  verifySignature: vi.fn(),
  decryptNotificationData: vi.fn(),
  queryPaymentStatus: vi.fn(),
  createPaymentOrder: vi.fn(),
  sign: vi.fn(),
  createRefund: vi.fn(),
};

vi.mock("../adapters/wechatPayAdapter", () => ({
  WechatPayAdapter: vi.fn(() => mockWechatPayAdapter),
  createWechatPayAdapter: vi.fn(() => mockWechatPayAdapter),
}));

// Mock the file system for certificate loading
vi.mock("fs", async () => {
  const actual = await vi.importActual("fs");
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(true),
    readFileSync: vi.fn().mockReturnValue("mock-private-key"),
  };
});

// Additional service mocks (plugins are mocked in setup files)

// Mock all service functions that might interact with database
vi.mock("../services/inventoryService", () => ({
  addBookToInventory: vi.fn(),
  getAvailableBooks: vi.fn(),
  getBookById: vi.fn(),
}));

vi.mock("../services/bookMetadataService", () => ({
  getBookMetadata: vi.fn(),
}));

vi.mock("../services/contentService", () => ({
  getContentBySlug: vi.fn(),
}));

vi.mock("../services/authService", () => ({
  wxLogin: vi.fn(),
}));

// Mock orderService with our actual processPaymentNotification and preparePaymentIntent
vi.mock("../services/orderService", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    createOrder: vi.fn(),
    getOrdersByUserId: vi.fn(),
    getOrderById: vi.fn(),
    fulfillOrder: vi.fn(),
    generatePaymentParams: vi.fn(),
    getPendingPickupOrders: vi.fn(),
    // Keep the real functions for testing
    processPaymentNotification: (actual as any).processPaymentNotification,
    preparePaymentIntent: (actual as any).preparePaymentIntent,
  };
});

describe("Payment Security Integration Tests", () => {
  let app: FastifyInstance;
  let prisma: any;

  beforeAll(async () => {
    prisma = getPrismaClientForWorker();
    // Set up environment for WeChat Pay initialization
    process.env.WXPAY_MCHID = "test-mchid";
    process.env.WXPAY_PRIVATE_KEY_PATH = "/test/path/key.pem";
    process.env.WXPAY_CERT_SERIAL_NO = "test-serial";
    process.env.WXPAY_API_V3_KEY = "test-api-key";
    process.env.WX_APP_ID = "test-appid";
    process.env.NODE_ENV = "test";

    // Build app with mocked WeChat Pay Adapter
    app = await createTestApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Reset all mocks for clean test state
    vi.clearAllMocks();

    // Set default mock behaviors
    mockWechatPayAdapter.verifySignature.mockReturnValue(true);
  });

  describe("Payment Callback Security Fortress - HTTP Layer", () => {
    const validHeaders = {
      "wechatpay-timestamp": Math.floor(Date.now() / 1000).toString(),
      "wechatpay-nonce": "test-nonce",
      "wechatpay-signature": "valid-signature",
      "wechatpay-serial": "test-serial",
      "content-type": "application/json",
    };

    const mockEncryptedPayload = {
      resource: {
        ciphertext: "mock-ciphertext",
        associated_data: "mock-associated-data",
        nonce: "mock-nonce",
      },
    };

    it("should reject requests with expired timestamps (防重放攻�?", async () => {
      // Set timestamp to 5 minutes and 1 second ago (beyond the 5-minute threshold)
      const expiredTimestamp = Math.floor(
        (Date.now() - 301000) / 1000,
      ).toString(); // 301 seconds ago

      const response = await request(app.server)
        .post("/api/payment/notify")
        .set({
          ...validHeaders,
          "wechatpay-timestamp": expiredTimestamp,
        })
        .send(mockEncryptedPayload);

      // Permanent failure - no retry requested
      expect(response.status).toBe(200);
      expect(response.body.code).toBe("SUCCESS");
      expect(response.body.message).toBe("成功");
    });

    it("should reject requests with future timestamps (防重放攻�?", async () => {
      // Set timestamp to 6 minutes in the future (beyond the 5-minute threshold)
      const futureTimestamp = Math.floor(
        (Date.now() + 360000) / 1000,
      ).toString(); // 360 seconds in future

      const response = await request(app.server)
        .post("/api/payment/notify")
        .set({
          ...validHeaders,
          "wechatpay-timestamp": futureTimestamp,
        })
        .send(mockEncryptedPayload);

      // Permanent failure - no retry requested
      expect(response.status).toBe(200);
      expect(response.body.code).toBe("SUCCESS");
      expect(response.body.message).toBe("成功");
    });

    it("should reject requests with invalid signatures", async () => {
      // Mock verifySign to return false for this test
      mockWechatPayAdapter.verifySignature.mockReturnValue(false);

      const response = await request(app.server)
        .post("/api/payment/notify")
        .set(validHeaders)
        .send(mockEncryptedPayload);

      // Permanent failure for malformed request - no retry requested
      expect(response.status).toBe(200);
      expect(response.body.code).toBe("SUCCESS");
      expect(response.body.message).toBe("成功");
    });

    it("should handle missing raw body gracefully", async () => {
      const response = await request(app.server)
        .post("/api/payment/notify")
        .set(validHeaders);
      // No body sent

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("BAD_REQUEST");
    });

    it("should accept valid requests with proper timestamp and signature", async () => {
      // Mock successful verification and decryption
      mockWechatPayAdapter.verifySignature.mockReturnValue(true);
      mockWechatPayAdapter.decryptNotificationData.mockReturnValue(
        JSON.stringify({
          out_trade_no: "UNKNOWN_PAYMENT", // This will be ignored by our system
        }),
      );

      const currentTimestamp = Math.floor(Date.now() / 1000).toString();
      const response = await request(app.server)
        .post("/api/payment/notify")
        .set({
          ...validHeaders,
          "wechatpay-timestamp": currentTimestamp,
        })
        .send(mockEncryptedPayload);

      // Unknown payment notification - should be silently ignored (SUCCESS response to WeChat)
      expect(response.status).toBe(200);
      expect(response.body.code).toBe("SUCCESS");
      expect(response.body.message).toBe("成功");
    });
  });

  describe("Payment Business Logic - 真正的成功和失败场景", () => {
    const validHeaders = {
      "wechatpay-timestamp": Math.floor(Date.now() / 1000).toString(),
      "wechatpay-nonce": "test-nonce",
      "wechatpay-signature": "valid-signature",
      "wechatpay-serial": "test-serial",
      "content-type": "application/json",
    };

    const mockEncryptedPayload = {
      resource: {
        ciphertext: "mock-ciphertext",
        associated_data: "mock-associated-data",
        nonce: "mock-nonce",
      },
    };

    beforeEach(() => {
      // Always mock successful verification for business logic tests
      mockWechatPayAdapter.verifySignature.mockReturnValue(true);
    });

    it("should handle successful payment notification", async () => {
      // Mock successful payment decryption
      mockWechatPayAdapter.decryptNotificationData.mockReturnValue(
        JSON.stringify({
          trade_state: "SUCCESS",
          out_trade_no: "TEST_ORDER_12345",
          transaction_id: "wx_trans_12345",
          total_fee: 2000,
        }),
      );

      const response = await request(app.server)
        .post("/api/payment/notify")
        .set(validHeaders)
        .send(mockEncryptedPayload);

      // Unknown payment notification - should be silently ignored (SUCCESS response to WeChat)
      expect(response.status).toBe(200);
      expect(response.body.code).toBe("SUCCESS");
      expect(response.body.message).toBe("成功");
    });

    it("should handle failed payment notification", async () => {
      // Mock failed payment decryption
      mockWechatPayAdapter.decryptNotificationData.mockReturnValue(
        JSON.stringify({
          trade_state: "PAYERROR",
          out_trade_no: "TEST_ORDER_12345",
          err_code: "INSUFFICIENT_FUNDS",
          err_code_des: "余额不足",
        }),
      );

      const response = await request(app.server)
        .post("/api/payment/notify")
        .set(validHeaders)
        .send(mockEncryptedPayload);

      // Unknown payment notification - should be silently ignored (SUCCESS response to WeChat)
      expect(response.status).toBe(200);
      expect(response.body.code).toBe("SUCCESS");
      expect(response.body.message).toBe("成功");
    });

    it("should persist payment success and transition order status", async () => {
      const outTradeNo = `TEST_SUCCESS_${Date.now()}`;
      const user = await prisma.user.create({
        data: {
          openid: `user-${outTradeNo}`,
          role: "USER",
          nickname: "Payment Success User",
        },
      });

      const order = await prisma.order.create({
        data: {
          user_id: user.id,
          status: "PENDING_PAYMENT",
          total_amount: 88 * 100,
          pickup_code: `PK${Date.now().toString(36).slice(-8).toUpperCase()}`,
          paymentExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
        },
      });

      await prisma.paymentRecord.create({
        data: {
          out_trade_no: outTradeNo,
          order_id: order.id,
          status: "PENDING",
          amount_total: 8800,
          mchid: config.WXPAY_MCHID!,
          appid: config.WX_APP_ID!,
        },
      });

      mockWechatPayAdapter.decryptNotificationData.mockReturnValue(
        JSON.stringify({ out_trade_no: outTradeNo }),
      );
      mockWechatPayAdapter.queryPaymentStatus.mockResolvedValue({
        trade_state: "SUCCESS",
        amount: { total: 8800, currency: "CNY" },
        mchid: config.WXPAY_MCHID!,
        appid: config.WX_APP_ID!,
        transaction_id: `wx_${outTradeNo}`,
        payer: { openid: "payer-openid" },
      });

      try {
        const response = await request(app.server)
          .post("/api/payment/notify")
          .set({
            ...validHeaders,
            "wechatpay-timestamp": Math.floor(Date.now() / 1000).toString(),
          })
          .send(mockEncryptedPayload);

        expect(response.status).toBe(200);

        const updatedRecord = await prisma.paymentRecord.findUnique({
          where: { out_trade_no: outTradeNo },
        });
        expect(updatedRecord?.status).toBe("SUCCESS");
        expect(updatedRecord?.transaction_id).toBe(`wx_${outTradeNo}`);
        expect(updatedRecord?.payer_openid).toBe("payer-openid");

        const updatedOrder = await prisma.order.findUnique({ where: { id: order.id } });
        expect(updatedOrder?.status).toBe("PENDING_PICKUP");
        expect(updatedOrder?.paid_at).not.toBeNull();
      } finally {
        await prisma.paymentRecord.deleteMany({ where: { out_trade_no: outTradeNo } });
        await prisma.order.delete({ where: { id: order.id } }).catch(() => undefined);
        await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
      }
    });

    it("should mark payment record as FAILED when gateway reports final failure", async () => {
      const outTradeNo = `TEST_FAIL_${Date.now()}`;
      const user = await prisma.user.create({
        data: {
          openid: `user-${outTradeNo}`,
          role: "USER",
          nickname: "Payment Failed User",
        },
      });

      const order = await prisma.order.create({
        data: {
          user_id: user.id,
          status: "PENDING_PAYMENT",
          total_amount: 66 * 100,
          pickup_code: `PK${(Date.now() + 1).toString(36).slice(-8).toUpperCase()}`,
          paymentExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
        },
      });

      await prisma.paymentRecord.create({
        data: {
          out_trade_no: outTradeNo,
          order_id: order.id,
          status: "PENDING",
          amount_total: 6600,
          mchid: config.WXPAY_MCHID!,
          appid: config.WX_APP_ID!,
        },
      });

      mockWechatPayAdapter.decryptNotificationData.mockReturnValue(
        JSON.stringify({ out_trade_no: outTradeNo }),
      );
      mockWechatPayAdapter.queryPaymentStatus.mockResolvedValue({
        trade_state: "CLOSED",
        amount: { total: 6600, currency: "CNY" },
        mchid: config.WXPAY_MCHID!,
        appid: config.WX_APP_ID!,
      });

      try {
        const response = await request(app.server)
          .post("/api/payment/notify")
          .set({
            ...validHeaders,
            "wechatpay-timestamp": Math.floor(Date.now() / 1000).toString(),
          })
          .send(mockEncryptedPayload);

        expect(response.status).toBe(200);

        const updatedRecord = await prisma.paymentRecord.findUnique({
          where: { out_trade_no: outTradeNo },
        });
        expect(updatedRecord?.status).toBe("FAILED");
        expect(updatedRecord?.notified_at).not.toBeNull();

        const updatedOrder = await prisma.order.findUnique({ where: { id: order.id } });
        expect(updatedOrder?.status).toBe("PENDING_PAYMENT");
      } finally {
        await prisma.paymentRecord.deleteMany({ where: { out_trade_no: outTradeNo } });
        await prisma.order.delete({ where: { id: order.id } }).catch(() => undefined);
        await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
      }
    });

    it("should mark payment record as FAILED when gateway returns PAYERROR", async () => {
      const outTradeNo = `TEST_PAYERROR_${Date.now()}`;
      const user = await prisma.user.create({
        data: {
          openid: `user-${outTradeNo}`,
          role: "USER",
          nickname: "Payment PayError User",
        },
      });

      const order = await prisma.order.create({
        data: {
          user_id: user.id,
          status: "PENDING_PAYMENT",
          total_amount: 88 * 100,
          pickup_code: `PK${(Date.now() + 2).toString(36).slice(-8).toUpperCase()}`,
          paymentExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
        },
      });

      await prisma.paymentRecord.create({
        data: {
          out_trade_no: outTradeNo,
          order_id: order.id,
          status: "PENDING",
          amount_total: 8800,
          mchid: config.WXPAY_MCHID!,
          appid: config.WX_APP_ID!,
        },
      });

      mockWechatPayAdapter.decryptNotificationData.mockReturnValue(
        JSON.stringify({ out_trade_no: outTradeNo }),
      );
      mockWechatPayAdapter.queryPaymentStatus.mockResolvedValue({
        trade_state: "PAYERROR",
        amount: { total: 8800, currency: "CNY" },
        mchid: config.WXPAY_MCHID!,
        appid: config.WX_APP_ID!,
        transaction_id: `wx_${outTradeNo}`,
        payer: { openid: `payer-${outTradeNo}` },
      });

      try {
        const response = await request(app.server)
          .post("/api/payment/notify")
          .set({
            ...validHeaders,
            "wechatpay-timestamp": Math.floor(Date.now() / 1000).toString(),
          })
          .send(mockEncryptedPayload);

        expect(response.status).toBe(200);

        const updatedRecord = await prisma.paymentRecord.findUnique({
          where: { out_trade_no: outTradeNo },
        });
        expect(updatedRecord?.status).toBe("FAILED");
        expect(updatedRecord?.notified_at).not.toBeNull();
        expect(updatedRecord?.transaction_id).toBe(`wx_${outTradeNo}`);
        expect(updatedRecord?.payer_openid).toBe(`payer-${outTradeNo}`);

        const updatedOrder = await prisma.order.findUnique({ where: { id: order.id } });
        expect(updatedOrder?.status).toBe("PENDING_PAYMENT");
      } finally {
        await prisma.paymentRecord.deleteMany({ where: { out_trade_no: outTradeNo } });
        await prisma.order.delete({ where: { id: order.id } }).catch(() => undefined);
        await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
      }
    });

    it("should handle unknown order notification", async () => {
      // Mock payment for non-existent order
      mockWechatPayAdapter.decryptNotificationData.mockReturnValue(
        JSON.stringify({
          trade_state: "SUCCESS",
          out_trade_no: "NONEXISTENT_ORDER_99999",
          transaction_id: "wx_trans_99999",
          total_fee: 1000,
        }),
      );

      const response = await request(app.server)
        .post("/api/payment/notify")
        .set(validHeaders)
        .send(mockEncryptedPayload);

      // Unknown payment notification - should be silently ignored (SUCCESS response to WeChat)
      expect(response.status).toBe(200);
      expect(response.body.code).toBe("SUCCESS");
      expect(response.body.message).toBe("成功");
    });

    it("should handle malformed decrypted data", async () => {
      // Mock malformed JSON decryption
      mockWechatPayAdapter.decryptNotificationData.mockReturnValue("invalid-json{");

      const response = await request(app.server)
        .post("/api/payment/notify")
        .set(validHeaders)
        .send(mockEncryptedPayload);

      // Malformed data causes a JSON parsing error, but this is handled gracefully
      expect(response.status).toBe(200);
      expect(response.body.code).toBe("SUCCESS");
      expect(response.body.message).toBe("成功");
    });
  });

  describe("Amount Mismatch Alert Mechanism", () => {
    it("should trigger an amount mismatch alert if order total is inconsistent", async () => {
      // 1. Create test user
      const testUser = await prisma.user.create({
        data: {
          openid: `test-user-${Date.now()}`,
          role: "USER",
          nickname: "Amount Mismatch Test User",
        },
      });

      // 2. Create book metadata for inventory
      const bookMaster = await prisma.bookMaster.create({
        data: {
          isbn13: `978${Date.now().toString().slice(-10)}`,
          title: "Test Book for Amount Mismatch",
          author: "Test Author",
          publisher: "Test Publisher",
        },
      });

      const bookSku = await prisma.bookSku.create({
        data: {
          master_id: bookMaster.id,
          edition: "First Edition",
        },
      });

      // 3. Create inventory item
      const inventoryItem = await prisma.inventoryItem.create({
        data: {
          sku_id: bookSku.id,
          condition: "GOOD",
          cost: 1000, // 10 yuan = 1000 cents
          selling_price: 5000, // 50 yuan = 5000 cents
          status: "reserved",
        },
      });

      // 4. Create a valid order
      const order = await prisma.order.create({
        data: {
          user_id: testUser.id,
          status: "PENDING_PAYMENT",
          total_amount: 5000, // Correct: 50 yuan = 5000 cents
          pickup_code: `PK${Date.now().toString(36).slice(-8).toUpperCase()}`,
          paymentExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
        },
      });

      // 5. Create order item
      await prisma.orderItem.create({
        data: {
          order_id: order.id,
          inventory_item_id: inventoryItem.id,
          price: 5000, // Match inventory selling_price (in cents)
        },
      });

      // 6. Manually corrupt the order's total_amount to create mismatch
      await prisma.order.update({
        where: { id: order.id },
        data: { total_amount: 99999 }, // Obviously wrong amount
      });

      // 7. Spy on the metrics counter
      const incSpy = vi.spyOn(metrics.amountMismatchDetected, "inc");

      try {
        // 8. Act: Call preparePaymentIntent which performs the check
        await preparePaymentIntent(prisma, order.id, testUser.id);

        // Should not reach here
        expect.fail("Expected preparePaymentIntent to throw AMOUNT_MISMATCH_FATAL error");
      } catch (error: any) {
        // 9. Assert: Check error code
        expect(error.code).toBe("AMOUNT_MISMATCH_FATAL");

        // 10. Assert: Check if the alert metric was triggered
        expect(incSpy).toHaveBeenCalledOnce();
      } finally {
        // Cleanup
        incSpy.mockRestore();
        await prisma.orderItem.deleteMany({ where: { order_id: order.id } });
        await prisma.order.delete({ where: { id: order.id } });
        await prisma.inventoryItem.delete({ where: { id: inventoryItem.id } });
        await prisma.bookSku.delete({ where: { id: bookSku.id } });
        await prisma.bookMaster.delete({ where: { id: bookMaster.id } });
        await prisma.user.delete({ where: { id: testUser.id } });
      }
    });
  });
});
