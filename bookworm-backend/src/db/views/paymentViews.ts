// src/db/views/paymentViews.ts
// Centralized PaymentRecord model data access selectors

import type { Prisma } from '@prisma/client';

/**
 * Payment record for refund validation
 * Used by: payment webhook, refund processor
 */
export const paymentRecordRefundView = {
  id: true,
  status: true,
  order_id: true,
} as const satisfies Prisma.PaymentRecordSelect;

/**
 * Payment record for refund processing (includes amount and attempts)
 * Used by: refund processor job
 */
export const paymentRecordRefundProcessView = {
  id: true,
  out_trade_no: true,
  amount_total: true,
  refund_attempts: true,
} as const satisfies Prisma.PaymentRecordSelect;
