// src/services/orders/fulfill.ts
// Order fulfillment module for pickup completion
// Uses atomic conditional updates to prevent race conditions

import { Prisma, PrismaClient } from "@prisma/client";
import { ApiError } from "../../errors";
import { metrics } from "../../plugins/metrics";
import { INVENTORY_STATUS } from "../../constants";
import { orderIdStatusView, orderItemInventoryIdView, orderWithItemsInclude } from "../../db/views";

/**
 * Internal implementation of order fulfillment (runs in transaction)
 *
 * Atomic update strategy:
 * - Uses updateMany() with status condition
 * - Checks count to ensure exactly 1 row updated
 * - If count !== 1, fetch order to provide specific error
 *
 * State transitions:
 * - Order: PENDING_PICKUP → COMPLETED
 * - InventoryItem: RESERVED → SOLD
 *
 * @param tx - Transaction client
 * @param pickupCode - Pickup code from staff input
 * @returns Completed order with items
 * @throws ApiError(404) if pickup code invalid
 * @throws ApiError(409) if order not in PENDING_PICKUP state
 */
async function fulfillOrderImpl(
  tx: Prisma.TransactionClient,
  pickupCode: string,
) {
  // ATOMIC CONDITIONAL UPDATE: Only proceed if order exists and is in PENDING_PICKUP state
  const updatedOrder = await tx.order.updateMany({
    where: {
      pickup_code: pickupCode,
      status: "PENDING_PICKUP",
    },
    data: {
      status: "COMPLETED",
      completed_at: new Date(),
    },
  });

  // Check if the atomic update was successful
  if (updatedOrder.count !== 1) {
    // Either order doesn't exist or is not in PENDING_PICKUP state
    const order = await tx.order.findUnique({
      where: { pickup_code: pickupCode },
      select: orderIdStatusView,
    });

    if (!order) {
      throw new ApiError(
        404,
        `取货码 "${pickupCode}" 无效`,
        "INVALID_PICKUP_CODE",
      );
    } else {
      throw new ApiError(
        409,
        `此订单状态为 "${order.status}"，无法核销。订单必须已支付才能核销。`,
        "ORDER_STATE_INVALID",
      );
    }
  }

  // Get order items for inventory update
  const orderItems = await tx.orderItem.findMany({
    where: {
      Order: { pickup_code: pickupCode },
    },
    select: orderItemInventoryIdView,
  });

  const inventoryItemIds = orderItems.map((item) => item.inventory_item_id);

  // Update inventory items to sold status and clear reservation pointer
  await tx.inventoryItem.updateMany({
    where: { id: { in: inventoryItemIds } },
    data: {
      status: INVENTORY_STATUS.SOLD,
    },
  });

  // Only increment metrics after successful atomic update
  metrics.ordersCompleted.inc();

  // Return the updated order data
  const completedOrder = await tx.order.findUnique({
    where: { pickup_code: pickupCode },
    include: orderWithItemsInclude,
  });

  // Track fulfillment duration if both timestamps exist
  if (
    completedOrder &&
    completedOrder.paid_at &&
    completedOrder.completed_at
  ) {
    const fulfillmentDurationSeconds =
      (completedOrder.completed_at.getTime() -
        completedOrder.paid_at.getTime()) /
      1000;
    metrics.orderFulfillmentDurationSeconds.observe(fulfillmentDurationSeconds);
  }

  return completedOrder!;
}

/**
 * Fulfills an order using pickup code
 *
 * Public interface for order fulfillment. Handles transaction management:
 * - If called with PrismaClient, creates new transaction
 * - If called with TransactionClient, uses it directly
 *
 * @param dbCtx - Database context
 * @param pickupCode - Pickup code (will be uppercased)
 * @returns Completed order
 */
export async function fulfillOrder(
  dbCtx: PrismaClient | Prisma.TransactionClient,
  pickupCode: string,
) {
  if ("$connect" in dbCtx) {
    return (dbCtx as PrismaClient).$transaction((tx) =>
      fulfillOrderImpl(tx, pickupCode),
    );
  }

  return fulfillOrderImpl(dbCtx as Prisma.TransactionClient, pickupCode);
}
