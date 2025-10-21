// src/services/orders/payments.ts
// Payment processing module with WeChat Pay integration
// CRITICAL: Contains payment callback idempotency logic - DO NOT MODIFY WITHOUT TESTS

import * as crypto from "crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { WechatPayAdapter } from "../../adapters/wechatPayAdapter";
import config from "../../config";
import {
  ApiError,
  WechatPayError,
  PaymentQueryError,
} from "../../errors";
import { metrics } from "../../plugins/metrics";
import { retryAsync } from "../../utils/retry";
import { log } from "../../lib/logger";
import { ERROR_MESSAGES } from "../../constants";
import { userOpenidView, orderItemPaymentView } from "../../db/views";

/**
 * Payment intent context for WeChat Pay order creation
 */
export interface PaymentIntentContext {
  outTradeNo: string;
  amountTotal: number;
  description: string;
  timeExpireIso: string;
  openid: string;
}

/**
 * Payment notification data with security validation requirements
 */
interface PaymentNotificationData {
  timestamp: string; // WeChat timestamp for replay protection
  nonce: string; // Random string for replay protection
  signature: string; // WeChat signature for authenticity
  serial: string; // Certificate serial number
  body: string; // Original notification body
  out_trade_no: string; // Business order number
}

/**
 * Prepares payment intent data for WeChat Pay order creation
 *
 * Validation:
 * - Order must be in PENDING_PAYMENT status
 * - User must own the order
 * - Amount must match between orderItems sum and stored total (integrity check)
 *
 * Side effects:
 * - Upserts PaymentRecord (idempotent)
 *
 * @param prisma - Prisma client
 * @param orderId - Order ID
 * @param userId - User ID for authorization
 * @returns Payment intent context
 * @throws ApiError(403) if unauthorized
 * @throws ApiError(409) if order status invalid
 * @throws ApiError(500) if amount mismatch detected
 */
export async function preparePaymentIntent(
  prisma: PrismaClient,
  orderId: number,
  userId: number,
): Promise<PaymentIntentContext> {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });

    if (order.user_id !== userId) {
      throw new ApiError(403, "无权支付此订单", "FORBIDDEN");
    }

    if (order.status !== "PENDING_PAYMENT") {
      throw new ApiError(409, "订单状态不正确", "ORDER_STATE_INVALID");
    }

    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: userOpenidView,
    });

    const orderItems = await tx.orderItem.findMany({
      where: { order_id: orderId },
      select: orderItemPaymentView,
    });

    // CRITICAL: Amount integrity check
    const calculatedTotalCents = orderItems.reduce(
      (sum, item) => sum + item.price,
      0,
    );
    const storedTotalCents = order.total_amount;

    if (calculatedTotalCents !== storedTotalCents) {
      // TODO: Inject Fastify logger from request context for proper structured logging
      // For now, use console.error to log at highest severity level
      console.error(
        {
          orderId: orderId,
          storedAmount: storedTotalCents,
          calculatedAmount: calculatedTotalCents,
          userId: userId,
        },
        `CRITICAL: Amount mismatch detected for order ${orderId}. This indicates data corruption!`,
      );

      // Increment dedicated metric counter for alerting
      metrics.amountMismatchDetected.inc();

      // Throw generic error to user without leaking internal details
      throw new ApiError(
        500,
        ERROR_MESSAGES.INTERNAL_ERROR,
        "AMOUNT_MISMATCH_FATAL",
      );
    }

    const amountTotal = storedTotalCents;

    // Sanity check: amount must be positive integer within reasonable range
    if (
      !Number.isInteger(amountTotal) ||
      amountTotal <= 0 ||
      amountTotal > 100000000
    ) {
      throw new ApiError(400, "订单金额异常", "INVALID_AMOUNT");
    }

    const outTradeNo = `BOOKWORM_${order.id}`;

    // Upsert payment record (idempotent)
    await tx.paymentRecord.upsert({
      where: { out_trade_no: outTradeNo },
      create: {
        out_trade_no: outTradeNo,
        order_id: order.id,
        status: "PENDING",
        amount_total: amountTotal,
        appid: config.WX_APP_ID,
        mchid: config.WXPAY_MCHID,
      },
      update: {
        amount_total: amountTotal,
      },
    });

    // Generate order description
    const titles = orderItems.map(
      (i) => i.inventoryItem.bookSku.bookMaster.title,
    );
    const description =
      titles.slice(0, 3).join("、") +
      (titles.length > 3 ? `等${titles.length}本书籍` : "");

    return {
      outTradeNo,
      amountTotal,
      description,
      timeExpireIso: new Date(order.paymentExpiresAt).toISOString(),
      openid: user.openid,
    };
  });
}

/**
 * Builds WeChat Pay order creation request
 */
export function buildWechatPaymentRequest(intent: PaymentIntentContext) {
  return {
    appid: config.WX_APP_ID,
    mchid: config.WXPAY_MCHID,
    description: intent.description,
    out_trade_no: intent.outTradeNo,
    notify_url: config.WXPAY_NOTIFY_URL,
    time_expire: intent.timeExpireIso,
    amount: { total: intent.amountTotal, currency: "CNY" as const },
    payer: { openid: intent.openid },
  };
}

/**
 * Builds client-side payment signature for Mini Program
 *
 * Required parameters for wx.requestPayment:
 * - timeStamp: Current timestamp
 * - nonceStr: Random string
 * - package: prepay_id from WeChat
 * - signType: RSA
 * - paySign: Signature generated by merchant private key
 */
export function buildClientPaymentSignature(
  intent: PaymentIntentContext,
  prepayId: string,
  wechatPayAdapter: WechatPayAdapter,
) {
  const timeStamp = Math.floor(Date.now() / 1000).toString();
  const nonceStr = crypto.randomBytes(16).toString("hex");
  const pkg = `prepay_id=${prepayId}`;
  const toSign = `${config.WX_APP_ID}\n${timeStamp}\n${nonceStr}\n${pkg}\n`;

  const paySign = wechatPayAdapter.generateSignature({ message: toSign });

  return {
    timeStamp,
    nonceStr,
    package: pkg,
    signType: "RSA" as const,
    paySign,
  };
}

/**
 * Generates payment parameters for Mini Program
 *
 * Flow:
 * 1. Prepare payment intent (validate order, create payment record)
 * 2. Call WeChat Pay API to create prepay order
 * 3. Generate client signature
 *
 * @param prisma - Prisma client
 * @param wechatPayAdapter - WeChat Pay adapter
 * @param orderId - Order ID
 * @param userId - User ID for authorization
 * @returns Payment parameters for wx.requestPayment
 */
export async function generatePaymentParams(
  prisma: PrismaClient,
  wechatPayAdapter: WechatPayAdapter,
  orderId: number,
  userId: number,
) {
  const intent = await preparePaymentIntent(prisma, orderId, userId);
  const { prepay_id } = await wechatPayAdapter.createPaymentOrder(
    buildWechatPaymentRequest(intent),
  );

  return buildClientPaymentSignature(intent, prepay_id, wechatPayAdapter);
}

/**
 * Processes WeChat Pay payment notification callback
 *
 * CRITICAL: This function implements strict idempotency guarantees:
 * - Multiple calls with same out_trade_no result in same final state
 * - Uses atomic conditional updates (updateMany + count check)
 * - Handles race conditions between concurrent callbacks
 *
 * Three-phase execution:
 * === Phase 0: Security Validation (Zero Trust) ===
 * 1. Timestamp validation (prevent replay attacks)
 * 2. Signature validation (prevent tampering)
 *
 * === Phase 1: Pre-checks and Network I/O (Outside Transaction) ===
 * 1. Idempotency check (early return if already processed)
 * 2. Active query to WeChat Pay API (don't trust notification body)
 * 3. Payment data validation
 *
 * === Phase 2: Atomic State Update (Inside Transaction) ===
 * 1. Attempt atomic order status update (PENDING_PAYMENT → PENDING_PICKUP)
 * 2. If successful: Mark payment as SUCCESS
 * 3. If failed (order already cancelled): Mark payment for REFUND_REQUIRED
 *
 * State transitions:
 * - Order: PENDING_PAYMENT → PENDING_PICKUP (success) or REFUND_REQUIRED (cancelled)
 * - PaymentRecord: PENDING → SUCCESS or REFUND_REQUIRED
 *
 * Idempotency guarantees:
 * - Uses updateMany().count to detect concurrent updates
 * - Re-checks payment status before each write
 * - Early returns on already-processed notifications
 *
 * @param dbCtx - Database context
 * @param wechatPayAdapter - WeChat Pay adapter
 * @param notificationData - Payment notification data
 */
export async function processPaymentNotification(
  dbCtx: PrismaClient | Prisma.TransactionClient,
  wechatPayAdapter: WechatPayAdapter,
  notificationData: PaymentNotificationData,
) {
  const endTimer = metrics.operationLatency
    .labels({ operation: "process_payment" })
    .startTimer();
  try {
    const { out_trade_no, timestamp, nonce, signature, serial, body } =
      notificationData;

    // === Phase 0: Security Validation (Zero Trust) ===

    // 1. Timestamp validation to prevent replay attacks
    const notificationTimestamp = parseInt(timestamp, 10);
    const currentTimestamp = Math.floor(Date.now() / 1000);

    // Reject future timestamps (allow reasonable clock skew)
    const CLOCK_SKEW_TOLERANCE = 60; // Allow 60 seconds clock skew
    if (notificationTimestamp > currentTimestamp + CLOCK_SKEW_TOLERANCE) {
      console.warn(
        `Payment notification with future timestamp rejected for ${out_trade_no}. Notification: ${notificationTimestamp}, Current: ${currentTimestamp}, Tolerance: ${CLOCK_SKEW_TOLERANCE}s`,
      );
      metrics.paymentsProcessed
        .labels({ status: "failure", result: "invalid_timestamp" })
        .inc();
      throw new ApiError(400, "Invalid future timestamp", "TIMESTAMP_INVALID");
    }

    // Check expiration (only allow reasonable past time)
    if (
      currentTimestamp - notificationTimestamp >
      config.PAYMENT_TIMESTAMP_TOLERANCE_SECONDS
    ) {
      console.warn(
        `Payment notification timestamp validation failed for ${out_trade_no}. Age: ${currentTimestamp - notificationTimestamp}s`,
      );
      metrics.paymentsProcessed
        .labels({ status: "failure", result: "timestamp_expired" })
        .inc();
      throw new ApiError(
        400,
        "Payment notification expired",
        "TIMESTAMP_EXPIRED",
      );
    }

    // 2. Signature validation to ensure authenticity
    const isSignatureValid = wechatPayAdapter.verifySignature({
      timestamp,
      nonce,
      body,
      signature,
      serial,
    });

    if (!isSignatureValid) {
      console.error(
        `Payment notification signature validation failed for ${out_trade_no}`,
      );
      metrics.paymentsProcessed
        .labels({ status: "failure", result: "invalid_signature" })
        .inc();
      throw new ApiError(
        400,
        "Invalid payment notification signature",
        "SIGNATURE_INVALID",
      );
    }

    // === Phase 1: Pre-checks and Network I/O (Outside Transaction) ===

    // 1. Idempotency Check: See if we've already processed this.
    const initialPaymentRecord = await dbCtx.paymentRecord.findUnique({
      where: { out_trade_no },
    });

    if (!initialPaymentRecord) {
      console.warn(
        `Payment notification for unknown out_trade_no ${out_trade_no} received. Ignoring.`,
      );
      metrics.paymentsProcessed
        .labels({ status: "failure", result: "order_not_found" })
        .inc();
      return;
    }

    if (initialPaymentRecord.status !== "PENDING") {
      log.info(
        `Payment notification for ${out_trade_no} already processed (status: ${initialPaymentRecord.status}). Skipping.`,
      );
      return;
    }

    // Helper to execute code in transaction
    const executeInTransaction = async (
      fn: (tx: Prisma.TransactionClient) => Promise<void>,
    ) => {
      if ("$transaction" in dbCtx) {
        return await (dbCtx as PrismaClient).$transaction(fn);
      }

      return await fn(dbCtx as Prisma.TransactionClient);
    };

    // Helper to mark payment as failed
    const markPaymentAsFailed = async (
      updateData: Prisma.PaymentRecordUpdateManyMutationInput = {},
      logMessage?: string,
    ) => {
      const failed = await dbCtx.paymentRecord.updateMany({
        where: {
          out_trade_no,
          status: "PENDING",
        },
        data: {
          status: "FAILED",
          notified_at: new Date(),
          ...updateData,
        },
      });

      if (failed.count > 0) {
        if (logMessage) {
          console.warn(logMessage);
        }
        metrics.paymentsProcessed
          .labels({ status: "failed", result: "failed" })
          .inc();
      } else if (logMessage) {
        console.warn(
          `${logMessage} (skipped because payment record was already processed for ${out_trade_no}).`,
        );
      }
    };

    // 2. Active Query (Zero Trust Principle): Get the truth from WeChat's servers.
    let queriedTxData;
    try {
      queriedTxData = await retryAsync(
        () =>
          wechatPayAdapter.queryPaymentStatus({
            out_trade_no,
            mchid: config.WXPAY_MCHID,
          }),
        3, // attempts
        200, // initial delay ms
      );
    } catch (queryError) {
      console.error(
        `Failed to query transaction ${out_trade_no} from WeChat Pay API after retries.`,
        queryError,
      );

      // Business layer error handling - no HTTP status codes
      if (queryError instanceof WechatPayError && !queryError.isRetryable) {
        await markPaymentAsFailed(
          {},
          `Permanent error for ${out_trade_no}: ${queryError.message}. Marked as FAILED.`,
        );
        return; // Stop processing.
      }

      // For all other errors (retryable WechatPayError or unknown errors), throw business exception
      throw new PaymentQueryError("WECHAT_QUERY_FAILED_TRANSIENT", queryError);
    }

    // 3. Validate the Truth
    const { trade_state, amount, payer, mchid, appid, transaction_id } =
      queriedTxData;

    if (trade_state !== "SUCCESS") {
      const finalFailureStates = new Set(["CLOSED", "REVOKED", "PAYERROR"]);
      if (finalFailureStates.has(trade_state)) {
        await markPaymentAsFailed(
          {
            transaction_id,
            payer_openid: payer?.openid,
          },
          `Payment for ${out_trade_no} is in a final failure state (${trade_state}). Marked as FAILED.`,
        );
      } else {
        // For transient states like USERPAYING, we want WeChat to retry later.
        log.info(
          `Payment for ${out_trade_no} is in transient state (${trade_state}). Requesting retry.`,
        );
        throw new ApiError(
          503,
          `Payment in transient state: ${trade_state}`,
          "PAY_TRANSIENT_STATE",
        );
      }
      return;
    }

    if (
      mchid !== config.WXPAY_MCHID ||
      appid !== config.WX_APP_ID ||
      amount.total !== initialPaymentRecord.amount_total
    ) {
      console.error(
        `CRITICAL: Payment data mismatch for ${out_trade_no}. Marking as FAILED.`,
        {
          expected: {
            mchid: config.WXPAY_MCHID,
            appid: config.WX_APP_ID,
            total: initialPaymentRecord.amount_total,
          },
          received: { mchid, appid, total: amount.total },
        },
      );
      await markPaymentAsFailed({
        transaction_id,
        payer_openid: payer?.openid,
      });
      return;
    }

    // === Phase 2: Atomic State Update (Inside Transaction) ===
    await executeInTransaction(async (tx) => {
      // Re-fetch payment record to ensure it's still PENDING before we start.
      // This is an additional safeguard.
      const paymentRecord = await tx.paymentRecord.findUnique({
        where: { out_trade_no },
      });

      // Another process might have handled it. If so, we're done.
      if (!paymentRecord || paymentRecord.status !== "PENDING") {
        log.info(
          `Payment ${out_trade_no} was processed by a concurrent request. Skipping.`,
        );
        return;
      }

      // THE CRITICAL FIX: ATOMIC CONDITIONAL UPDATE
      // Attempt to transition the order from PENDING_PAYMENT to PENDING_PICKUP.
      // This will only succeed if the status is still PENDING_PAYMENT.
      const updatedOrder = await tx.order.updateMany({
        where: {
          id: paymentRecord.order_id,
          status: "PENDING_PAYMENT",
        },
        data: {
          status: "PENDING_PICKUP",
          paid_at: new Date(),
        },
      });

      // Check if the atomic update was successful.
      if (updatedOrder.count === 1) {
        // SUCCESS: We won the race. The order is now PENDING_PICKUP.
        // Finalize the payment record.
        await tx.paymentRecord.update({
          where: { out_trade_no },
          data: {
            status: "SUCCESS",
            transaction_id,
            payer_openid: payer?.openid,
            notified_at: new Date(),
          },
        });
        log.info(
          `Order ${paymentRecord.order_id} successfully updated to PENDING_PICKUP.`,
        );
        metrics.paymentsProcessed
          .labels({ status: "success", result: "processed" })
          .inc();
      } else {
        // FAILURE: We lost the race. The order was likely cancelled before payment was confirmed.
        // Mark the payment for refund.
        await tx.paymentRecord.update({
          where: { out_trade_no },
          data: {
            status: "REFUND_REQUIRED",
            transaction_id,
            payer_openid: payer?.openid,
            notified_at: new Date(),
          },
        });
        console.error(
          `CRITICAL: Payment succeeded for an order (${paymentRecord.order_id}) that was not PENDING_PAYMENT (likely cancelled). Marked for refund.`,
        );
        metrics.paymentsProcessed
          .labels({ status: "refund_required", result: "order_cancelled" })
          .inc();
      }
    });
  } finally {
    endTimer();
  }
}
