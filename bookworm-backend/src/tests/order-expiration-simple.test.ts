// src/tests/order-expiration-simple.test.ts
// Focused test to verify cancelExpiredOrders function works correctly
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the database - must be done before importing the service
vi.mock("../db", () => ({
  default: {
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
    order: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    inventoryItem: {
      updateMany: vi.fn(),
    },
  },
}));

import { cancelExpiredOrders } from "../services/orderService";
import prisma from "../db";

const mockPrisma = prisma as any;

describe("Order Expiration - cancelExpiredOrders Function Test", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should successfully cancel expired orders and release inventory", async () => {
    // Mock $queryRaw to return the expected CTE query result format
    mockPrisma.$queryRaw.mockResolvedValue([{ cancelledCount: BigInt(2), releasedCount: BigInt(2) }]);

    // Execute the function
    const result = await cancelExpiredOrders(mockPrisma);

    // Verify the result
    expect(result).toEqual({ cancelledCount: 2 });

    // Verify database operations were called
    expect(mockPrisma.$queryRaw).toHaveBeenCalledOnce();
  });

  it("should handle cases where no orders are expired", async () => {
    // Mock $queryRaw to return no orders
    mockPrisma.$queryRaw.mockResolvedValue([{ cancelledCount: BigInt(0), releasedCount: BigInt(0) }]);

    // Execute the function
    const result = await cancelExpiredOrders(mockPrisma);

    // Verify no orders were cancelled
    expect(result).toEqual({ cancelledCount: 0 });

    // Verify $queryRaw was called but not inventoryItem.updateMany (short-circuit)
    expect(mockPrisma.$queryRaw).toHaveBeenCalledOnce();
    expect(mockPrisma.inventoryItem.updateMany).not.toHaveBeenCalled();
  });

  it("should throw error if database operation fails", async () => {
    // Mock $queryRaw failure
    const databaseError = new Error("Database operation failed");
    mockPrisma.$queryRaw.mockRejectedValue(databaseError);

    // Verify error is properly propagated
    await expect(cancelExpiredOrders(mockPrisma)).rejects.toThrow(
      "Database operation failed",
    );
  });
});
