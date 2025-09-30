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
} from "../services/orderService";
import { ApiError } from "../errors";
import config from "../config";
import prisma from "../db";

const CreateOrderBodySchema = Type.Object({
  inventoryItemIds: Type.Array(Type.Number(), { minItems: 1 }),
});

const FulfillOrderBodySchema = Type.Object({
  pickupCode: Type.String({ minLength: 1 }),
});

const UpdateOrderStatusBodySchema = Type.Object({
  status: Type.Union([Type.Literal("COMPLETED"), Type.Literal("CANCELLED")]),
});

const OrderIdParamsSchema = Type.Object({
  id: Type.Number(),
});

const UserIdParamsSchema = Type.Object({
  userId: Type.Number(),
});

const OrderListQuerySchema = Type.Object({
  cursor: Type.Optional(Type.String()),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
});

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
      reply.code(201).send(order);
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
      reply.send(order);
    },
  );

  fastify.get<{
    Params: Static<typeof UserIdParamsSchema>;
    Querystring: Static<typeof OrderListQuerySchema>;
  }>(
    "/api/orders/user/:userId",
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: UserIdParamsSchema,
        querystring: OrderListQuerySchema,
      },
    },
    async (request, reply) => {
      if (request.params.userId !== request.user!.userId) {
        throw new ApiError(403, "Forbidden", "USER_ACCESS_DENIED");
      }
      const { cursor, limit } = request.query;

      const orders = await getOrdersByUserId(prisma, request.user!.userId, {
        cursor: cursor ?? undefined,
        limit: limit ?? undefined,
      });
      reply.send({
        data: orders.data,
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
      reply.send(order);
    },
  );

  fastify.get(
    "/api/orders/pending-pickup",
    { preHandler: [fastify.authenticate, fastify.requireRole("STAFF")] },
    async (request, reply) => {
      const orders = await getPendingPickupOrders(prisma);
      reply.send(orders);
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
      reply.send(updatedOrder);
    },
  );
};

export default ordersRoutes;
