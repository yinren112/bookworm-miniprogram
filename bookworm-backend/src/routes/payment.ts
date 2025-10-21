// bookworm-backend/src/routes/payment.ts
import { FastifyPluginAsync } from "fastify";
import { Type, Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { Prisma } from "@prisma/client";
import { WechatPayAdapter } from "../adapters/wechatPayAdapter";
import { WechatPayNotifySchema } from "../schemas/wechatPayNotify";
import {
  buildClientPaymentSignature,
  buildWechatPaymentRequest,
  preparePaymentIntent,
  processPaymentNotification,
} from "../services/orderService";
import { ApiError, PaymentQueryError } from "../errors";
import config from "../config";
import prisma from "../db";
import { WECHAT_CONSTANTS } from "../constants";

// Payment notification ACK strategy:
// - WXPAY_ACK_STRICT=true: Return 4xx/5xx on validation failures (strict, may cause infinite retries)
// - WXPAY_ACK_STRICT=false (default): Return 200 on permanent errors (tolerant, stops retries)
// Rationale: WeChat Pay retries indefinitely on non-200 responses. For schema/signature/timestamp
// failures (permanent errors), returning 200 prevents retry storms while logging the issue.
const WXPAY_ACK_STRICT = process.env.WXPAY_ACK_STRICT === 'true';

interface PaymentRoutesOptions {
  wechatPayAdapter: WechatPayAdapter | null;
}

const OrderIdParamsSchema = Type.Object({
  orderId: Type.Number(),
});


const paymentRoutes: FastifyPluginAsync<PaymentRoutesOptions> = async function (fastify, opts) {
  const { wechatPayAdapter } = opts;

  // ... (the /api/orders/:orderId/pay route remains the same, no need to change it)
  fastify.post<{ Params: Static<typeof OrderIdParamsSchema> }>(
    "/api/orders/:orderId/pay",
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: OrderIdParamsSchema,
      },
    },
    async (request, reply) => {
      if (!wechatPayAdapter) throw new ApiError(503, "Payment service is not configured.", "PAYMENT_SERVICE_UNAVAILABLE");
      const { orderId } = request.params;
      const intent = await preparePaymentIntent(prisma, orderId, request.user!.userId);
      const { prepay_id } = await wechatPayAdapter.createPaymentOrder(
        buildWechatPaymentRequest(intent),
      );
      const paymentParams = buildClientPaymentSignature(intent, prepay_id, wechatPayAdapter);
      reply.send(paymentParams);
    },
  );

  // Payment callback - COMPLETELY REWRITTEN with runtime validation + replay protection
  fastify.post("/api/payment/notify", { config: { rawBody: true } }, async (request, reply) => {
    if (!wechatPayAdapter) {
      request.log.error("WeChat Pay adapter is not configured. Cannot process notification.");
      // Return 503 to signal a temporary failure, prompting WeChat to retry.
      return reply.code(503).send({ code: "FAIL", message: "服务暂时不可用" });
    }

    try {
      // 0. Runtime schema validation (TypeBox)
      const rawBody = request.rawBody;
      if (!rawBody) {
        request.log.warn("Missing raw body for payment notification");
        return reply.code(400).send({ code: "BAD_REQUEST", message: "Missing body" });
      }

      const payload = typeof rawBody === 'string' ? JSON.parse(rawBody) : request.body;

      // Validate against schema
      if (!Value.Check(WechatPayNotifySchema, payload)) {
        const errors = [...Value.Errors(WechatPayNotifySchema, payload)];
        request.log.warn({ payload, errors }, 'Invalid WeChat Pay notification schema');

        if (WXPAY_ACK_STRICT) {
          // Strict mode: return 400 (WeChat will retry, may cause retry storm)
          return reply.code(400).send({ code: "BAD_REQUEST", message: "Invalid payload schema" });
        } else {
          // Tolerant mode (default): return 200 to stop retries, log issue for investigation
          return reply.code(200).send({ code: WECHAT_CONSTANTS.SUCCESS_CODE, message: WECHAT_CONSTANTS.SUCCESS_MESSAGE });
        }
      }

      // 1. Idempotency check (replay protection)
      const existingEvent = await prisma.webhookEvent.findUnique({
        where: { id: payload.id },
      });

      if (existingEvent) {
        request.log.info({ eventId: payload.id }, 'Duplicate webhook event (idempotent response)');
        return reply.code(200).send({ code: "SUCCESS" });
      }

      // 2. Extract headers for signature verification
      const {
        'wechatpay-timestamp': timestamp,
        'wechatpay-nonce': nonce,
        'wechatpay-signature': signature,
        'wechatpay-serial': serial,
      } = request.headers as Record<string, string>;

      // 3. Decrypt notification and process in transaction
      const resource = payload.resource;
      let notificationData;
      try {
        const decryptedDataStr = wechatPayAdapter.decryptNotificationData({
          ciphertext: resource.ciphertext,
          associated_data: resource.associated_data || '',
          nonce: resource.nonce,
          apiv3Key: config.WXPAY_API_V3_KEY,
        });
        notificationData = JSON.parse(decryptedDataStr);
      } catch (decryptError) {
        // Linus式错误分类：解密失败通常是永久性错误（恶意请求、密钥错误）
        request.log.warn({ err: decryptError, resource }, "Payment notification decryption failed. Likely malformed/malicious request.");
        return reply.code(200).send({ code: WECHAT_CONSTANTS.SUCCESS_CODE, message: WECHAT_CONSTANTS.SUCCESS_MESSAGE });
      }

      // 4. Atomic transaction: record event + process payment
      await prisma.$transaction(async (tx) => {
        // Record webhook event for idempotency
        await tx.webhookEvent.create({
          data: {
            id: payload.id,
            event_type: payload.event_type,
            processed: false,
          },
        });

        // Hand off to service layer
        await processPaymentNotification(tx, wechatPayAdapter, {
          ...notificationData,
          timestamp: timestamp || '',
          nonce: nonce || '',
          signature: signature || '',
          serial: serial || '',
          body: rawBody.toString(),
        });

        // Mark as processed
        await tx.webhookEvent.update({
          where: { id: payload.id },
          data: { processed: true },
        });
      });

      // 5. Signal success to WeChat
      reply.code(200).send({ code: WECHAT_CONSTANTS.SUCCESS_CODE, message: WECHAT_CONSTANTS.SUCCESS_MESSAGE });

    } catch (error) {
      request.log.error({ err: error }, "Payment notification processing failed.");

      // Linus式错误处理：明确区分临时性和永久性错误

      // 1. 安全验证失败（签名、时间窗口）- 永久性错误
      if (error instanceof ApiError && ['TIMESTAMP_INVALID', 'TIMESTAMP_EXPIRED', 'SIGNATURE_INVALID'].includes(error.code)) {
        request.log.warn({ err: error, code: error.code }, "Security validation failed.");

        if (WXPAY_ACK_STRICT) {
          // Strict mode: return 400 (WeChat will retry)
          return reply.code(400).send({ code: "BAD_REQUEST", message: "Security validation failed" });
        } else {
          // Tolerant mode (default): return 200 to stop retries (prevents retry storm on malicious/malformed requests)
          return reply.code(200).send({ code: WECHAT_CONSTANTS.SUCCESS_CODE, message: WECHAT_CONSTANTS.SUCCESS_MESSAGE });
        }
      }

      // 2. 已知的临时性错误 - 让微信重试
      if (error instanceof ApiError && error.code === 'PAY_TRANSIENT_STATE') {
        return reply.code(503).send({ code: WECHAT_CONSTANTS.FAIL_CODE, message: WECHAT_CONSTANTS.RETRY_MESSAGE });
      }
      if (error instanceof PaymentQueryError && error.code === 'WECHAT_QUERY_FAILED_TRANSIENT') {
        return reply.code(503).send({ code: WECHAT_CONSTANTS.FAIL_CODE, message: WECHAT_CONSTANTS.RETRY_MESSAGE });
      }

      // 3. 数据库临时性错误 - 让微信重试
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // P1008: 数据库连接超时或操作超时 - 临时性
        // P1001: 无法连接到数据库 - 临时性
        // P1002: 数据库连接超时 - 临时性
        if (['P1001', 'P1002', 'P1008'].includes(error.code)) {
          request.log.error({ err: error, code: error.code }, "Database connection error during payment notification. Asking WeChat to retry.");
          return reply.code(503).send({ code: WECHAT_CONSTANTS.FAIL_CODE, message: WECHAT_CONSTANTS.RETRY_MESSAGE });
        }
      }

      // 4. 所有其他错误（业务逻辑错误等）- 永久性，返回200避免无限重试
      // 这包括：订单不存在、状态冲突等
      request.log.warn({ err: error }, "Permanent error during payment notification processing. Acknowledging to prevent retries.");
      reply.code(200).send({ code: WECHAT_CONSTANTS.SUCCESS_CODE, message: WECHAT_CONSTANTS.SUCCESS_MESSAGE });
    }
  });
};

export default paymentRoutes;
