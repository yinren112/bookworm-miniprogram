// src/db/views/userViews.ts
// Centralized User model data access selectors

import type { Prisma } from '@prisma/client';

/**
 * Role-only selector for permission checks
 * Used by: auth plugin, permission verification
 */
export const userRoleView = {
  role: true,
} as const satisfies Prisma.UserSelect;

/**
 * Public user info (safe for API responses)
 * Used by: GET /api/users/me
 */
export const userPublicView = {
  id: true,
  role: true,
  created_at: true,
  phone_number: true,
  nickname: true,
  avatar_url: true,
} as const satisfies Prisma.UserSelect;

/**
 * Minimal user identification (for logging/auditing)
 * Used by: audit logs, transaction records
 */
export const userIdView = {
  id: true,
  openid: true,
} as const satisfies Prisma.UserSelect;

/**
 * ID-only selector (minimal query)
 * Used by: conflict checks, existence validation
 */
export const userIdOnlyView = {
  id: true,
} as const satisfies Prisma.UserSelect;

/**
 * ID and status selector
 * Used by: order status checks
 */
export const userIdStatusView = {
  id: true,
  status: true,
} as const satisfies Prisma.UserSelect;

/**
 * OpenID-only selector for payment operations
 * Used by: payment service (WeChat Pay payer identification)
 */
export const userOpenidView = {
  openid: true,
} as const satisfies Prisma.UserSelect;
