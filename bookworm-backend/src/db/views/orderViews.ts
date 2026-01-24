// src/db/views/orderViews.ts
// Centralized Order model data access selectors

import type { Prisma } from '@prisma/client';

/**
 * Order list view (summary for collections)
 * Used by: GET /api/orders/my, GET /api/orders/pending-pickup
 */
export const orderListView = {
  id: true,
  user_id: true,
  status: true,
  total_amount: true,
  type: true,
  createdAt: true,
  paid_at: true,
  completed_at: true,
  pickup_code: true,
  sellDetails: true, // Phase 2: Include SELL order details
} as const satisfies Prisma.OrderSelect;

/**
 * Order detail with items
 * Used by: GET /api/orders/:id, POST /api/orders/create, POST /api/sell-orders
 */
export const orderDetailInclude = {
  orderItem: {
    include: {
      inventoryItem: {
        include: {
          bookSku: {
            include: {
              bookMaster: {
                select: {
                  title: true,
                  author: true,
                  isbn13: true,
                },
              },
            },
          },
        },
      },
    },
  },
  sellDetails: true, // Phase 2: Include SELL order details for type='SELL' orders
} as const satisfies Prisma.OrderInclude;

/**
 * Order for fulfillment (pickup flow)
 * Used by: POST /api/orders/fulfill
 */
export const orderFulfillInclude = {
  orderItem: {
    include: {
      inventoryItem: {
        select: {
          id: true,
          status: true,
        },
      },
    },
  },
} as const satisfies Prisma.OrderInclude;

/**
 * Minimal order select for payment queries
 * Used by: payment service
 */
export const orderPaymentView = {
  id: true,
  user_id: true,
  status: true,
  total_amount: true,
  paymentExpiresAt: true,
} as const satisfies Prisma.OrderSelect;

/**
 * Order with item count only
 * Used by: validation checks, quota enforcement
 */
export const orderCountInclude = {
  _count: { select: { orderItem: true } },
} as const satisfies Prisma.OrderInclude;

/**
 * Order with basic items (inventory IDs only)
 * Used by: fulfillment, inventory updates
 */
export const orderWithItemsInclude = {
  orderItem: true,
} as const satisfies Prisma.OrderInclude;

/**
 * Order ID and status only
 * Used by: quick status checks
 */
export const orderIdStatusView = {
  id: true,
  status: true,
} as const satisfies Prisma.OrderSelect;

/**
 * OrderItem with inventory ID only
 * Used by: fulfillment, inventory status updates
 */
export const orderItemInventoryIdView = {
  inventory_item_id: true,
} as const satisfies Prisma.OrderItemSelect;

/**
 * OrderItem with price and book title (for payment description)
 * Used by: payment service (order description generation)
 */
export const orderItemPaymentView = {
  price: true,
  inventoryItem: {
    select: {
      bookSku: {
        select: {
          bookMaster: {
            select: {
              title: true,
            },
          },
        },
      },
    },
  },
} as const satisfies Prisma.OrderItemSelect;
