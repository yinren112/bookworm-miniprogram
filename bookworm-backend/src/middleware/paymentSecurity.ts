// src/middleware/paymentSecurity.ts
// Payment notification security middleware
// Implements validation, idempotency, and decryption in a clean pipeline

import { FastifyRequest, FastifyReply } from "fastify";
import { Value } from "@sinclair/typebox/value";
import { WechatPayNotifySchema } from "../schemas/wechatPayNotify";
import { WechatPayAdapter } from "../adapters/wechatPayAdapter";
import { WECHAT_CONSTANTS } from "../constants";
import config from "../config";
import prisma from "../db";

/**
 * Extended FastifyRequest with payment notification data
 *
 * Uses request decoration to pass validated/decrypted data down the pipeline
 */
export interface PaymentNotificationRequest extends FastifyRequest {
  validatedPayload?: {
    id: string;
    event_type: string;
    resource: {
      algorithm: string;
      ciphertext: string;
      nonce: string;
      associated_data?: string;
    };
  };
  isNewEvent?: boolean;
  decryptedNotification?: {
    out_trade_no: string;
    transaction_id?: string;
    trade_state: string;
    trade_state_desc: string;
    mchid: string;
    appid: string;
    timestamp: string;
    nonce: string;
    signature: string;
    serial: string;
    body: string;
    [key: string]: unknown;
  };
}

// Payment notification ACK strategy (same as payment.ts)
const WXPAY_ACK_STRICT = process.env.WXPAY_ACK_STRICT === 'true';

/**
 * Middleware 1: Validate payment notification schema
 *
 * Validates the request body against WechatPayNotifySchema using TypeBox.
 * Returns 400 (strict mode) or 200 (tolerant mode) on validation failure.
 *
 * Decorates: request.validatedPayload
 */
export async function validatePaymentSchema(
  request: PaymentNotificationRequest,
  reply: FastifyReply
): Promise<void> {
  const rawBody = request.rawBody;

  if (!rawBody) {
    request.log.warn("Missing raw body for payment notification");
    reply.code(400).send({ code: "BAD_REQUEST", message: "Missing body" });
    return;
  }

  const payload = typeof rawBody === 'string' ? JSON.parse(rawBody) : request.body;

  // Runtime schema validation (TypeBox)
  if (!Value.Check(WechatPayNotifySchema, payload)) {
    const errors = [...Value.Errors(WechatPayNotifySchema, payload)];
    request.log.warn({ payload, errors }, 'Invalid WeChat Pay notification schema');

    if (WXPAY_ACK_STRICT) {
      // Strict mode: return 400 (WeChat will retry, may cause retry storm)
      reply.code(400).send({ code: "BAD_REQUEST", message: "Invalid payload schema" });
    } else {
      // Tolerant mode (default): return 200 to stop retries
      reply.code(200).send({
        code: WECHAT_CONSTANTS.SUCCESS_CODE,
        message: WECHAT_CONSTANTS.SUCCESS_MESSAGE
      });
    }
    return;
  }

  // Decorate request with validated payload
  request.validatedPayload = payload;
}

/**
 * Middleware 2: Check idempotency (replay protection)
 *
 * Checks if the webhook event ID has already been processed.
 * Returns 200 immediately if duplicate (idempotent response).
 *
 * Decorates: request.isNewEvent = true
 */
export async function checkIdempotency(
  request: PaymentNotificationRequest,
  reply: FastifyReply
): Promise<void> {
  const payload = request.validatedPayload;

  if (!payload) {
    // Should never happen if validatePaymentSchema ran first
    request.log.error("checkIdempotency called without validatedPayload");
    reply.code(500).send({ code: "INTERNAL_ERROR", message: "Invalid middleware order" });
    return;
  }

  const existingEvent = await prisma.webhookEvent.findUnique({
    where: { id: payload.id },
  });

  if (existingEvent?.processed) {
    request.log.info({ eventId: payload.id }, 'Duplicate webhook event (already processed)');
    reply.code(200).send({ code: WECHAT_CONSTANTS.SUCCESS_CODE });
    return;
  }

  request.isNewEvent = !existingEvent;
}

/**
 * Middleware 3: Decrypt payment notification
 *
 * Decrypts the notification resource using WeChat Pay adapter.
 * Returns 200 on decryption failure (permanent error, malformed request).
 *
 * Decorates: request.decryptedNotification
 */
export async function decryptPaymentNotification(
  request: PaymentNotificationRequest,
  reply: FastifyReply,
  wechatPayAdapter: WechatPayAdapter
): Promise<void> {
  const payload = request.validatedPayload;

  if (!payload) {
    request.log.error("decryptPaymentNotification called without validatedPayload");
    reply.code(500).send({ code: "INTERNAL_ERROR", message: "Invalid middleware order" });
    return;
  }

  const resource = payload.resource;

  try {
    const decryptedDataStr = wechatPayAdapter.decryptNotificationData({
      ciphertext: resource.ciphertext,
      associated_data: resource.associated_data || '',
      nonce: resource.nonce,
      apiv3Key: config.WXPAY_API_V3_KEY,
    });

    const notificationData = JSON.parse(decryptedDataStr);

    // Extract headers for signature verification
    const {
      'wechatpay-timestamp': timestamp,
      'wechatpay-nonce': nonce,
      'wechatpay-signature': signature,
      'wechatpay-serial': serial,
    } = request.headers as Record<string, string>;

    // Decorate request with decrypted data + headers
    request.decryptedNotification = {
      ...notificationData,
      timestamp: timestamp || '',
      nonce: nonce || '',
      signature: signature || '',
      serial: serial || '',
      body: request.rawBody?.toString() || '',
    };
  } catch (decryptError) {
    // Linus principle: Decryption failure is a permanent error (malicious/malformed request)
    request.log.warn(
      { err: decryptError, resource },
      "Payment notification decryption failed. Likely malformed/malicious request."
    );

    // Return 200 to stop retries (permanent error)
    reply.code(200).send({
      code: WECHAT_CONSTANTS.SUCCESS_CODE,
      message: WECHAT_CONSTANTS.SUCCESS_MESSAGE
    });
  }
}

/**
 * Factory function to create decryption middleware with adapter dependency injection
 *
 * Usage in route:
 * ```typescript
 * fastify.post("/api/payment/notify", {
 *   preHandler: [
 *     validatePaymentSchema,
 *     checkIdempotency,
 *     createDecryptMiddleware(wechatPayAdapter)
 *   ]
 * }, handler);
 * ```
 */
export function createDecryptMiddleware(wechatPayAdapter: WechatPayAdapter | null) {
  return async (request: PaymentNotificationRequest, reply: FastifyReply) => {
    if (!wechatPayAdapter) {
      request.log.error("WeChat Pay adapter is not configured");
      reply.code(503).send({ code: "FAIL", message: "服务暂时不可用" });
      return;
    }

    await decryptPaymentNotification(request, reply, wechatPayAdapter);
  };
}
