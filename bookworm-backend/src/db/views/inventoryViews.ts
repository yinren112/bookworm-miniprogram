// src/db/views/inventoryViews.ts
// Centralized Inventory model data access selectors

import type { Prisma } from '@prisma/client';

/**
 * PUBLIC view: For unauthenticated/guest browsing
 * CRITICAL: Does NOT include cost, internal_notes, or staff-only fields
 * Used by: GET /api/inventory/available (public endpoint)
 */
export const inventoryPublicView = {
  id: true,
  sku_id: true,
  condition: true,
  selling_price: true,  // Only selling price, NOT cost
  status: true,
  created_at: true,
  bookSku: {
    include: {
      bookMaster: {
        select: {
          title: true,
          author: true,
          isbn13: true,
          publisher: true,
        },
      },
    },
  },
} as const satisfies Prisma.InventoryItemSelect;

/**
 * INTERNAL view: For staff/admin operations
 * Includes cost and all internal fields
 * Used by: POST /api/inventory/add, staff management
 */
export const inventoryInternalView = {
  id: true,
  sku_id: true,
  condition: true,
  cost: true,              // ← Staff only
  selling_price: true,
  status: true,
  sourceOrderId: true,     // ← Staff only
  acquisitionId: true,     // ← Staff only
  created_at: true,
  updated_at: true,
} as const satisfies Prisma.InventoryItemSelect;

/**
 * Minimal inventory selector for order validation
 * Used by: order creation, reservation checks
 */
export const inventoryOrderView = {
  id: true,
  status: true,
  selling_price: true,
  sku_id: true,
} as const satisfies Prisma.InventoryItemSelect;
