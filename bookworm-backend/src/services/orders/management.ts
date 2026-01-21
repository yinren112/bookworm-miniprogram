// src/services/orders/management.ts
// Order status management module
// Handles manual order status transitions by staff

import { Prisma, PrismaClient } from "@prisma/client";
import { ApiError } from "../../errors";
import { metrics } from "../../plugins/metrics";
import { INVENTORY_STATUS } from "../../constants";
import { orderIdStatusView, orderWithItemsInclude } from "../../db/views";

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
    include: orderWithItemsInclude,
  });

  if (!currentOrder) {
    throw new ApiError(404, "订单不存在", "ORDER_NOT_FOUND");
  }

  const allowedFrom: Record<"COMPLETED" | "CANCELLED", string[]> = {
    COMPLETED: ["PENDING_PICKUP"],
    CANCELLED: ["PENDING_PAYMENT", "PENDING_PICKUP"],
  };

  if (!allowedFrom[newStatus].includes(currentOrder.status)) {
    if (currentOrder.status === "COMPLETED" || currentOrder.status === "CANCELLED") {
      throw new ApiError(
        409,
        `订单状态已变更为 ${currentOrder.status}，请刷新后重试`,
        "ORDER_STATUS_CONFLICT",
      );
    }

    throw new ApiError(
      400,
      `无法将订单从 ${currentOrder.status} 更新为 ${newStatus}`,
      "INVALID_STATUS_TRANSITION",
    );
  }

  const previousStatus = currentOrder.status;

  // Atomic update: only proceed if status is still the same
  const orderUpdate = await tx.order.updateMany({
    where: { id: orderId, status: previousStatus },
    data: {
      status: newStatus,
      ...(newStatus === "COMPLETED" && { completed_at: new Date() }),
      ...(newStatus === "CANCELLED" && { cancelled_at: new Date() }),
    },
  });

  if (orderUpdate.count !== 1) {
    const latestOrder = await tx.order.findUnique({
      where: { id: orderId },
      select: orderIdStatusView,
    });

    if (!latestOrder) {
      throw new ApiError(404, "订单不存在", "ORDER_NOT_FOUND");
    }

    if (latestOrder.status === newStatus) {
      return tx.order.findUnique({
        where: { id: orderId },
      });
    }

    throw new ApiError(
      409,
      `订单状态已变更为 ${latestOrder.status}，请刷新后重试`,
      "ORDER_STATUS_CONFLICT",
    );
  }

  // Update inventory items based on new status
  if (newStatus === "COMPLETED") {
    const inventoryItemIds = currentOrder.orderItem.map(
      (item) => item.inventory_item_id,
    );

    // Mark all items as sold and clear reservation pointer
    const inventoryUpdate = await tx.inventoryItem.updateMany({
      where: {
        id: { in: inventoryItemIds },
        status: INVENTORY_STATUS.RESERVED,
      },
      data: {
        status: INVENTORY_STATUS.SOLD,
      },
    });

    if (inventoryUpdate.count !== inventoryItemIds.length) {
      throw new ApiError(
        409,
        "库存状态已变更，订单完成失败",
        "INVENTORY_STATUS_CONFLICT",
      );
    }
    metrics.ordersCompleted.inc();
  } else if (newStatus === "CANCELLED") {
    const inventoryItemIds = currentOrder.orderItem.map(
      (item) => item.inventory_item_id,
    );

    // Release inventory back to stock
    const inventoryUpdate = await tx.inventoryItem.updateMany({
      where: {
        id: { in: inventoryItemIds },
        status: INVENTORY_STATUS.RESERVED,
      },
      data: {
        status: INVENTORY_STATUS.IN_STOCK,
      },
    });

    if (inventoryUpdate.count !== inventoryItemIds.length) {
      throw new ApiError(
        409,
        "库存状态已变更，订单取消失败",
        "INVENTORY_STATUS_CONFLICT",
      );
    }

    // Delete reservation records
    await tx.inventoryReservation.deleteMany({
      where: {
        inventory_item_id: {
          in: inventoryItemIds,
        },
      },
    });

    // If cancelling a paid order, mark payment for refund
    if (previousStatus === "PENDING_PICKUP") {
      await tx.paymentRecord.updateMany({
        where: { order_id: orderId, status: "SUCCESS" },
        data: { status: "REFUND_REQUIRED" },
      });
    }

    metrics.ordersCancelled.inc();
  }

  return tx.order.findUnique({
    where: { id: orderId },
  });
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
