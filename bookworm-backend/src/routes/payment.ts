// bookworm-backend/src/routes/payment.ts
import { FastifyPluginAsync } from "fastify";
import { Type, Static } from "@sinclair/typebox";
import { WechatPayAdapter } from "../adapters/wechatPayAdapter";
import {
  buildClientPaymentSignature,
  buildWechatPaymentRequest,
  preparePaymentIntent,
  processPaymentNotification,
} from "../services/orderService";
import { ApiError } from "../errors";
import prisma from "../db";
import { WECHAT_CONSTANTS } from "../constants";
import { paymentErrorClassifier } from "../services/errorClassification";
import {
  validatePaymentSchema,
  checkIdempotency,
  createDecryptMiddleware,
  PaymentNotificationRequest,
} from "../middleware/paymentSecurity";

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

  // Payment callback - Refactored with middleware pipeline
  // Pipeline: Schema validation → Idempotency → Decryption → Processing
  fastify.post<{ Body: unknown }>(
    "/api/payment/notify",
    {
      config: { rawBody: true },
      preHandler: [
        validatePaymentSchema,
        checkIdempotency,
        createDecryptMiddleware(wechatPayAdapter),
      ],
    },
    async (request: PaymentNotificationRequest, reply) => {
      // All validation/decryption done in middleware
      // request.validatedPayload, request.decryptedNotification are available

      if (!wechatPayAdapter) {
        // Should never reach here (middleware handles this)
        request.log.error("WeChat Pay adapter is not configured");
        return reply.code(503).send({ code: "FAIL", message: "服务暂时不可用" });
      }

      const payload = request.validatedPayload!;
      const notificationData = request.decryptedNotification!;

      try {
        // Atomic transaction: record event + process payment
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
          await processPaymentNotification(tx, wechatPayAdapter, notificationData);

          // Mark as processed
          await tx.webhookEvent.update({
            where: { id: payload.id },
            data: { processed: true },
          });
        });

        // Signal success to WeChat
        reply.code(200).send({
          code: WECHAT_CONSTANTS.SUCCESS_CODE,
          message: WECHAT_CONSTANTS.SUCCESS_MESSAGE
        });
      } catch (error) {
        // Unified error classification using Strategy + Chain of Responsibility pattern
        const classification = paymentErrorClassifier.classify(error);

        // Log based on classification
        request.log[classification.logLevel](
          { err: error, classification },
          "Payment notification processing failed"
        );

        // Respond based on classification
        reply.code(classification.httpStatus).send({
          code: classification.responseCode,
          message: classification.responseMessage,
        });
      }
    }
  );
};

export default paymentRoutes;
