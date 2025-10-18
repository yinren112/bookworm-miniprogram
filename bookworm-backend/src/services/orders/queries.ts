// src/services/orders/queries.ts
// Read-only query operations for orders
// No write operations, no side effects

import { Prisma, PrismaClient } from "@prisma/client";
import { ApiError } from "../../errors";
import { orderSelectPublic } from "../../db/views/orderView";
import { inventorySelectBasic } from "../../db/views/inventoryView";

/**
 * Fetches orders for a specific user with cursor-based pagination
 *
 * Pagination strategy: Cursor = createdAt_id (composite for uniqueness)
 * Sorting: createdAt DESC, id DESC
 *
 * @param dbCtx - Database context (PrismaClient or TransactionClient)
 * @param userId - User ID to filter orders
 * @param options - Pagination options (limit, cursor)
 * @returns Paginated order data with nextCursor
 */
export async function getOrdersByUserId(
  dbCtx: PrismaClient | Prisma.TransactionClient,
  userId: number,
  options: { limit?: number; cursor?: string } = {},
) {
  const { limit = 10, cursor } = options;

  // Input sanitization
  const rawLimit = typeof limit === "number" ? limit : Number(limit);
  const parsedLimit = Number.isFinite(rawLimit) ? Math.floor(rawLimit) : 10;
  const normalizedLimit = Math.max(1, Math.min(parsedLimit, 50));

  // Cursor parsing: format is "ISO_DATE_createdAt_ID"
  let cursorDate: Date | null = null;
  let cursorId: number | null = null;

  if (cursor) {
    const [cursorDatePart, cursorIdPart] = cursor.split("_");
    if (cursorDatePart && cursorIdPart) {
      const parsedDate = new Date(cursorDatePart);
      const parsedId = Number(cursorIdPart);

      if (
        !Number.isNaN(parsedDate.getTime()) &&
        Number.isInteger(parsedId) &&
        parsedId > 0
      ) {
        cursorDate = parsedDate;
        cursorId = parsedId;
      }
    }
  }

  // Build WHERE clause
  const where: Prisma.OrderWhereInput = {
    user_id: userId,
  };

  // Cursor-based filtering: (createdAt < cursor_date) OR (createdAt = cursor_date AND id < cursor_id)
  if (cursorDate && cursorId !== null) {
    where.OR = [
      { createdAt: { lt: cursorDate } },
      {
        createdAt: cursorDate,
        id: { lt: cursorId },
      },
    ];
  }

  // Fetch N+1 records to determine if there are more pages
  const orders = await dbCtx.order.findMany({
    where,
    select: orderSelectPublic,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: normalizedLimit + 1,
  });

  // Pagination metadata
  const hasMore = orders.length > normalizedLimit;
  const pageData = hasMore ? orders.slice(0, normalizedLimit) : orders;
  const nextCursor =
    hasMore && pageData.length > 0
      ? `${pageData[pageData.length - 1].createdAt.toISOString()}_${
          pageData[pageData.length - 1].id
        }`
      : null;

  return {
    data: pageData,
    nextCursor,
  };
}

/**
 * Fetches a single order by ID with authorization check
 *
 * Authorization logic:
 * - STAFF: Can access any order
 * - USER: Can only access their own orders
 *
 * @param dbCtx - Database context
 * @param orderId - Order ID to fetch
 * @param userId - User ID for authorization
 * @throws ApiError(403) if user not found
 * @throws ApiError(404) if order not found or unauthorized
 */
export async function getOrderById(
  dbCtx: PrismaClient | Prisma.TransactionClient,
  orderId: number,
  userId: number,
) {
  // Get user role for authorization
  const userWithRole = await dbCtx.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (!userWithRole) {
    throw new ApiError(403, "User not found", "USER_NOT_FOUND");
  }

  let order;

  if (userWithRole.role === "STAFF") {
    // STAFF can access any order
    order = await dbCtx.order.findUnique({
      where: { id: orderId },
      select: orderSelectPublic,
    });
  } else {
    // USER can only access their own orders - use findFirst with compound conditions
    order = await dbCtx.order.findFirst({
      where: {
        id: orderId,
        user_id: userId,
      },
      select: orderSelectPublic,
    });
  }

  if (!order) {
    throw new ApiError(404, "Order not found", "ORDER_NOT_FOUND");
  }

  return order;
}

/**
 * Fetches all pending pickup orders with enriched inventory data
 *
 * Linus式优化: Manual aggregation to eliminate N+1 queries
 *
 * Strategy:
 * 1. Fetch all PENDING_PICKUP orders with orderItems (single JOIN)
 * 2. Extract all inventory_item_ids
 * 3. Fetch all inventory items in ONE query
 * 4. Manual join using Map lookup
 *
 * Why not Prisma nested includes?
 * - Deep includes create complex SQL with potential performance issues
 * - Manual aggregation gives us full control over query shape
 * - Easier to add defensive checks for data integrity
 *
 * @param dbCtx - Database context
 * @returns Array of orders with enriched inventory item data
 */
export async function getPendingPickupOrders(
  dbCtx: PrismaClient | Prisma.TransactionClient,
) {
  // Step 1: Fetch all pending pickup orders with orderItems (shallow include)
  const ordersWithItems = await dbCtx.order.findMany({
    where: { status: "PENDING_PICKUP" },
    include: {
      orderItem: true, // Only include one level to avoid deep nesting
    },
    orderBy: { paid_at: "asc" },
  });

  // Step 2: Extract all inventory_item_ids
  const inventoryItemIds = ordersWithItems.flatMap((o) =>
    o.orderItem.map((item) => item.inventory_item_id),
  );

  // Early return if no orders
  if (inventoryItemIds.length === 0) {
    return [];
  }

  // Step 3: Fetch all inventory items in ONE query
  const inventoryItems = await dbCtx.inventoryItem.findMany({
    where: {
      id: { in: inventoryItemIds },
    },
    select: inventorySelectBasic,
  });

  // Step 4: Create fast lookup Map
  const inventoryMap = new Map(
    inventoryItems.map((item) => [item.id, item]),
  );

  // Step 5: Manual aggregation with defensive data integrity checks
  const enrichedOrders = ordersWithItems.map((order) => {
    const enrichedItems = order.orderItem
      .map((item) => {
        const inventoryItem = inventoryMap.get(item.inventory_item_id);

        // CRITICAL: If inventoryItem is missing, this indicates a database integrity violation
        // Foreign key constraints should prevent this, but we check anyway
        if (!inventoryItem) {
          console.error(
            `[DATA INTEGRITY ERROR] Order ${order.id} references missing InventoryItem ${item.inventory_item_id}. ` +
              `This should never happen if foreign key constraints are working correctly. ` +
              `Filtering out this item from the response.`,
          );
          return null; // Mark for filtering
        }

        return {
          ...item,
          inventoryItem,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null); // Filter out null items

    return {
      ...order,
      orderItem: enrichedItems,
    };
  });

  return enrichedOrders;
}
