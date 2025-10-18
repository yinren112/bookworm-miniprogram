// src/services/orders/scheduling.ts
// Scheduled tasks for order lifecycle management
// Designed to be called by cron jobs

import { Prisma, PrismaClient } from "@prisma/client";
import { metrics } from "../../plugins/metrics";
import { log } from "../../lib/logger";

/**
 * Cancels all expired orders and releases their inventory
 *
 * Linus式设计: Single CTE query for atomicity
 *
 * Execution flow (all in one atomic query):
 * 1. `cancelled_orders` CTE: Find and update expired orders
 * 2. `released_items` CTE: Release associated inventory items
 * 3. `deleted_reservations` CTE: Delete inventory reservations
 * 4. Final SELECT: Aggregate counts
 *
 * Why CTE instead of multiple queries?
 * - Atomic: All updates happen together or none at all
 * - Performant: Single round-trip to database
 * - No race conditions: FOR UPDATE locks selected orders
 *
 * Limit: 1000 orders per execution to prevent long-running locks
 *
 * @param dbCtx - Database context (PrismaClient or TransactionClient)
 * @returns Count of cancelled orders
 */
export async function cancelExpiredOrders(
  dbCtx: Prisma.TransactionClient | PrismaClient,
) {
  // This single CTE query performs both actions atomically.
  // 1. `cancelled_orders` CTE finds and updates expired orders, returning their IDs.
  // 2. `released_items` CTE uses the IDs from the first CTE to find and release the associated inventory items.
  // 3. The final SELECT aggregates the counts from both CTEs.
  const query = Prisma.sql`
    WITH cancelled_orders AS (
      UPDATE "Order"
      SET status = 'CANCELLED', cancelled_at = NOW()
      WHERE id IN (
        SELECT id FROM "Order"
        WHERE status = 'PENDING_PAYMENT' AND "paymentExpiresAt" < NOW()
        ORDER BY "paymentExpiresAt" ASC
        LIMIT 1000
        FOR UPDATE
      )
      RETURNING id
    ),
    released_items AS (
      UPDATE "inventoryitem" i
      SET status = 'in_stock', updated_at = NOW()
      FROM inventory_reservation ir
      WHERE ir.inventory_item_id = i.id
        AND ir.order_id IN (SELECT id FROM cancelled_orders)
      RETURNING i.id
    ),
    deleted_reservations AS (
      DELETE FROM inventory_reservation ir
      USING cancelled_orders co
      WHERE ir.order_id = co.id
      RETURNING ir.inventory_item_id
    )
    SELECT
      (SELECT COUNT(*) FROM cancelled_orders) as "cancelledCount",
      (SELECT COUNT(*) FROM released_items) as "releasedCount";
  `;

  const result = await (dbCtx as PrismaClient).$queryRaw<
    { cancelledCount: bigint; releasedCount: bigint }[]
  >(query);

  const cancelledCount = Number(result[0]?.cancelledCount || 0);
  const releasedCount = Number(result[0]?.releasedCount || 0);

  if (cancelledCount > 0) {
    log.info(
      `Atomically cancelled ${cancelledCount} orders and released ${releasedCount} items back to stock.`,
    );
    metrics.ordersCancelled.inc(cancelledCount);
  }

  // The function signature remains the same, returning only the cancelled order count.
  return { cancelledCount };
}
