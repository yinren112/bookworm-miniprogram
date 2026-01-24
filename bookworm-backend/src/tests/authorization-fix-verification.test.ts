// src/tests/authorization-fix-verification.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ApiError } from "../errors";

// Correct mock implementation - everything defined in the factory function
vi.mock("../db", () => ({
  default: {
    user: {
      findUnique: vi.fn(),
    },
    order: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("../config", () => ({
  default: {
    JWT_SECRET: "test-jwt-secret",
    ORDER_PAYMENT_TTL_MINUTES: 15,
    ORDER_PICKUP_CODE_LENGTH: 10,
    ORDER_PICKUP_CODE_BYTES: 5,
    MAX_ITEMS_PER_ORDER: 10,
    MAX_RESERVED_ITEMS_PER_USER: 20,
    DB_TRANSACTION_RETRY_COUNT: 3,
    DB_TRANSACTION_RETRY_BASE_DELAY_MS: 20,
    DB_TRANSACTION_RETRY_JITTER_MS: 40,
    PICKUP_CODE_RETRY_COUNT: 5,
  },
}));

// Now import after mocking
import prisma from "../db";
import { getOrderById } from "../services/orderService";

// Get the mocked functions
const mockPrisma = vi.mocked(prisma);

describe("Authorization Fix Verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should allow STAFF to access any order", async () => {
    const mockOrder = {
      id: 123,
      user_id: 999, // Different from requesting user
      status: "PENDING_PAYMENT",
      total_amount: 5000,
      pickup_code: "ABC123",
      paymentExpiresAt: new Date(),
      paid_at: null,
      cancelled_at: null,
      createdAt: new Date(),
      orderitem: [],
    };

    mockPrisma.user.findUnique.mockResolvedValue({ role: "STAFF" });
    mockPrisma.order.findUnique.mockResolvedValue(mockOrder);

    const result = await getOrderById(mockPrisma, 123, 456);

    expect(result).toEqual(mockOrder);
    expect(mockPrisma.order.findUnique).toHaveBeenCalledWith({
      where: { id: 123 },
      select: expect.any(Object),
    });
    // STAFF should use findUnique, not findFirst
    expect(mockPrisma.order.findFirst).not.toHaveBeenCalled();
  });

  it("should allow USER to access their own order", async () => {
    const mockOrder = {
      id: 123,
      user_id: 456, // Same as requesting user
      status: "PENDING_PAYMENT",
      total_amount: 5000,
      pickup_code: "ABC123",
      paymentExpiresAt: new Date(),
      paid_at: null,
      cancelled_at: null,
      createdAt: new Date(),
      orderitem: [],
    };

    mockPrisma.user.findUnique.mockResolvedValue({ role: "USER" });
    mockPrisma.order.findFirst.mockResolvedValue(mockOrder);

    const result = await getOrderById(mockPrisma, 123, 456);

    expect(result).toEqual(mockOrder);
    expect(mockPrisma.order.findFirst).toHaveBeenCalledWith({
      where: { id: 123, user_id: 456 },
      select: expect.any(Object),
    });
    // USER should use findFirst with user_id filter, not findUnique
    expect(mockPrisma.order.findUnique).not.toHaveBeenCalled();
  });

  it("should deny USER access to other users orders", async () => {
    // Mock returns null when user tries to access order that doesn't belong to them
    mockPrisma.user.findUnique.mockResolvedValue({ role: "USER" });
    mockPrisma.order.findFirst.mockResolvedValue(null);

    await expect(
      getOrderById(mockPrisma, 123, 456),
    ).rejects.toThrow(ApiError);

    await expect(
      getOrderById(mockPrisma, 123, 456),
    ).rejects.toThrow("Order not found");

    expect(mockPrisma.order.findFirst).toHaveBeenCalledWith({
      where: { id: 123, user_id: 456 },
      select: expect.any(Object),
    });
  });

  it("should return 404 for non-existent orders for STAFF", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ role: "STAFF" });
    mockPrisma.order.findUnique.mockResolvedValue(null);

    await expect(
      getOrderById(mockPrisma, 999, 456),
    ).rejects.toThrow(ApiError);

    await expect(
      getOrderById(mockPrisma, 999, 456),
    ).rejects.toThrow("Order not found");
  });

  it("should return 404 for non-existent orders for USER", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ role: "USER" });
    mockPrisma.order.findFirst.mockResolvedValue(null);

    await expect(
      getOrderById(mockPrisma, 999, 456),
    ).rejects.toThrow(ApiError);

    await expect(
      getOrderById(mockPrisma, 999, 456),
    ).rejects.toThrow("Order not found");
  });

  it("should throw USER_NOT_FOUND when user does not exist", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await expect(
      getOrderById(mockPrisma, 123, 456),
    ).rejects.toThrow(ApiError);

    await expect(
      getOrderById(mockPrisma, 123, 456),
    ).rejects.toThrow("User not found");

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 456 },
      select: { role: true },
    });
    // Should not proceed to query orders if user doesn't exist
    expect(mockPrisma.order.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.order.findFirst).not.toHaveBeenCalled();
  });
});
