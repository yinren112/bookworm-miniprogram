// src/routes/orders.ts
import { FastifyPluginAsync } from "fastify";
import { Type, Static } from "@sinclair/typebox";
import {
  createOrder,
  getOrdersByUserId,
  getOrderById,
  fulfillOrder,
  getPendingPickupOrders,
  updateOrderStatus,
  formatCentsToYuanString,
} from "../services/orderService";
import config from "../config";
import prisma from "../db";
import { ApiError } from "../errors";
import { PickupCodeSchema } from "./sharedSchemas";

const CreateOrderBodySchema = Type.Object({
  inventoryItemIds: Type.Array(Type.Number(), { minItems: 1 }),
});

const FulfillOrderBodySchema = Type.Object({
  pickupCode: PickupCodeSchema,
});

const UpdateOrderStatusBodySchema = Type.Object({
  status: Type.Union([Type.Literal("COMPLETED"), Type.Literal("CANCELLED")]),
});

const OrderIdParamsSchema = Type.Object({
  id: Type.Number(),
});

const OrderListQuerySchema = Type.Object({
  cursor: Type.Optional(Type.String()),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
});

const ORDER_PUBLIC_FIELDS = [
  "id",
  "user_id",
  "status",
  "total_amount",
  "pickup_code",
  "paymentExpiresAt",
  "pickupExpiresAt",
  "paid_at",
  "completed_at",
  "cancelled_at",
  "createdAt",
  "type",
  "totalWeightKg",
  "unitPrice",
  "settlementType",
  "voucherFaceValue",
  "notes",
  "orderItem",
  "sellDetails",
] as const;

type OrderPublicField = typeof ORDER_PUBLIC_FIELDS[number];
type OrderAmountInput = Record<string, unknown> & { total_amount: number };
type OrderResponse = Partial<Record<OrderPublicField, unknown>> & { total_amount: string };

const presentOrderAmount = (order: OrderAmountInput): OrderResponse => {
  const output: Record<string, unknown> = {};
  for (const key of ORDER_PUBLIC_FIELDS) {
    if (key === "total_amount") {
      output.total_amount = formatCentsToYuanString(order.total_amount);
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(order, key)) {
      output[key] = order[key];
    }
  }
  return output as OrderResponse;
};

const presentOrderList = (orders: OrderAmountInput[]) => orders.map(presentOrderAmount);

const ordersRoutes: FastifyPluginAsync = async function (fastify) {
  fastify.post<{ Body: Static<typeof CreateOrderBodySchema> }>(
    "/api/orders/create",
    {
      preHandler: [fastify.authenticate],
      config: {
        rateLimit: {
          max: config.API_RATE_LIMIT_MAX,
          timeWindow: `${config.API_RATE_LIMIT_WINDOW_MINUTES} minute`,
          keyGenerator: (req) => req.user?.userId.toString() || req.ip,
        },
      },
      schema: {
        body: CreateOrderBodySchema,
      },
    },
    async (request, reply) => {
      const { inventoryItemIds } = request.body;
      const order = await createOrder(prisma, {
        userId: request.user!.userId,
        inventoryItemIds,
      });
      reply.code(201).send(presentOrderAmount(order));
    },
  );

  fastify.get<{ Params: Static<typeof OrderIdParamsSchema> }>(
    "/api/orders/:id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: OrderIdParamsSchema,
      },
    },
    async (request, reply) => {
      const orderId = request.params.id;

      const order = await getOrderById(prisma, orderId, request.user!.userId);
      reply.send(presentOrderAmount(order));
    },
  );

  // Linus式API设计：用户只能查自己的订单，URL中不需要userId参数
  fastify.get<{
    Querystring: Static<typeof OrderListQuerySchema>;
  }>(
    "/api/orders/my",
    {
      preHandler: [fastify.authenticate],
      schema: {
        querystring: OrderListQuerySchema,
      },
    },
    async (request, reply) => {
      const { cursor, limit } = request.query;

      const orders = await getOrdersByUserId(prisma, request.user!.userId, {
        cursor: cursor ?? undefined,
        limit: limit ?? undefined,
      });
      reply.send({
        data: presentOrderList(orders.data),
        meta: {
          nextCursor: orders.nextCursor,
        },
      });
    },
  );

  fastify.post<{ Body: Static<typeof FulfillOrderBodySchema> }>(
    "/api/orders/fulfill",
    {
      preHandler: [fastify.authenticate, fastify.requireRole("STAFF")],
      config: {
        rateLimit: {
          max: config.API_FULFILL_RATE_LIMIT_MAX,
          timeWindow: "1 minute",
          keyGenerator: (req) => req.user?.userId.toString() || req.ip,
        },
      },
      schema: {
        body: FulfillOrderBodySchema,
      },
    },
    async (request, reply) => {
      const { pickupCode } = request.body;
      const order = await fulfillOrder(prisma, pickupCode.toUpperCase());
      if (!order) {
        reply.send(order);
        return;
      }
      reply.send(presentOrderAmount(order));
    },
  );

  fastify.get(
    "/api/orders/pending-pickup",
    { preHandler: [fastify.authenticate, fastify.requireRole("STAFF")] },
    async (request, reply) => {
      const orders = await getPendingPickupOrders(prisma);
      reply.send(presentOrderList(orders));
    },
  );

  // Update order status (STAFF only)
  fastify.patch<{
    Params: Static<typeof OrderIdParamsSchema>;
    Body: Static<typeof UpdateOrderStatusBodySchema>;
  }>(
    "/api/orders/:id/status",
    {
      preHandler: [fastify.authenticate, fastify.requireRole("STAFF")],
      config: {
        rateLimit: {
          max: config.API_RATE_LIMIT_MAX,
          timeWindow: `${config.API_RATE_LIMIT_WINDOW_MINUTES} minute`,
        },
      },
      schema: {
        params: OrderIdParamsSchema,
        body: UpdateOrderStatusBodySchema,
      },
    },
    async (request, reply) => {
      const orderId = request.params.id;
      const { status } = request.body;

      const updatedOrder = await updateOrderStatus(prisma, orderId, status, {
        userId: request.user!.userId,
        role: request.user!.role!,
      });
      if (!updatedOrder) {
        throw new ApiError(404, "订单不存在", "ORDER_NOT_FOUND");
      }
      reply.send(presentOrderAmount(updatedOrder));
    },
  );
};

export default ordersRoutes;









