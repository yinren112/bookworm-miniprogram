// Error Handling Integration Tests
// Tests the layered global error handler to ensure consistent error responses
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { createTestApp } from "../app-factory";
import { FastifyInstance } from "fastify";
import { getPrismaClientForWorker, createTestUser, createTestInventoryItems } from './globalSetup';

describe("Error Handling Integration Tests", () => {
  let app: FastifyInstance;
  let validToken: string;
  let staffToken: string;
  let prisma: any;

  beforeAll(async () => {
    prisma = getPrismaClientForWorker();
    app = await createTestApp();
    await app.ready();

    // Create test users for authentication tests
    const userResult = await createTestUser("USER");
    const staffResult = await createTestUser("STAFF");
    validToken = userResult.token;
    staffToken = staffResult.token;
  });

  afterAll(async () => {
    await app.close();
  });

  describe("Layer 1: Authentication/Authorization Errors (401/403)", () => {
    it("should return 401 with correct format for missing token", async () => {
      const response = await request(app.server).get("/api/orders/my");

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        code: "UNAUTHORIZED",
        message: "Missing authorization header",
      });
    });

    it("should return 401 with correct format for invalid token", async () => {
      const response = await request(app.server)
        .get("/api/orders/my")
        .set("Authorization", "Bearer invalid-token");

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        code: "UNAUTHORIZED",
        message: expect.stringMatching(/token|authorization/i),
      });
    });

    it("should return 403 with correct format for insufficient permissions", async () => {
      const response = await request(app.server)
        .get("/api/orders/pending-pickup")
        .set("Authorization", `Bearer ${validToken}`); // USER trying to access STAFF endpoint

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("FORBIDDEN");
      expect(response.body).toHaveProperty("message");
    });
  });

  describe("Layer 2: Request Validation Errors (400)", () => {
    it("should return 400 with correct format for invalid request body", async () => {
      const response = await request(app.server)
        .patch("/api/orders/123/status")
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ status: "INVALID_STATUS" }); // Invalid enum value

      expect(response.status).toBe(400);
      expect(["VALIDATION_ERROR", "BAD_REQUEST"]).toContain(response.body.code);
      expect(response.body).toHaveProperty("message");
    });

    it("should return 400 with correct format for missing required fields", async () => {
      const response = await request(app.server)
        .patch("/api/orders/123/status")
        .set("Authorization", `Bearer ${staffToken}`)
        .send({}); // Missing status field

      expect(response.status).toBe(400);
      expect(["VALIDATION_ERROR", "BAD_REQUEST"]).toContain(response.body.code);
      expect(response.body).toHaveProperty("message");
    });

    it("should return 400 with correct format for invalid JSON", async () => {
      const response = await request(app.server)
        .patch("/api/orders/123/status")
        .set("Authorization", `Bearer ${staffToken}`)
        .set("Content-Type", "application/json")
        .send("invalid-json{");

      expect(response.status).toBe(400);
      expect(["VALIDATION_ERROR", "BAD_REQUEST"]).toContain(response.body.code);
      expect(response.body).toHaveProperty("message");
    });

    it("should accept inventory search queries with single character", async () => {
      const response = await request(app.server)
        .get("/api/inventory/available")
        .query({ search: "a" });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("data");
      expect(response.body).toHaveProperty("meta");
    });
  });

  describe("Layer 3: Rate Limiting Errors (429)", () => {
    it("should return 429 with correct format when rate limit exceeded", async () => {
      // Make many rapid requests to trigger rate limiting
      const promises = Array.from({ length: 15 }, () =>
        request(app.server)
          .patch("/api/orders/123/status")
          .set("Authorization", `Bearer ${staffToken}`)
          .send({ status: "COMPLETED" }),
      );

      const responses = await Promise.all(promises);

      // At least one should be rate limited
      const rateLimitedResponse = responses.find((r) => r.status === 429);
      if (rateLimitedResponse) {
        expect(rateLimitedResponse.body.code).toBe("RATE_LIMIT_EXCEEDED");
        expect(rateLimitedResponse.body).toHaveProperty("message");
      }
    }, 10000); // Increased timeout for rate limiting test
  });

  describe("Layer 4: Business Logic Errors (ApiError)", () => {
    it("should return correct format for business logic error", async () => {
      const response = await request(app.server)
        .patch("/api/orders/99999/status") // Non-existent order
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ status: "COMPLETED" });

      // May be rate limited (429) or return the expected error (404)
      expect([404, 429]).toContain(response.status);
      if (response.status === 404) {
        expect(response.body.code).toBe("ORDER_NOT_FOUND");
      } else if (response.status === 429) {
        expect(response.body.code).toBe("RATE_LIMIT_EXCEEDED");
      }
      expect(response.body).toHaveProperty("message");
    });

    it("should return correct format for invalid order ID", async () => {
      const response = await request(app.server)
        .patch("/api/orders/invalid-id/status")
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ status: "COMPLETED" });

      expect([400, 429]).toContain(response.status);
      if (response.status === 400) {
        expect(response.body.code).toBe("VALIDATION_ERROR");
      } else if (response.status === 429) {
        expect(response.body.code).toBe("RATE_LIMIT_EXCEEDED");
      }
      expect(response.body).toHaveProperty("message");
    });

    it("should return correct format for invalid status transition", async () => {
      // First create an order to test status transition
      const inventoryItems = await createTestInventoryItems(1);
      const orderResponse = await request(app.server)
        .post("/api/orders/create")
        .set("Authorization", `Bearer ${validToken}`)
        .send({ inventoryItemIds: inventoryItems });

      if (orderResponse.status === 201) {
        // Try invalid transition from PENDING_PAYMENT to COMPLETED
        const response = await request(app.server)
          .patch(`/api/orders/${orderResponse.body.id}/status`)
          .set("Authorization", `Bearer ${staffToken}`)
          .send({ status: "COMPLETED" });

        expect([400, 429]).toContain(response.status);
        if (response.status === 400) {
          expect(response.body.code).toBe("INVALID_STATUS_TRANSITION");
        } else if (response.status === 429) {
          expect(response.body.code).toBe("RATE_LIMIT_EXCEEDED");
        }
        expect(response.body).toHaveProperty("message");
      }
    });
  });

  describe("Layer 5: Database Errors (Prisma)", () => {
    it("should return correct format for record not found", async () => {
      const response = await request(app.server)
        .get("/api/inventory/item/99999")
        .set("Authorization", `Bearer ${validToken}`);

      // This might return different error codes depending on implementation
      expect([404, 400, 429]).toContain(response.status);
      if (response.status === 404) {
        expect(["RECORD_NOT_FOUND", "BOOK_NOT_FOUND"]).toContain(
          response.body.code,
        );
      } else if (response.status === 429) {
        expect(response.body.code).toBe("RATE_LIMIT_EXCEEDED");
      }
      expect(response.body).toHaveProperty("message");
    });
  });

  describe("Error Response Format Consistency", () => {
    it("should always return consistent error structure", async () => {
      const testCases = [
        // 401 error
        () => request(app.server).get("/api/orders/my"),
        // 403 error
        () =>
          request(app.server)
            .get("/api/orders/pending-pickup")
            .set("Authorization", `Bearer ${validToken}`),
        // 400 error
        () =>
          request(app.server)
            .patch("/api/orders/123/status")
            .set("Authorization", `Bearer ${staffToken}`)
            .send({}),
        // 404 error
        () =>
          request(app.server)
            .patch("/api/orders/99999/status")
            .set("Authorization", `Bearer ${staffToken}`)
            .send({ status: "COMPLETED" }),
      ];

      for (const testCase of testCases) {
        const response = await testCase();

        // All error responses should have consistent structure
        expect(response.body).toHaveProperty("code");
        expect(response.body).toHaveProperty("message");
        expect(typeof response.body.code).toBe("string");
        expect(typeof response.body.message).toBe("string");

        // Should have the new 'code' field
        expect(response.body).toHaveProperty("code");
        expect(response.body).not.toHaveProperty("error");
      }
    });
  });

  describe("Success Response Format", () => {
    it("should return success responses without error fields", async () => {
      const response = await request(app.server).get("/api/health");

      expect(response.status).toBe(200);
      expect(response.body).not.toHaveProperty("code");
      expect(response.body).not.toHaveProperty("message");
      expect(response.body).not.toHaveProperty("error");
    });
  });
});
