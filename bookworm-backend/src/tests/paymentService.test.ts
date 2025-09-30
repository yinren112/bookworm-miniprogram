// bookworm-backend/src/tests/paymentService.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "./setup";

// Mock the config module
vi.mock("../config", () => ({
  default: {
    WX_APP_ID: "test_app_id",
    WXPAY_MCHID: "test_mch_id",
    WXPAY_NOTIFY_URL: "https://test.com/notify",
  },
}));

// Import AFTER mocking
const { generatePaymentParams } = await import("../services/orderService");

describe("generatePaymentParams", () => {
  let mockWechatPayAdapter: any;

  beforeEach(() => {
    // Reset mocks before each test
    vi.resetAllMocks();

    // Create a mock WechatPayAdapter instance that matches the real API
    mockWechatPayAdapter = {
      createPaymentOrder: vi.fn().mockResolvedValue({
        prepay_id: "wx12345678901234567890123456789012",
      }),
      generateSignature: vi.fn().mockReturnValue("mock-signature-12345"),
    };
  });

  it("should generate payment parameters for a valid order", async () => {
    // Mock direct database calls for order validation
    prismaMock.order.findUniqueOrThrow.mockResolvedValue({
      id: 123,
      user_id: 1,
      status: "PENDING_PAYMENT",
      total_amount: "25.50",
      paymentExpiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes from now
    } as any);

    prismaMock.orderitem.findMany.mockResolvedValue([
      {
        inventoryitem: {
          booksku: {
            bookmaster: { title: "Test Book" }
          }
        }
      }
    ] as any);

    prismaMock.user.findUniqueOrThrow.mockResolvedValue({
      openid: "test-openid-123"
    } as any);

    prismaMock.paymentRecord.upsert.mockResolvedValue({} as any);

    // Call the function with correct parameters (dbCtx, wechatPayAdapter, orderId, userId)
    const result = await generatePaymentParams(prismaMock, mockWechatPayAdapter, 123, 1);

    // Verify the result has the expected structure
    expect(result).toHaveProperty("timeStamp");
    expect(result).toHaveProperty("nonceStr");
    expect(result).toHaveProperty("package");
    expect(result).toHaveProperty("signType");
    expect(result).toHaveProperty("paySign");

    // Verify database calls were made
    expect(prismaMock.order.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: 123 } });
    expect(prismaMock.user.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 1 },
      select: { openid: true }
    });
  });

  it("should throw an error if the order is not found", async () => {
    // 1. Mock order not found
    prismaMock.order.findUniqueOrThrow.mockRejectedValue(new Error("No Order found"));

    // 2. Call the function and expect it to throw (dbCtx, wechatPayAdapter, orderId, userId)
    await expect(generatePaymentParams(prismaMock, mockWechatPayAdapter, 999, 123)).rejects.toThrow();

    // 3. Verify database call was made
    expect(prismaMock.order.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: 999 } });
  });

  it("should throw an error if the order status is not PENDING_PAYMENT", async () => {
    // 1. Mock order with wrong status
    prismaMock.order.findUniqueOrThrow.mockResolvedValue({
      id: 123,
      user_id: 1,
      status: "COMPLETED", // Wrong status
      total_amount: "25.50",
    } as any);

    // 2. Call the function and expect it to throw
    await expect(generatePaymentParams(prismaMock, mockWechatPayAdapter, 123, 1)).rejects.toThrow();

    // 3. Verify database call was made
    expect(prismaMock.order.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: 123 } });
  });

  it("should throw an error if the WechatPay SDK fails", async () => {
    // 1. Mock successful database calls but WeChat Pay failure
    prismaMock.order.findUniqueOrThrow.mockResolvedValue({
      id: 123,
      user_id: 1,
      status: "PENDING_PAYMENT",
      total_amount: "25.50",
    } as any);

    prismaMock.orderitem.findMany.mockResolvedValue([
      {
        inventoryitem: {
          booksku: {
            bookmaster: { title: "Test Book" }
          }
        }
      }
    ] as any);

    prismaMock.user.findUniqueOrThrow.mockResolvedValue({
      openid: "test-openid-123"
    } as any);

    // Mock WeChat Pay failure
    mockWechatPayAdapter.createPaymentOrder.mockRejectedValue(new Error("WeChat Pay API error"));

    // 2. Call the function and expect it to throw
    await expect(generatePaymentParams(prismaMock, mockWechatPayAdapter, 123, 1)).rejects.toThrow();

    // 3. Verify database calls were made
    expect(prismaMock.order.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: 123 } });
  });

  it("should handle orders with more than 3 books in description", async () => {
    // Mock database calls for order with multiple books
    prismaMock.order.findUniqueOrThrow.mockResolvedValue({
      id: 123,
      user_id: 1,
      status: "PENDING_PAYMENT",
      total_amount: "75.00",
      paymentExpiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes from now
    } as any);

    prismaMock.orderitem.findMany.mockResolvedValue([
      {
        inventoryitem: {
          booksku: {
            bookmaster: { title: "Book 1" }
          }
        }
      },
      {
        inventoryitem: {
          booksku: {
            bookmaster: { title: "Book 2" }
          }
        }
      },
      {
        inventoryitem: {
          booksku: {
            bookmaster: { title: "Book 3" }
          }
        }
      },
      {
        inventoryitem: {
          booksku: {
            bookmaster: { title: "Book 4" }
          }
        }
      }
    ] as any);

    prismaMock.user.findUniqueOrThrow.mockResolvedValue({
      openid: "test-openid-123"
    } as any);

    prismaMock.paymentRecord.upsert.mockResolvedValue({} as any);

    const result = await generatePaymentParams(prismaMock, mockWechatPayAdapter, 123, 1);

    expect(result).toHaveProperty("timeStamp");
    expect(result).toHaveProperty("nonceStr");
    expect(result).toHaveProperty("package");
    expect(result).toHaveProperty("signType");
    expect(result).toHaveProperty("paySign");

    expect(prismaMock.order.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: 123 } });
    expect(prismaMock.user.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 1 },
      select: { openid: true }
    });
  });
});
