// src/services/orders/create.ts
// Order creation module with inventory reservation and advisory locks
// Implements atomic order creation with PostgreSQL advisory locks

import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import config from "../../config";
import { ApiError } from "../../errors";
import { metrics } from "../../plugins/metrics";
import { isPickupCodeConstraintError } from "../../utils/typeGuards";
import { INVENTORY_STATUS } from "../../constants";
import { withTxRetry } from "../../db/transaction";
import { generateUniquePickupCode } from "../../domain/orders/utils";
import { orderCountInclude } from "../../db/views";

/**
 * Validates and normalizes order input
 * - Deduplicates inventory item IDs
 * - Checks for empty cart
 * - Enforces MAX_ITEMS_PER_ORDER limit
 */
async function validateOrderInput(input: {
  userId: number;
  inventoryItemIds: number[];
}) {
  const itemIds = Array.from(new Set(input.inventoryItemIds));

  if (itemIds.length === 0) {
    throw new ApiError(400, "没有选择任何书籍", "EMPTY_ITEMS");
  }

  if (itemIds.length > config.MAX_ITEMS_PER_ORDER) {
    throw new ApiError(
      400,
      `单笔订单最多 ${config.MAX_ITEMS_PER_ORDER} 件`,
      "ORDER_SIZE_EXCEEDED",
    );
  }

  return itemIds;
}

/**
 * Acquires PostgreSQL advisory locks for order creation
 *
 * CRITICAL: Lock acquisition order to prevent deadlocks:
 * 1. User-level lock (namespace=1, key=userId)
 * 2. Item-level locks (namespace=2, key=itemId) in sorted order
 *
 * Why advisory locks?
 * - Prevents race conditions when aggregating user's reserved item count
 * - Prevents double-booking of inventory items
 * - Transaction-scoped locks (released automatically on commit/rollback)
 *
 * Lock namespaces:
 * - Namespace 1: User-level operations
 * - Namespace 2: Inventory item operations
 *
 * @param tx - Transaction client
 * @param userId - User ID to lock
 * @param itemIds - Inventory item IDs to lock (will be sorted)
 */
async function acquireOrderLocks(
  tx: Prisma.TransactionClient,
  userId: number,
  itemIds: number[],
) {
  // Step 1: User-level lock first (consistent ordering to prevent deadlocks)
  await tx.$executeRawUnsafe(
    "SELECT pg_advisory_xact_lock($1::int4, $2::int4)",
    1,
    userId,
  );

  // Step 2: Acquire item-level advisory locks to prevent concurrent reservation
  // This prevents race conditions when multiple users try to purchase the same book
  // Lock items in sorted order to prevent deadlocks
  const sortedItemIds = [...itemIds].sort((a, b) => a - b);
  for (const itemId of sortedItemIds) {
    await tx.$executeRawUnsafe(
      "SELECT pg_advisory_xact_lock($1::int4, $2::int4)",
      2,
      itemId,
    );
  }
}

/**
 * Validates inventory availability and user reservation limits
 *
 * Performs two checks:
 * 1. User's total reserved items count (across all PENDING_PAYMENT orders)
 * 2. All requested items are in IN_STOCK status
 *
 * NOTE: Safe from race conditions because locks are already held
 */
async function validateInventoryAndReservations(
  tx: Prisma.TransactionClient,
  userId: number,
  itemIds: number[],
) {
  // Check for total reserved items (now safe from race conditions)
  const existingReservedItems = await tx.order.findMany({
    where: { user_id: userId, status: "PENDING_PAYMENT" },
    include: orderCountInclude,
  });

  const totalReservedCount = existingReservedItems.reduce(
    (sum, order) => sum + order._count.orderItem,
    0,
  );

  if (
    totalReservedCount + itemIds.length >
    config.MAX_RESERVED_ITEMS_PER_USER
  ) {
    throw new ApiError(
      403,
      `您预留的商品总数已达上限(${config.MAX_RESERVED_ITEMS_PER_USER}件)，请先完成或取消部分订单`,
      "MAX_RESERVED_ITEMS_EXCEEDED",
    );
  }

  // Verify items are still available (with locks held)
  const itemsToReserve = await tx.inventoryItem.findMany({
    where: { id: { in: itemIds }, status: INVENTORY_STATUS.IN_STOCK },
  });

  if (itemsToReserve.length !== itemIds.length) {
    throw new ApiError(
      409,
      "部分书籍已不可用，请刷新后重试",
      "INSUFFICIENT_INVENTORY_PRECHECK",
    );
  }

  const totalAmountCents = itemsToReserve.reduce(
    (sum, item) => sum + item.selling_price,
    0,
  );

  return { itemsToReserve, totalAmountCents };
}

/**
 * Creates order record with unique pickup code
 *
 * Retry strategy for pickup code uniqueness:
 * - Attempts PICKUP_CODE_RETRY_COUNT times
 * - If unique constraint violated, regenerates and retries
 * - Fails after exhausting retries
 */
async function createOrderRecord(
  tx: Prisma.TransactionClient,
  userId: number,
  totalAmountCents: number,
) {
  // Create order with pickup_code retry logic
  for (let attempt = 0; attempt < config.PICKUP_CODE_RETRY_COUNT; attempt++) {
    const pickup_code = await generateUniquePickupCode();

    try {
      return await tx.order.create({
        data: {
          user_id: userId,
          status: "PENDING_PAYMENT",
          total_amount: totalAmountCents,
          pickup_code,
          paymentExpiresAt: new Date(
            Date.now() + config.ORDER_PAYMENT_TTL_MINUTES * 60 * 1000,
          ),
        },
      });
    } catch (e: unknown) {
      if (isPickupCodeConstraintError(e)) {
        continue; // Retry with new pickup code
      }
      throw e;
    }
  }

  throw new ApiError(
    500,
    "无法生成唯一订单取货码",
    "PICKUP_CODE_GEN_FAILED",
  );
}

/**
 * Reserves inventory items for the order
 *
 * Two operations:
 * 1. Update inventoryItem status to RESERVED
 * 2. Create inventoryReservation records
 *
 * Uses updateMany for atomic status update with row count check
 */
async function reserveInventoryItems(
  tx: Prisma.TransactionClient,
  orderId: number,
  itemIds: number[],
) {
  const updateResult = await tx.inventoryItem.updateMany({
    where: { id: { in: itemIds }, status: INVENTORY_STATUS.IN_STOCK },
    data: { status: INVENTORY_STATUS.RESERVED },
  });

  // Double-check: if affected rows don't match, someone else grabbed the items
  if (updateResult.count !== itemIds.length) {
    throw new ApiError(
      409,
      "部分书籍已经被其他订单锁定，请刷新后重试",
      "INVENTORY_RACE_CONDITION",
    );
  }

  // Create reservation records
  await tx.inventoryReservation.createMany({
    data: itemIds.map((itemId) => ({
      inventory_item_id: itemId,
      order_id: orderId,
    })),
  });
}

/**
 * Creates order items linking order to inventory items
 */
async function createOrderItems(
  tx: Prisma.TransactionClient,
  orderId: number,
  items: Array<{ id: number; selling_price: number }>,
) {
  await tx.orderItem.createMany({
    data: items.map((item) => ({
      order_id: orderId,
      inventory_item_id: item.id,
      price: item.selling_price,
    })),
  });
}

/**
 * Internal implementation of order creation (runs in transaction)
 *
 * Execution flow (all steps are atomic):
 * 1. Validate input and normalize item IDs
 * 2. Acquire all necessary advisory locks (user + items)
 * 3. Validate inventory availability and user reservation limits
 * 4. Create order record with unique pickup code
 * 5. Reserve inventory items and create order items
 * 6. Update metrics
 *
 * @param tx - Transaction client
 * @param input - Order creation input
 * @returns Created order record
 */
async function createOrderImpl(
  tx: Prisma.TransactionClient,
  input: {
    userId: number;
    inventoryItemIds: number[];
  },
) {
  // Step 1: Validate input and normalize item IDs
  const itemIds = await validateOrderInput(input);

  // Step 2: Acquire all necessary locks
  await acquireOrderLocks(tx, input.userId, itemIds);

  // Step 3: Validate inventory availability and user reservations
  const { itemsToReserve, totalAmountCents } =
    await validateInventoryAndReservations(tx, input.userId, itemIds);

  // Step 4: Create order record with unique pickup code
  const order = await createOrderRecord(tx, input.userId, totalAmountCents);

  // Step 5: Reserve inventory and create order items
  await reserveInventoryItems(tx, order.id, itemIds);
  await createOrderItems(tx, order.id, itemsToReserve);

  // Step 6: Update metrics and return
  metrics.ordersCreated.inc();
  return order;
}

/**
 * Creates a new order with inventory reservation
 *
 * Public interface for order creation. Handles transaction management:
 * - If called with PrismaClient, wraps in withTxRetry (handles serialization errors)
 * - If called with TransactionClient, uses it directly (for nested calls)
 *
 * Error handling:
 * - P2002 (unique constraint): User already has pending order
 * - P2010 (check constraint): MAX_RESERVED_ITEMS_PER_USER exceeded
 *
 * @param dbCtx - Database context (PrismaClient or TransactionClient)
 * @param input - Order creation input
 * @returns Created order
 */
export async function createOrder(
  dbCtx: PrismaClient | Prisma.TransactionClient,
  input: {
    userId: number;
    inventoryItemIds: number[];
  },
) {
  const endTimer = metrics.operationLatency
    .labels({ operation: "create_order" })
    .startTimer();
  try {
    // Check if dbCtx is PrismaClient by checking for $connect method (TransactionClient doesn't have this)
    if ("$connect" in dbCtx) {
      return await withTxRetry(
        dbCtx as PrismaClient,
        (tx) => createOrderImpl(tx, input),
        {
          transactionOptions: { timeout: 15000 },
        },
      );
    } else {
      // dbCtx is already a TransactionClient, use it directly
      return await createOrderImpl(
        dbCtx as Prisma.TransactionClient,
        input,
      );
    }
  } catch (e: unknown) {
    if (e instanceof PrismaClientKnownRequestError) {
      // Unique constraint on pending payment order
      if (e.code === "P2002") {
        throw new ApiError(
          409,
          "您有一个正在付款的订单，请先完成付款或等待订单过期",
          "CONCURRENT_PENDING_ORDER",
        );
      }

      // Check constraint: MAX_RESERVED_ITEMS_PER_USER
      if (
        e.code === "P2010" &&
        typeof e.meta?.message === "string" &&
        e.meta.message.includes("MAX_RESERVED_ITEMS_PER_USER")
      ) {
        throw new ApiError(
          403,
          `您预留的商品总数已达上限(${config.MAX_RESERVED_ITEMS_PER_USER}件)，请先完成或取消部分订单`,
          "MAX_RESERVED_ITEMS_EXCEEDED",
        );
      }

      // Fallback check for MAX_RESERVED_ITEMS_PER_USER in message
      if (
        typeof e.message === "string" &&
        e.message.includes("MAX_RESERVED_ITEMS_PER_USER")
      ) {
        throw new ApiError(
          403,
          `您预留的商品总数已达上限(${config.MAX_RESERVED_ITEMS_PER_USER}件)，请先完成或取消部分订单`,
          "MAX_RESERVED_ITEMS_EXCEEDED",
        );
      }
    }
    throw e;
  } finally {
    endTimer();
  }
}
