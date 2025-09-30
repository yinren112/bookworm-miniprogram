// bookworm-backend/src/routes/payment.ts
import { FastifyPluginAsync, FastifyRequest } from "fastify";
import { Type, Static } from "@sinclair/typebox";
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
        request.log.warn({ err: decryptError, resource }, "Payment notification decryption failed. This is a permanent error for this request.");
        // Return 200 OK to acknowledge receipt and prevent WeChat from retrying a malformed request.
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

      // Specific handling for transient errors where we want WeChat to retry
      if (error instanceof ApiError && error.code === 'PAY_TRANSIENT_STATE') {
        return reply.code(503).send({ code: WECHAT_CONSTANTS.FAIL_CODE, message: WECHAT_CONSTANTS.RETRY_MESSAGE });
      }
      if (error instanceof PaymentQueryError && error.code === 'WECHAT_QUERY_FAILED_TRANSIENT') {
        return reply.code(503).send({ code: WECHAT_CONSTANTS.FAIL_CODE, message: WECHAT_CONSTANTS.RETRY_MESSAGE });
      }

      // For all other errors (e.g., bad signature, permanent API errors), we tell WeChat we're "done" to prevent endless retries.
      reply.code(200).send({ code: WECHAT_CONSTANTS.SUCCESS_CODE, message: WECHAT_CONSTANTS.SUCCESS_MESSAGE });
    }
  });
};

export default paymentRoutes;
