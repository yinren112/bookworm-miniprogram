// src/services/orders/management.ts
// Order status management module
// Handles manual order status transitions by staff

import { Prisma, PrismaClient } from "@prisma/client";
import { ApiError } from "../../errors";
import { metrics } from "../../plugins/metrics";
import { INVENTORY_STATUS } from "../../constants";

/**
 * Internal implementation of order status update (runs in transaction)
 *
 * Business rules:
 * - Only STAFF can update order status
 * - Valid transitions:
 *   - PENDING_PAYMENT → CANCELLED
 *   - PENDING_PICKUP → COMPLETED or CANCELLED
 *   - COMPLETED/CANCELLED → No transitions allowed
 *
 * Side effects by status:
 * - COMPLETED:
 *   - InventoryItem status → SOLD
 *   - Increment metrics
 * - CANCELLED:
 *   - InventoryItem status → IN_STOCK
 *   - Delete inventory reservations
 *   - If cancelling paid order (PENDING_PICKUP), mark payment for refund
 *   - Increment metrics
 *
 * @param tx - Transaction client
 * @param orderId - Order ID to update
 * @param newStatus - Target status (COMPLETED or CANCELLED)
 * @param user - User context with role
 * @returns Updated order
 * @throws ApiError(403) if not STAFF
 * @throws ApiError(404) if order not found
 * @throws ApiError(400) if invalid transition
 */
async function updateOrderStatusImpl(
  tx: Prisma.TransactionClient,
  orderId: number,
  newStatus: "COMPLETED" | "CANCELLED",
  user: { userId: number; role: string },
) {
  // Only STAFF can update order status
  if (user.role !== "STAFF") {
    throw new ApiError(
      403,
      "只有工作人员可以更新订单状态",
      "INSUFFICIENT_PERMISSIONS",
    );
  }

  // Get current order with items
  const currentOrder = await tx.order.findUnique({
    where: { id: orderId },
    include: {
      orderItem: {
        include: {
          inventoryItem: true,
        },
      },
    },
  });

  if (!currentOrder) {
    throw new ApiError(404, "订单不存在", "ORDER_NOT_FOUND");
  }

  // Check if status transition is valid
  const validTransitions: Record<string, string[]> = {
    PENDING_PAYMENT: ["CANCELLED"],
    PENDING_PICKUP: ["COMPLETED", "CANCELLED"],
    COMPLETED: [],
    CANCELLED: [],
  };

  const allowedTransitions = validTransitions[currentOrder.status];
  if (!allowedTransitions?.includes(newStatus)) {
    throw new ApiError(
      400,
      `无法将订单从 ${currentOrder.status} 更新为 ${newStatus}`,
      "INVALID_STATUS_TRANSITION",
    );
  }

  // Update order status
  const updatedOrder = await tx.order.update({
    where: { id: orderId },
    data: {
      status: newStatus,
      ...(newStatus === "COMPLETED" && { completed_at: new Date() }),
      ...(newStatus === "CANCELLED" && { cancelled_at: new Date() }),
    },
  });

  // Update inventory items based on new status
  if (newStatus === "COMPLETED") {
    // Mark all items as sold and clear reservation pointer
    await tx.inventoryItem.updateMany({
      where: {
        id: {
          in: currentOrder.orderItem.map((item) => item.inventory_item_id),
        },
      },
      data: {
        status: INVENTORY_STATUS.SOLD,
      },
    });
    metrics.ordersCompleted.inc();
  } else if (newStatus === "CANCELLED") {
    const inventoryItemIds = currentOrder.orderItem.map(
      (item) => item.inventory_item_id,
    );

    // Release inventory back to stock
    await tx.inventoryItem.updateMany({
      where: {
        id: {
          in: inventoryItemIds,
        },
      },
      data: {
        status: INVENTORY_STATUS.IN_STOCK,
      },
    });

    // Delete reservation records
    await tx.inventoryReservation.deleteMany({
      where: {
        inventory_item_id: {
          in: inventoryItemIds,
        },
      },
    });

    // If cancelling a paid order, mark payment for refund
    if (currentOrder.status === "PENDING_PICKUP") {
      await tx.paymentRecord.updateMany({
        where: { order_id: orderId, status: "SUCCESS" },
        data: { status: "REFUND_REQUIRED" },
      });
    }

    metrics.ordersCancelled.inc();
  }

  return updatedOrder;
}

/**
 * Updates order status (STAFF only)
 *
 * Public interface for order status management. Handles transaction management:
 * - If called with PrismaClient, creates new transaction
 * - If called with TransactionClient, uses it directly
 *
 * @param dbCtx - Database context
 * @param orderId - Order ID
 * @param newStatus - Target status (COMPLETED or CANCELLED)
 * @param user - User context with userId and role
 * @returns Updated order
 */
export async function updateOrderStatus(
  dbCtx: PrismaClient | Prisma.TransactionClient,
  orderId: number,
  newStatus: "COMPLETED" | "CANCELLED",
  user: { userId: number; role: string },
) {
  if ("$connect" in dbCtx) {
    return (dbCtx as PrismaClient).$transaction((tx) =>
      updateOrderStatusImpl(tx, orderId, newStatus, user),
    );
  }

  return updateOrderStatusImpl(
    dbCtx as Prisma.TransactionClient,
    orderId,
    newStatus,
    user,
  );
}
