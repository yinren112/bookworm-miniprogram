import { FastifyPluginAsync } from "fastify";
import { Type, Static } from "@sinclair/typebox";
import { createAndCompleteSellOrder } from "../services/orderService";
import prisma from "../db";
import { PhoneNumberSchema } from "./sharedSchemas";

const CreateSellOrderBodySchema = Type.Object({
  customerPhoneNumber: PhoneNumberSchema,
  totalWeightKg: Type.Number({ exclusiveMinimum: 0 }),
  unitPrice: Type.Integer({ minimum: 1 }), // Stored in cents
  settlementType: Type.Union([Type.Literal("CASH"), Type.Literal("VOUCHER")]),
  notes: Type.Optional(Type.String({ maxLength: 1000 })),
});

type CreateSellOrderBody = Static<typeof CreateSellOrderBodySchema>;

const sellOrdersRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: CreateSellOrderBody }>(
    "/api/sell-orders",
    {
      preHandler: [fastify.authenticate, fastify.requireRole("STAFF")],
      schema: {
        body: CreateSellOrderBodySchema,
      },
    },
    async (request, reply) => {
      const { customerPhoneNumber, totalWeightKg, unitPrice, settlementType, notes } = request.body;

      // Linus式审计：记录敏感操作的执行者
      // 每个STAFF创建的卖书订单都会被记录，包括操作员ID、客户手机号和金额
      request.log.info({
        operatorId: request.user!.userId,
        customerPhoneNumber,
        totalWeightKg,
        unitPriceCents: unitPrice,
        settlementType,
        action: 'CREATE_SELL_ORDER',
      }, 'STAFF member creating sell order');

      const result = await createAndCompleteSellOrder(prisma, {
        customerPhoneNumber,
        totalWeightKg,
        unitPrice,
        settlementType,
        notes,
      });

      // 记录成功创建的订单ID，用于后续审计追踪
      request.log.info({
        operatorId: request.user!.userId,
        targetUserId: result.order.user_id,
        orderId: result.order.id,
        totalAmount: result.order.total_amount,
        action: 'SELL_ORDER_CREATED',
      }, 'Sell order created successfully');

      reply.code(201).send(result);
    },
  );
};

export default sellOrdersRoutes;
