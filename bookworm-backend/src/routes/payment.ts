// bookworm-backend/src/routes/payment.ts
import { FastifyPluginAsync, FastifyRequest } from "fastify";
import { Type, Static } from "@sinclair/typebox";
import { Prisma } from "@prisma/client";
import { WechatPayAdapter } from "../adapters/wechatPayAdapter";
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

interface PaymentRoutesOptions {
  wechatPayAdapter: WechatPayAdapter | null;
}

const OrderIdParamsSchema = Type.Object({
  orderId: Type.Number(),
});

const PaymentNotifySchema = Type.Object({
  headers: Type.Object({
    'wechatpay-timestamp': Type.String({ minLength: 1 }),
    'wechatpay-nonce': Type.String({ minLength: 1 }),
    'wechatpay-signature': Type.String({ minLength: 1 }),
    'wechatpay-serial': Type.String({ minLength: 1 }),
  }),
  body: Type.Object({
    resource: Type.Object({
      ciphertext: Type.String(),
      associated_data: Type.String(),
      nonce: Type.String(),
    }),
  }),
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

  // Payment callback - COMPLETELY REWRITTEN
  fastify.post<{ Headers: Static<typeof PaymentNotifySchema>['headers']; Body: Static<typeof PaymentNotifySchema>['body'] }>(
    "/api/payment/notify",
    {
      config: { rawBody: true },
      schema: {
        headers: PaymentNotifySchema.properties.headers,
        body: PaymentNotifySchema.properties.body,
      },
    },
    async (request, reply) => {
    if (!wechatPayAdapter) {
      request.log.error("WeChat Pay adapter is not configured. Cannot process notification.");
      // Return 503 to signal a temporary failure, prompting WeChat to retry.
      return reply.code(503).send({ code: "FAIL", message: "服务暂时不可用" });
    }

    try {
      // 1. Extract validated headers (TypeBox has already validated them)
      const {
        'wechatpay-timestamp': timestamp,
        'wechatpay-nonce': nonce,
        'wechatpay-signature': signature,
        'wechatpay-serial': serial,
      } = request.headers;

      const rawBody = request.rawBody;
      if (!rawBody) {
        throw new ApiError(400, "Missing raw body for payment notification", "MISSING_BODY");
      }

      // 2. Decrypt notification and pass to service layer
      // TypeBox has already validated that body contains a resource object
      const resource = request.body.resource;
      let notificationData;
      try {
        const decryptedDataStr = wechatPayAdapter.decryptNotificationData({
          ciphertext: resource.ciphertext,
          associated_data: resource.associated_data,
          nonce: resource.nonce,
          apiv3Key: config.WXPAY_API_V3_KEY,
        });
        notificationData = JSON.parse(decryptedDataStr);
      } catch (decryptError) {
        // Linus式错误分类：区分临时性和永久性错误
        // 解密失败通常是永久性的（恶意请求、密钥错误、数据损坏），但也可能是密钥轮换中
        // 由于微信支付会保持密钥兼容性，解密失败大概率是永久性问题，应返回200避免无限重试
        request.log.warn({ err: decryptError, resource }, "Payment notification decryption failed. Likely a malformed/malicious request.");
        return reply.code(200).send({ code: WECHAT_CONSTANTS.SUCCESS_CODE, message: WECHAT_CONSTANTS.SUCCESS_MESSAGE });
      }

      // 3. Hand off to the robust service layer function with security context
      await processPaymentNotification(prisma, wechatPayAdapter, {
        ...notificationData,
        timestamp,
        nonce,
        signature,
        serial,
        body: rawBody.toString(),
      });

      // 4. Signal success to WeChat
      reply.code(200).send({ code: WECHAT_CONSTANTS.SUCCESS_CODE, message: WECHAT_CONSTANTS.SUCCESS_MESSAGE });

    } catch (error) {
      request.log.error({ err: error }, "Payment notification processing failed.");

      // Linus式错误处理：明确区分临时性和永久性错误

      // 1. 已知的临时性错误 - 让微信重试
      if (error instanceof ApiError && error.code === 'PAY_TRANSIENT_STATE') {
        return reply.code(503).send({ code: WECHAT_CONSTANTS.FAIL_CODE, message: WECHAT_CONSTANTS.RETRY_MESSAGE });
      }
      if (error instanceof PaymentQueryError && error.code === 'WECHAT_QUERY_FAILED_TRANSIENT') {
        return reply.code(503).send({ code: WECHAT_CONSTANTS.FAIL_CODE, message: WECHAT_CONSTANTS.RETRY_MESSAGE });
      }

      // 2. 数据库临时性错误 - 让微信重试
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // P1008: 数据库连接超时或操作超时 - 临时性
        // P1001: 无法连接到数据库 - 临时性
        // P1002: 数据库连接超时 - 临时性
        if (['P1001', 'P1002', 'P1008'].includes(error.code)) {
          request.log.error({ err: error, code: error.code }, "Database connection error during payment notification. Asking WeChat to retry.");
          return reply.code(503).send({ code: WECHAT_CONSTANTS.FAIL_CODE, message: WECHAT_CONSTANTS.RETRY_MESSAGE });
        }
      }

      // 3. 所有其他错误（签名错误、业务逻辑错误等）- 永久性，返回200避免无限重试
      // 这包括：签名验证失败、订单不存在、状态冲突等
      request.log.warn({ err: error }, "Permanent error during payment notification processing. Acknowledging to prevent retries.");
      reply.code(200).send({ code: WECHAT_CONSTANTS.SUCCESS_CODE, message: WECHAT_CONSTANTS.SUCCESS_MESSAGE });
    }
  });
};

export default paymentRoutes;
