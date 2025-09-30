// src/tests/order.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { User } from "@prisma/client";
import { createSigner } from "fast-jwt";
import config from "../config";
import { getPrismaClientForWorker, createTestUser, createTestInventoryItems } from './globalSetup';
import { createTestApp } from "../app-factory";
import { FastifyInstance } from "fastify";

describe("Order Integration Tests", () => {
  let prisma: any;
  let app: FastifyInstance;

  beforeAll(async () => {
    prisma = getPrismaClientForWorker();
    app = await createTestApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("POST /api/orders/create", () => {
    it("should successfully create an order and reserve inventory", async () => {
      // Setup test data
      const { userId } = await createTestUser("USER");
      const itemIds = await createTestInventoryItems(1);

      const signer = createSigner({ key: config.JWT_SECRET! });
      const token = await signer({ userId, openid: "order-create-test" });

      const response = await app.inject({
        method: "POST",
        url: "/api/orders/create",
        headers: {
          authorization: `Bearer ${token}`,
        },
        payload: {
          inventoryItemIds: itemIds,
        },
      });

      expect(response.statusCode).toBe(201);
      const order = JSON.parse(response.payload);
      expect(order.user_id).toBe(userId);
      expect(order.status).toBe("PENDING_PAYMENT");
      expect(order.total_amount).toBe("80"); // From createTestInventoryItems selling_price
    });

    it("should fail with invalid inventory item IDs", async () => {
      const { userId } = await createTestUser("USER");

      const signer = createSigner({ key: config.JWT_SECRET! });
      const token = await signer({ userId, openid: "order-invalid-test" });

      const response = await app.inject({
        method: "POST",
        url: "/api/orders/create",
        headers: {
          authorization: `Bearer ${token}`,
        },
        payload: {
          inventoryItemIds: [99999], // Non-existent ID
        },
      });

      expect(response.statusCode).toBe(409);
      const error = JSON.parse(response.payload);
      expect(error.code).toBe("INSUFFICIENT_INVENTORY_PRECHECK");
    });
  });

  describe("GET /api/orders/:id - Authorization", () => {
    it("should prevent unauthorized access", async () => {
      // Create UserA and their order
      const { userId: userAId } = await createTestUser("USER");
      const { userId: userBId } = await createTestUser("USER");
      const itemIds = await createTestInventoryItems(1);

      const signer = createSigner({ key: config.JWT_SECRET! });
      const tokenA = await signer({
        userId: userAId,
        openid: "user-a-auth-test",
      });
      const tokenB = await signer({
        userId: userBId,
        openid: "user-b-auth-test",
      });

      // UserA creates an order
      const createResponse = await app.inject({
        method: "POST",
        url: "/api/orders/create",
        headers: {
          authorization: `Bearer ${tokenA}`,
        },
        payload: {
          inventoryItemIds: itemIds,
        },
      });

      expect(createResponse.statusCode).toBe(201);
      const order = JSON.parse(createResponse.payload);

      // UserB tries to access UserA's order
      const response = await app.inject({
        method: "GET",
        url: `/api/orders/${order.id}`,
        headers: {
          authorization: `Bearer ${tokenB}`,
        },
      });

      // Must return 404, not 403, to avoid information disclosure
      expect(response.statusCode).toBe(404);
      const error = JSON.parse(response.payload);
      expect(error.code).toBe("ORDER_NOT_FOUND");
    });

    it("should allow authorized access to own order", async () => {
      const { userId } = await createTestUser("USER");
      const itemIds = await createTestInventoryItems(1);

      const signer = createSigner({ key: config.JWT_SECRET! });
      const token = await signer({ userId, openid: "user-own-order-test" });

      // Create order
      const createResponse = await app.inject({
        method: "POST",
        url: "/api/orders/create",
        headers: {
          authorization: `Bearer ${token}`,
        },
        payload: {
          inventoryItemIds: itemIds,
        },
      });

      expect(createResponse.statusCode).toBe(201);
      const order = JSON.parse(createResponse.payload);

      // Access own order
      const response = await app.inject({
        method: "GET",
        url: `/api/orders/${order.id}`,
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const retrievedOrder = JSON.parse(response.payload);
      expect(retrievedOrder.id).toBe(order.id);
      expect(retrievedOrder.user_id).toBe(userId);
    });
  });

  describe("GET /api/orders/user/:userId", () => {
    it("should return user order history", async () => {
      const { userId } = await createTestUser("USER");
      const itemIds = await createTestInventoryItems(1);

      const signer = createSigner({ key: config.JWT_SECRET! });
      const token = await signer({ userId, openid: "user-history-test" });

      // Create one order
      const orderResponse = await app.inject({
        method: "POST",
        url: "/api/orders/create",
        headers: {
          authorization: `Bearer ${token}`,
        },
        payload: {
          inventoryItemIds: itemIds,
        },
      });

      expect(orderResponse.statusCode).toBe(201);
      const createdOrder = JSON.parse(orderResponse.payload);

      // Get order history
      const response = await app.inject({
        method: "GET",
        url: `/api/orders/user/${userId}`,
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);

      // API uses cursor-based pagination: { data: orders, meta: { nextCursor } }
      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBe(1); // Exactly 1 order created
      expect(result.meta).toBeDefined();
      expect(result.meta).toHaveProperty("nextCursor");

      // Verify order ID and user ID match what we created
      expect(result.data[0].id).toBe(createdOrder.id);
      expect(result.data[0].user_id).toBe(userId);
      expect(result.data[0].status).toBe("PENDING_PAYMENT");
    });
  });
});
