import { describe, it, expect, beforeEach, vi } from "vitest";
import { updateOrderStatus } from "../services/orderService";
import { Prisma } from "@prisma/client";

describe("Refund Fix Verification", () => {
  let mockDbCtx: any;
  let mockOrder: any;

  beforeEach(() => {
    // Mock database context
    mockDbCtx = {
      order: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      inventoryItem: {
        updateMany: vi.fn(),
      },
      paymentRecord: {
        updateMany: vi.fn(),
      },
    };

    // Mock order data
    mockOrder = {
      id: 1,
      user_id: 123,
      status: "PENDING_PICKUP",
      total_amount: new Prisma.Decimal(50.00),
      orderItem: [
        {
          inventory_item_id: 1,
          inventoryItem: {
            id: 1,
            status: "reserved",
          },
        },
        {
          inventory_item_id: 2,
          inventoryItem: {
            id: 2,
            status: "reserved",
          },
        },
      ],
    };
  });

  it("should mark payment for refund when cancelling a PENDING_PICKUP order", async () => {
    // Setup mocks
    mockDbCtx.order.findUnique.mockResolvedValue(mockOrder);
    mockDbCtx.order.update.mockResolvedValue({ ...mockOrder, status: "CANCELLED" });
    mockDbCtx.inventoryItem.updateMany.mockResolvedValue({ count: 2 });
    mockDbCtx.paymentRecord.updateMany.mockResolvedValue({ count: 1 });

    // Execute the function
    await updateOrderStatus(mockDbCtx, 1, "CANCELLED", { userId: 999, role: "STAFF" });

    // Verify inventory was released
    expect(mockDbCtx.inventoryItem.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: [1, 2] },
      },
      data: {
        status: "in_stock",
        reserved_by_order_id: null,
      },
    });

    // Verify payment was marked for refund (THIS IS THE FIX)
    expect(mockDbCtx.paymentRecord.updateMany).toHaveBeenCalledWith({
      where: { order_id: 1, status: 'SUCCESS' },
      data: { status: 'REFUND_REQUIRED' }
    });
  });

  it("should NOT mark payment for refund when cancelling a PENDING_PAYMENT order", async () => {
    // Change order status to PENDING_PAYMENT
    const pendingPaymentOrder = { ...mockOrder, status: "PENDING_PAYMENT" };

    mockDbCtx.order.findUnique.mockResolvedValue(pendingPaymentOrder);
    mockDbCtx.order.update.mockResolvedValue({ ...pendingPaymentOrder, status: "CANCELLED" });
    mockDbCtx.inventoryItem.updateMany.mockResolvedValue({ count: 2 });
    mockDbCtx.paymentRecord.updateMany.mockResolvedValue({ count: 0 });

    // Execute the function
    await updateOrderStatus(mockDbCtx, 1, "CANCELLED", { userId: 999, role: "STAFF" });

    // Verify inventory was released
    expect(mockDbCtx.inventoryItem.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: [1, 2] },
      },
      data: {
        status: "in_stock",
        reserved_by_order_id: null,
      },
    });

    // Verify payment was NOT marked for refund (because order was not paid)
    expect(mockDbCtx.paymentRecord.updateMany).not.toHaveBeenCalled();
  });

  it("should handle order completion without affecting payments", async () => {
    mockDbCtx.order.findUnique.mockResolvedValue(mockOrder);
    mockDbCtx.order.update.mockResolvedValue({ ...mockOrder, status: "COMPLETED" });
    mockDbCtx.inventoryItem.updateMany.mockResolvedValue({ count: 2 });

    // Execute the function
    await updateOrderStatus(mockDbCtx, 1, "COMPLETED", { userId: 999, role: "STAFF" });

    // Verify inventory was marked as sold and reservation cleared
    expect(mockDbCtx.inventoryItem.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: [1, 2] },
      },
      data: {
        status: "sold",
        reserved_by_order_id: null,  // Clear reservation pointer after sale
      },
    });

    // Verify payment records were not touched for completion
    expect(mockDbCtx.paymentRecord.updateMany).not.toHaveBeenCalled();
  });
});