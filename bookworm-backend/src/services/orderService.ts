// src/services/orderService.ts (fully replaced)
import { Prisma, PrismaClient, Order, InventoryItem } from "@prisma/client";

import { WechatPayAdapter } from "../adapters/wechatPayAdapter";

import * as crypto from "crypto";
import config from "../config";
import { ApiError, WechatPayError, PaymentQueryError } from "../errors";
import { metrics } from "../plugins/metrics";
import { retryAsync } from "../utils/retry";
import {
  isPrismaRetryableError,
  isPickupCodeConstraintError
} from "../utils/typeGuards";
import {
  ORDER_STATUS,
  INVENTORY_STATUS,
  ORDER_TYPE,
  ERROR_CODES,
  ERROR_MESSAGES,
  DEFAULT_VALUES,
  BUSINESS_LIMITS,
  WECHAT_CONSTANTS
} from "../constants";

const CENTS_SCALE = 100;

function decimalToCents(value: Prisma.Decimal): number {
  const scaled = value.mul(CENTS_SCALE);
  if (!scaled.isInteger()) {
    throw new ApiError(500, `Invalid currency precision for value ${value.toString()}`, "INVALID_PRICE_FORMAT");
  }
  return scaled.toNumber();
}

function normalizeCents(value: number | Prisma.Decimal): number {
  return typeof value === "number" ? value : decimalToCents(value);
}

export function formatCentsToYuanString(value: number | Prisma.Decimal): string {
  const cents = normalizeCents(value);
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const integerPart = Math.floor(abs / CENTS_SCALE);
  const fraction = abs % CENTS_SCALE;
  if (fraction === 0) {
    return `${negative ? "-" : ""}${integerPart}`;
  }
  const fractionString = fraction.toString().padStart(2, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${integerPart}.${fractionString}`;
}

// 通用的事务重试辅助函数
export async function withTxRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; i < config.DB_TRANSACTION_RETRY_COUNT; i++) {
    try {
      return await fn();
    } catch (e: unknown) {
      if (isPrismaRetryableError(e)) {
        if (i < config.DB_TRANSACTION_RETRY_COUNT - 1) {
          // Only increment on actual retries, not the final failure
          metrics.dbTransactionRetries.inc();
          const delay =
            config.DB_TRANSACTION_RETRY_BASE_DELAY_MS * Math.pow(2, i) +
            Math.random() * config.DB_TRANSACTION_RETRY_JITTER_MS;
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
      }
      throw e;
    }
  }
  throw new ApiError(
    500,
    ERROR_MESSAGES.SYSTEM_BUSY,
    ERROR_CODES.TX_RETRY_EXCEEDED,
  );
}

// Helper functions for createOrderImpl - each with single responsibility

async function validateOrderInput(input: { userId: number; inventoryItemIds: number[] }) {
  const itemIds = Array.from(new Set(input.inventoryItemIds));
  if (itemIds.length === 0) {
    throw new ApiError(400, "没有选择任何书籍", "EMPTY_ITEMS");
  }
  if (itemIds.length > config.MAX_ITEMS_PER_ORDER) {
    throw new ApiError(400, `单笔订单最多 ${config.MAX_ITEMS_PER_ORDER} 件`, "ORDER_SIZE_EXCEEDED");
  }
  return itemIds;
}

async function acquireOrderLocks(tx: Prisma.TransactionClient, userId: number, itemIds: number[]) {
  // Step 1: User-level lock first (consistent ordering to prevent deadlocks)
  await tx.$executeRawUnsafe(
    'SELECT pg_advisory_xact_lock($1::int4, $2::int4)',
    1,
    userId,
  );

  // Step 2: Acquire item-level advisory locks to prevent concurrent reservation
  // This prevents race conditions when multiple users try to purchase the same book
  // Lock items in sorted order to prevent deadlocks
  const sortedItemIds = [...itemIds].sort((a, b) => a - b);
  for (const itemId of sortedItemIds) {
    await tx.$executeRawUnsafe(
      'SELECT pg_advisory_xact_lock($1::int4, $2::int4)',
      2,
      itemId,
    );
  }
}

async function validateInventoryAndReservations(tx: Prisma.TransactionClient, userId: number, itemIds: number[]) {
  // Check for total reserved items (now safe from race conditions)
  const existingReservedItems = await tx.order.findMany({
    where: { user_id: userId, status: "PENDING_PAYMENT" },
    include: { _count: { select: { orderItem: true } } },
  });
  const totalReservedCount = existingReservedItems.reduce(
    (sum, order) => sum + order._count.orderItem, 0,
  );
  if (totalReservedCount + itemIds.length > config.MAX_RESERVED_ITEMS_PER_USER) {
    throw new ApiError(403, `您预留的商品总数已达上限(${config.MAX_RESERVED_ITEMS_PER_USER}件)，请先完成或取消部分订单`, "MAX_RESERVED_ITEMS_EXCEEDED");
  }

  // Verify items are still available (with locks held)
  const itemsToReserve = await tx.inventoryItem.findMany({
    where: { id: { in: itemIds }, status: INVENTORY_STATUS.IN_STOCK },
  });

  if (itemsToReserve.length !== itemIds.length) {
    throw new ApiError(409, "部分书籍已不可用，请刷新后重试", "INSUFFICIENT_INVENTORY_PRECHECK");
  }

  const totalAmountCents = itemsToReserve.reduce(
    (sum, item) => sum + decimalToCents(item.selling_price),
    0,
  );

  return { itemsToReserve, totalAmountCents };
}

async function generateUniquePickupCode() {
  return crypto
    .randomBytes(config.ORDER_PICKUP_CODE_BYTES)
    .toString("hex")
    .toUpperCase()
    .substring(0, config.ORDER_PICKUP_CODE_LENGTH);
}

async function createOrderRecord(tx: Prisma.TransactionClient, userId: number, totalAmountCents: number) {
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
        continue;
      }
      throw e;
    }
  }

  throw new ApiError(500, "无法生成唯一订单取货码", "PICKUP_CODE_GEN_FAILED");
}

async function reserveInventoryItems(
  tx: Prisma.TransactionClient,
  orderId: number,
  itemIds: number[],
) {
  const updateResult = await tx.inventoryItem.updateMany({
    where: { id: { in: itemIds }, status: INVENTORY_STATUS.IN_STOCK },
    data: { status: INVENTORY_STATUS.RESERVED },
  });

  if (updateResult.count !== itemIds.length) {
    throw new ApiError(409, "部分书籍已经被其他订单锁定，请刷新后重试", "INVENTORY_RACE_CONDITION");
  }

  await tx.inventoryReservation.createMany({
    data: itemIds.map((itemId) => ({
      inventory_item_id: itemId,
      order_id: orderId,
    })),
  });
}

async function createOrderItems(
  tx: Prisma.TransactionClient,
  orderId: number,
  items: Array<{ id: number; selling_price: Prisma.Decimal }>,
) {
  await tx.orderItem.createMany({
    data: items.map((item) => ({
      order_id: orderId,
      inventory_item_id: item.id,
      price: item.selling_price,
    })),
  });
}

async function createOrderImpl(tx: Prisma.TransactionClient, input: {
  userId: number;
  inventoryItemIds: number[];
}) {
  // Step 1: Validate input and normalize item IDs
  const itemIds = await validateOrderInput(input);

  // Step 2: Acquire all necessary locks
  await acquireOrderLocks(tx, input.userId, itemIds);

  // Step 3: Validate inventory availability and user reservations
  const { itemsToReserve, totalAmountCents } = await validateInventoryAndReservations(tx, input.userId, itemIds);

  // Step 4: Create order record with unique pickup code
  const order = await createOrderRecord(tx, input.userId, totalAmountCents);

  // Step 5: Reserve inventory and create order items
  await reserveInventoryItems(tx, order.id, itemIds);
  await createOrderItems(tx, order.id, itemsToReserve);

  // Step 6: Update metrics and return
  metrics.ordersCreated.inc();
  return order;
}

export async function createOrder(dbCtx: PrismaClient | Prisma.TransactionClient, input: {
  userId: number;
  inventoryItemIds: number[];
}) {
  const endTimer = metrics.operationLatency.labels({ operation: 'create_order' }).startTimer();
  try {
    // Check if dbCtx is PrismaClient by checking for $connect method (TransactionClient doesn't have this)
    if ('$connect' in dbCtx) {
      // dbCtx is PrismaClient, create a new transaction with retry logic
      return await withTxRetry(async () => {
        return await (dbCtx as PrismaClient).$transaction(async (tx) => {
          return createOrderImpl(tx, input);
        }, {
          timeout: 15000
        });
      });
    } else {
      // dbCtx is already a TransactionClient, use it directly
      return await createOrderImpl(dbCtx as Prisma.TransactionClient, input);
    }
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002") {
        throw new ApiError(409, "您有一个正在付款的订单，请先完成付款或等待订单过期", "CONCURRENT_PENDING_ORDER");
      }
      if (e.code === "P2010" && typeof e.meta?.message === "string" && e.meta.message.includes("MAX_RESERVED_ITEMS_PER_USER")) {
        throw new ApiError(403, `您预留的商品总数已达上限(${config.MAX_RESERVED_ITEMS_PER_USER}件)，请先完成或取消部分订单`, "MAX_RESERVED_ITEMS_EXCEEDED");
      }
      if (typeof e.message === "string" && e.message.includes("MAX_RESERVED_ITEMS_PER_USER")) {
        throw new ApiError(403, `您预留的商品总数已达上限(${config.MAX_RESERVED_ITEMS_PER_USER}件)，请先完成或取消部分订单`, "MAX_RESERVED_ITEMS_EXCEEDED");
      }
    }
    throw e;
  } finally {
    endTimer();
  }
}

export async function getOrdersByUserId(
  dbCtx: PrismaClient | Prisma.TransactionClient,
  userId: number,
  options: { limit?: number; cursor?: string } = {},
) {
  const { limit = 10, cursor } = options;
  const rawLimit = typeof limit === "number" ? limit : Number(limit);
  const parsedLimit = Number.isFinite(rawLimit) ? Math.floor(rawLimit) : 10;
  const normalizedLimit = Math.max(1, Math.min(parsedLimit, 50));

  let cursorDate: Date | null = null;
  let cursorId: number | null = null;

  if (cursor) {
    const [cursorDatePart, cursorIdPart] = cursor.split("_");
    if (cursorDatePart && cursorIdPart) {
      const parsedDate = new Date(cursorDatePart);
      const parsedId = Number(cursorIdPart);

      if (!Number.isNaN(parsedDate.getTime()) && Number.isInteger(parsedId) && parsedId > 0) {
        cursorDate = parsedDate;
        cursorId = parsedId;
      }
    }
  }

  const where: Prisma.OrderWhereInput = {
    user_id: userId,
  };

  if (cursorDate && cursorId !== null) {
    where.OR = [
      { createdAt: { lt: cursorDate } },
      {
        createdAt: cursorDate,
        id: { lt: cursorId },
      },
    ];
  }

  const orders = await dbCtx.order.findMany({
    where,
    select: {
      id: true,
      user_id: true,
      status: true,
      total_amount: true,
      pickup_code: true,
      paymentExpiresAt: true,
      paid_at: true,
      cancelled_at: true,
      createdAt: true,
      orderItem: {
        select: {
          id: true,
          order_id: true,
          inventory_item_id: true,
          inventoryItem: {
            select: {
              id: true,
              condition: true,
              selling_price: true,
              bookSku: {
                select: {
                  id: true,
                  edition: true,
                  cover_image_url: true,
                  bookMaster: {
                    select: {
                      id: true,
                      isbn13: true,
                      title: true,
                      author: true,
                      publisher: true,
                      original_price: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    orderBy: [
      { createdAt: "desc" },
      { id: "desc" },
    ],
    take: normalizedLimit + 1,
  });

  const hasMore = orders.length > normalizedLimit;
  const pageData = hasMore ? orders.slice(0, normalizedLimit) : orders;
  const nextCursor = hasMore && pageData.length > 0
    ? `${pageData[pageData.length - 1].createdAt.toISOString()}_${pageData[pageData.length - 1].id}`
    : null;

  return {
    data: pageData,
    nextCursor,
  };
}

// NEW: Function to fulfill an order
async function fulfillOrderImpl(dbCtx: Prisma.TransactionClient, pickupCode: string) {
  // ATOMIC CONDITIONAL UPDATE: Only proceed if order exists and is in PENDING_PICKUP state
  const updatedOrder = await dbCtx.order.updateMany({
    where: {
      pickup_code: pickupCode,
      status: "PENDING_PICKUP"
    },
    data: {
      status: "COMPLETED",
      completed_at: new Date(),
    },
  });

  // Check if the atomic update was successful
  if (updatedOrder.count !== 1) {
    // Either order doesn't exist or is not in PENDING_PICKUP state
    const order = await dbCtx.order.findUnique({
      where: { pickup_code: pickupCode },
      select: { id: true, status: true },
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
  const orderItems = await dbCtx.orderItem.findMany({
    where: {
      Order: { pickup_code: pickupCode }
    },
    select: { inventory_item_id: true },
  });

  const inventoryItemIds = orderItems.map(item => item.inventory_item_id);

  // Update inventory items to sold status and clear reservation pointer
  await dbCtx.inventoryItem.updateMany({
    where: { id: { in: inventoryItemIds } },
    data: {
      status: INVENTORY_STATUS.SOLD,
    },
  });

  // Only increment metrics after successful atomic update
  metrics.ordersCompleted.inc();

  // Return the updated order data
  const completedOrder = await dbCtx.order.findUnique({
    where: { pickup_code: pickupCode },
    include: { orderItem: true },
  });

  // Track fulfillment duration if both timestamps exist
  if (completedOrder && completedOrder.paid_at && completedOrder.completed_at) {
    const fulfillmentDurationSeconds =
      (completedOrder.completed_at.getTime() - completedOrder.paid_at.getTime()) / 1000;
    metrics.orderFulfillmentDurationSeconds.observe(fulfillmentDurationSeconds);
  }

  return completedOrder!;
}

export async function fulfillOrder(dbCtx: PrismaClient | Prisma.TransactionClient, pickupCode: string) {
  if ("$connect" in dbCtx) {
    return (dbCtx as PrismaClient).$transaction((tx) => fulfillOrderImpl(tx, pickupCode));
  }

  return fulfillOrderImpl(dbCtx as Prisma.TransactionClient, pickupCode);
}

export interface PaymentIntentContext {
  outTradeNo: string;
  amountTotal: number;
  description: string;
  timeExpireIso: string;
  openid: string;
}

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
      select: { openid: true },
    });

    const orderItems = await tx.orderItem.findMany({
      where: { order_id: orderId },
      select: {
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
      },
    });

    const calculatedTotalCents = orderItems.reduce(
      (sum, item) => sum + decimalToCents(item.price),
      0,
    );

    const storedTotalCents = normalizeCents(order.total_amount);

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
        `CRITICAL: Amount mismatch detected for order ${orderId}. This indicates data corruption!`
      );

      // Increment dedicated metric counter for alerting
      metrics.amountMismatchDetected.inc();

      // Throw generic error to user without leaking internal details
      throw new ApiError(500, ERROR_MESSAGES.INTERNAL_ERROR, "AMOUNT_MISMATCH_FATAL");
    }

    const amountTotal = storedTotalCents;
    if (!Number.isInteger(amountTotal) || amountTotal <= 0 || amountTotal > 100000000) {
      throw new ApiError(400, "订单金额异常", "INVALID_AMOUNT");
    }

    const outTradeNo = `BOOKWORM_${order.id}`;

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

    const titles = orderItems.map((i) => i.inventoryItem.bookSku.bookMaster.title);
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

  return { timeStamp, nonceStr, package: pkg, signType: "RSA" as const, paySign };
}

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

// Payment notification data with security validation requirements
interface PaymentNotificationData {
  timestamp: string;    // WeChat timestamp for replay protection
  nonce: string;        // Random string for replay protection
  signature: string;    // WeChat signature for authenticity
  serial: string;       // Certificate serial number
  body: string;         // Original notification body
  out_trade_no: string; // Business order number
}

export async function processPaymentNotification(
  dbCtx: PrismaClient | Prisma.TransactionClient,
  wechatPayAdapter: WechatPayAdapter,
  notificationData: PaymentNotificationData,
) {
  const endTimer = metrics.operationLatency.labels({ operation: 'process_payment' }).startTimer();
  try {
    const { out_trade_no, timestamp, nonce, signature, serial, body } = notificationData;

    // === Phase 0: Security Validation (Zero Trust) ===

    // 1. Timestamp validation to prevent replay attacks
    const notificationTimestamp = parseInt(timestamp, 10);
    const currentTimestamp = Math.floor(Date.now() / 1000);

    // 拒绝未来时间戳，但允许合理的时钟偏差
    const CLOCK_SKEW_TOLERANCE = 60; // 允许60秒时钟偏差
    if (notificationTimestamp > currentTimestamp + CLOCK_SKEW_TOLERANCE) {
      console.warn(`Payment notification with future timestamp rejected for ${out_trade_no}. Notification: ${notificationTimestamp}, Current: ${currentTimestamp}, Tolerance: ${CLOCK_SKEW_TOLERANCE}s`);
      metrics.paymentsProcessed.labels({ status: "failure", result: "invalid_timestamp" }).inc();
      throw new ApiError(400, "Invalid future timestamp", "TIMESTAMP_INVALID");
    }

    // 检查过期（只允许合理的过去时间）
    if (currentTimestamp - notificationTimestamp > config.PAYMENT_TIMESTAMP_TOLERANCE_SECONDS) {
      console.warn(`Payment notification timestamp validation failed for ${out_trade_no}. Age: ${currentTimestamp - notificationTimestamp}s`);
      metrics.paymentsProcessed.labels({ status: "failure", result: "timestamp_expired" }).inc();
      throw new ApiError(400, "Payment notification expired", "TIMESTAMP_EXPIRED");
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
      console.error(`Payment notification signature validation failed for ${out_trade_no}`);
      metrics.paymentsProcessed.labels({ status: "failure", result: "invalid_signature" }).inc();
      throw new ApiError(400, "Invalid payment notification signature", "SIGNATURE_INVALID");
    }

    // === Phase 1: Pre-checks and Network I/O (Outside Transaction) ===

    // 1. Idempotency Check: See if we've already processed this.
    const initialPaymentRecord = await dbCtx.paymentRecord.findUnique({
      where: { out_trade_no },
    });

    if (!initialPaymentRecord) {
      console.warn(`Payment notification for unknown out_trade_no ${out_trade_no} received. Ignoring.`);
      metrics.paymentsProcessed.labels({ status: "failure", result: "order_not_found" }).inc();
      return;
    }

    if (initialPaymentRecord.status !== 'PENDING') {
      console.log(`Payment notification for ${out_trade_no} already processed (status: ${initialPaymentRecord.status}). Skipping.`);
      return;
    }

    const executeInTransaction = async (fn: (tx: Prisma.TransactionClient) => Promise<void>) => {
      if ("$transaction" in dbCtx) {
        return await (dbCtx as PrismaClient).$transaction(fn);
      }

      return await fn(dbCtx as Prisma.TransactionClient);
    };

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
        metrics.paymentsProcessed.labels({ status: "failed", result: "failed" }).inc();
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
        () => wechatPayAdapter.queryPaymentStatus({ out_trade_no, mchid: config.WXPAY_MCHID }),
        3, // attempts
        200 // initial delay ms
      );
    } catch (queryError) {
      console.error(`Failed to query transaction ${out_trade_no} from WeChat Pay API after retries.`, queryError);

      // Business layer error handling - no HTTP status codes
      if (queryError instanceof WechatPayError && !queryError.isRetryable) {
        await markPaymentAsFailed({}, `Permanent error for ${out_trade_no}: ${queryError.message}. Marked as FAILED.`);
        return; // Stop processing.
      }

      // For all other errors (retryable WechatPayError or unknown errors), throw business exception
      throw new PaymentQueryError("WECHAT_QUERY_FAILED_TRANSIENT", queryError);
    }

    // 3. Validate the Truth
    const { trade_state, amount, payer, mchid, appid, transaction_id } = queriedTxData;

    if (trade_state !== 'SUCCESS') {
      const finalFailureStates = new Set(['CLOSED', 'REVOKED', 'PAYERROR']);
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
        console.log(`Payment for ${out_trade_no} is in transient state (${trade_state}). Requesting retry.`);
        throw new ApiError(503, `Payment in transient state: ${trade_state}`, "PAY_TRANSIENT_STATE");
      }
      return;
    }

    if (mchid !== config.WXPAY_MCHID || appid !== config.WX_APP_ID || amount.total !== initialPaymentRecord.amount_total) {
      console.error(`CRITICAL: Payment data mismatch for ${out_trade_no}. Marking as FAILED.`, {
          expected: { mchid: config.WXPAY_MCHID, appid: config.WX_APP_ID, total: initialPaymentRecord.amount_total },
          received: { mchid, appid, total: amount.total }
      });
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
      if (!paymentRecord || paymentRecord.status !== 'PENDING') {
        console.log(`Payment ${out_trade_no} was processed by a concurrent request. Skipping.`);
        return;
      }

      // THE CRITICAL FIX: ATOMIC CONDITIONAL UPDATE
      // Attempt to transition the order from PENDING_PAYMENT to PENDING_PICKUP.
      // This will only succeed if the status is still PENDING_PAYMENT.
      const updatedOrder = await tx.order.updateMany({
        where: {
          id: paymentRecord.order_id,
          status: 'PENDING_PAYMENT',
        },
        data: {
          status: 'PENDING_PICKUP',
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
            status: 'SUCCESS',
            transaction_id,
            payer_openid: payer?.openid,
            notified_at: new Date(),
          },
        });
        console.log(`Order ${paymentRecord.order_id} successfully updated to PENDING_PICKUP.`);
        metrics.paymentsProcessed.labels({ status: "success", result: "processed" }).inc();
      } else {
        // FAILURE: We lost the race. The order was likely cancelled before payment was confirmed.
        // Mark the payment for refund.
        await tx.paymentRecord.update({
          where: { out_trade_no },
          data: {
            status: 'REFUND_REQUIRED',
            transaction_id,
            payer_openid: payer?.openid,
            notified_at: new Date(),
          },
        });
        console.error(`CRITICAL: Payment succeeded for an order (${paymentRecord.order_id}) that was not PENDING_PAYMENT (likely cancelled). Marked for refund.`);
        metrics.paymentsProcessed.labels({ status: "refund_required", result: "order_cancelled" }).inc();
      }
    });
  } finally {
    endTimer();
  }
}

export async function getPendingPickupOrders(dbCtx: PrismaClient | Prisma.TransactionClient) {
  // Linus式方案：分离查询，手动聚合，消除N+1

  // 1. 获取所有待取货订单及其orderItem（一层include）
  const ordersWithItems = await dbCtx.order.findMany({
    where: { status: "PENDING_PICKUP" },
    include: {
      orderItem: true, // 只include一层，避免深层嵌套
    },
    orderBy: { paid_at: "asc" },
  });

  // 2. 提取所有inventory_item_id
  const inventoryItemIds = ordersWithItems.flatMap((o) =>
    o.orderItem.map((item) => item.inventory_item_id),
  );

  // 如果没有订单，直接返回空数组
  if (inventoryItemIds.length === 0) {
    return [];
  }

  // 3. 一次性查询所有相关的inventory数据
  const inventoryItems = await dbCtx.inventoryItem.findMany({
    where: {
      id: { in: inventoryItemIds },
    },
    select: {
      id: true,
      condition: true,
      selling_price: true,
      status: true,
      bookSku: {
        select: {
          id: true,
          edition: true,
          cover_image_url: true,
          bookMaster: {
            select: {
              id: true,
              isbn13: true,
              title: true,
              author: true,
              publisher: true,
              original_price: true,
            },
          },
        },
      },
    },
  });

  // 4. 创建inventory数据的快速查找Map
  const inventoryMap = new Map(inventoryItems.map((item) => [item.id, item]));

  // 5. 手动聚合数据：将完整的inventory信息附加到每个orderItem上
  // 防御性检查：如果inventoryItem缺失（数据完整性问题），记录严重错误并过滤
  const enrichedOrders = ordersWithItems.map((order) => {
    const enrichedItems = order.orderItem
      .map((item) => {
        const inventoryItem = inventoryMap.get(item.inventory_item_id);

        // CRITICAL: If inventoryItem is missing, this indicates a database integrity violation
        if (!inventoryItem) {
          console.error(
            `[DATA INTEGRITY ERROR] Order ${order.id} references missing InventoryItem ${item.inventory_item_id}. ` +
            `This should never happen if foreign key constraints are working correctly. ` +
            `Filtering out this item from the response.`
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

export async function cancelExpiredOrders(dbCtx: Prisma.TransactionClient | PrismaClient) {
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
    console.log(
      `Atomically cancelled ${cancelledCount} orders and released ${releasedCount} items back to stock.`
    );
    metrics.ordersCancelled.inc(cancelledCount);
  }

  // The function signature remains the same, returning only the cancelled order count.
  return { cancelledCount };
}

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

  const selectFields = {
    id: true,
    user_id: true,
    status: true,
    total_amount: true,
    pickup_code: true,
    paymentExpiresAt: true,
    paid_at: true,
    cancelled_at: true,
    createdAt: true,
    orderItem: {
      select: {
        id: true,
        order_id: true,
        inventory_item_id: true,
        inventoryItem: {
          select: {
            id: true,
            condition: true,
            selling_price: true,
            bookSku: {
              select: {
                id: true,
                edition: true,
                cover_image_url: true,
                bookMaster: {
                  select: {
                    id: true,
                    isbn13: true,
                    title: true,
                    author: true,
                    publisher: true,
                    original_price: true,
                  },
                },
              },
            },
          },
        },
      },
    },
  };

  let order;

  if (userWithRole.role === "STAFF") {
    // STAFF can access any order
    order = await dbCtx.order.findUnique({
      where: { id: orderId },
      select: selectFields,
    });
  } else {
    // USER can only access their own orders - use findFirst with compound conditions
    order = await dbCtx.order.findFirst({
      where: {
        id: orderId,
        user_id: userId,
      },
      select: selectFields,
    });
  }

  if (!order) {
    throw new ApiError(404, "Order not found", "ORDER_NOT_FOUND");
  }

  return order;
}

async function updateOrderStatusImpl(
  dbCtx: Prisma.TransactionClient,
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
  const currentOrder = await dbCtx.order.findUnique({
    where: { id: orderId },
    include: {
      orderItem: {
        include: {
          inventoryItem: true,
        },
      },
    },
  });

  if (!currentOrder) {
    throw new ApiError(404, "订单不存在", "ORDER_NOT_FOUND");
  }

  // Check if status transition is valid
  const validTransitions: Record<string, string[]> = {
    PENDING_PAYMENT: ["CANCELLED"],
    PENDING_PICKUP: ["COMPLETED", "CANCELLED"],
    COMPLETED: [],
    CANCELLED: [],
  };

  const allowedTransitions = validTransitions[currentOrder.status];
  if (!allowedTransitions?.includes(newStatus)) {
    throw new ApiError(
      400,
      `无法将订单从 ${currentOrder.status} 更新为 ${newStatus}`,
      "INVALID_STATUS_TRANSITION",
    );
  }

  // Update order status
  const updatedOrder = await dbCtx.order.update({
    where: { id: orderId },
    data: {
      status: newStatus,
      ...(newStatus === "COMPLETED" && { completed_at: new Date() }),
      ...(newStatus === "CANCELLED" && { cancelled_at: new Date() }),
    },
  });

  // Update inventory items based on new status
  if (newStatus === "COMPLETED") {
    // Mark all items as sold and clear reservation pointer
    await dbCtx.inventoryItem.updateMany({
      where: {
        id: {
          in: currentOrder.orderItem.map((item) => item.inventory_item_id),
        },
      },
      data: {
        status: INVENTORY_STATUS.SOLD,
      },
    });
    metrics.ordersCompleted.inc();
  } else if (newStatus === "CANCELLED") {
    const inventoryItemIds = currentOrder.orderItem.map((item) => item.inventory_item_id);

    // Release inventory back to stock
    await dbCtx.inventoryItem.updateMany({
      where: {
        id: {
          in: inventoryItemIds,
        },
      },
      data: {
        status: INVENTORY_STATUS.IN_STOCK,
      },
    });

    // Delete reservation records
    await dbCtx.inventoryReservation.deleteMany({
      where: {
        inventory_item_id: {
          in: inventoryItemIds,
        },
      },
    });

    // If cancelling a paid order, mark payment for refund
    if (currentOrder.status === "PENDING_PICKUP") {
      await dbCtx.paymentRecord.updateMany({
        where: { order_id: orderId, status: 'SUCCESS' },
        data: { status: 'REFUND_REQUIRED' }
      });
    }

    metrics.ordersCancelled.inc();
  }

  return updatedOrder;
}

export async function updateOrderStatus(
  dbCtx: PrismaClient | Prisma.TransactionClient,
  orderId: number,
  newStatus: "COMPLETED" | "CANCELLED",
  user: { userId: number; role: string },
) {
  if ("$connect" in dbCtx) {
    return (dbCtx as PrismaClient).$transaction((tx) => updateOrderStatusImpl(tx, orderId, newStatus, user));
  }

  return updateOrderStatusImpl(dbCtx as Prisma.TransactionClient, orderId, newStatus, user);
}

//
// ============================================================================
// SECTION: Sell Order Workflow (Single-Step Completion)
// ============================================================================
//

export interface CreateAndCompleteSellOrderInput {
  userId: number;
  totalWeightKg: number;
  unitPrice: number; // Price in cents per kg
  settlementType: 'CASH' | 'VOUCHER';
  notes?: string;
}

export interface CreateAndCompleteSellOrderResult {
  order: Order;
  inventoryItem: InventoryItem;
}

const BULK_ACQUISITION_ISBN = "0000000000000";

async function createAndCompleteSellOrderImpl(
  tx: Prisma.TransactionClient,
  input: CreateAndCompleteSellOrderInput,
): Promise<CreateAndCompleteSellOrderResult> {
  if (input.totalWeightKg <= 0 || input.unitPrice <= 0) {
    throw new ApiError(400, "重量和单价必须是正数", "INVALID_SELL_ORDER_INPUT");
  }

  const baseAmount = Math.round(input.totalWeightKg * input.unitPrice);
  const voucherFaceValue = input.settlementType === 'VOUCHER' ? baseAmount * 2 : null;

  const bulkMaster = await tx.bookMaster.upsert({
    where: { isbn13: BULK_ACQUISITION_ISBN },
    update: {},
    create: {
      isbn13: BULK_ACQUISITION_ISBN,
      title: "批量收购书籍",
      author: "N/A",
      publisher: "N/A",
    },
  });

  const bulkSku = await tx.bookSku.upsert({
    where: {
      master_id_edition: {
        master_id: bulkMaster.id,
        edition: "批量",
      },
    },
    update: {},
    create: {
      master_id: bulkMaster.id,
      edition: "批量",
    },
  });

  const now = new Date();

  const order = await tx.order.create({
    data: {
      user_id: input.userId,
      status: ORDER_STATUS.COMPLETED,
      type: ORDER_TYPE.SELL,
      total_amount: baseAmount,
      voucherFaceValue,
      pickup_code: await generateUniquePickupCode(),
      paymentExpiresAt: now,
      paid_at: now,
      completed_at: now,
      totalWeightKg: input.totalWeightKg,
      unitPrice: input.unitPrice,
      settlementType: input.settlementType,
      notes: input.notes,
    },
  });

  const inventoryItem = await tx.inventoryItem.create({
    data: {
      sku_id: bulkSku.id,
      condition: "ACCEPTABLE",
      cost: new Prisma.Decimal((voucherFaceValue ?? baseAmount) / 100),
      selling_price: new Prisma.Decimal(0),
      status: INVENTORY_STATUS.BULK_ACQUISITION,
      sourceOrderId: order.id,
    },
  });

  if (input.settlementType === 'VOUCHER' && voucherFaceValue) {
    // 预留钩子：后续在此调用发券服务并写入审计日志
  }

  return { order, inventoryItem };
}

export function createAndCompleteSellOrder(
  dbCtx: PrismaClient,
  input: CreateAndCompleteSellOrderInput,
): Promise<CreateAndCompleteSellOrderResult> {
  return withTxRetry(async () => {
    return dbCtx.$transaction(
      (tx) => createAndCompleteSellOrderImpl(tx, input),
      {
        timeout: BUSINESS_LIMITS.TRANSACTION_TIMEOUT_MS,
      },
    );
  });
}
