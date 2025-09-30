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

// Use the manual mock for WeChat Pay SDK
vi.mock("wechatpay-node-v3");

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

// Mock orderService with our actual processPaymentNotification
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
    // Keep the real processPaymentNotification function for testing
    processPaymentNotification: (actual as any).processPaymentNotification,
  };
});

describe("Payment Security Integration Tests", () => {
  let app: FastifyInstance;
  let mockPayInstance: any;
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

    // Build app with mocked WeChat Pay
    app = await createTestApp();
    await app.ready();

    // Get our mock instance
    mockPayInstance = new WechatPay();
    mockPayInstance.verifySign = vi.fn();
    mockPayInstance.decipher_gcm = vi.fn();
    mockPayInstance.transactions_out_trade_no = vi.fn();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Reset all mocks for clean test state
    vi.clearAllMocks();
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

    it("should reject requests with expired timestamps (防重放攻击)", async () => {
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

    it("should reject requests with future timestamps (防重放攻击)", async () => {
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
      vi.mocked(mockPayInstance.verifySign).mockReturnValue(false);

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
      vi.mocked(mockPayInstance.verifySign).mockReturnValue(true);
      vi.mocked(mockPayInstance.decipher_gcm).mockReturnValue(
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
      vi.mocked(mockPayInstance.verifySign).mockReturnValue(true);
    });

    it("should handle successful payment notification", async () => {
      // Mock successful payment decryption
      vi.mocked(mockPayInstance.decipher_gcm).mockReturnValue(
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
      vi.mocked(mockPayInstance.decipher_gcm).mockReturnValue(
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
          total_amount: new Prisma.Decimal(88),
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

      vi.mocked(mockPayInstance.decipher_gcm).mockReturnValue(
        JSON.stringify({ out_trade_no: outTradeNo }),
      );
      vi.mocked(mockPayInstance.transactions_out_trade_no).mockResolvedValue({
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
          total_amount: new Prisma.Decimal(66),
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

      vi.mocked(mockPayInstance.decipher_gcm).mockReturnValue(
        JSON.stringify({ out_trade_no: outTradeNo }),
      );
      vi.mocked(mockPayInstance.transactions_out_trade_no).mockResolvedValue({
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
          total_amount: new Prisma.Decimal(88),
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

      vi.mocked(mockPayInstance.decipher_gcm).mockReturnValue(
        JSON.stringify({ out_trade_no: outTradeNo }),
      );
      vi.mocked(mockPayInstance.transactions_out_trade_no).mockResolvedValue({
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
      vi.mocked(mockPayInstance.decipher_gcm).mockReturnValue(
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
      vi.mocked(mockPayInstance.decipher_gcm).mockReturnValue("invalid-json{");

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
});
