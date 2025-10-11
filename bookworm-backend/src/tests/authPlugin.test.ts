// src/tests/authPlugin.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import { PrismaClient } from "@prisma/client";
import Fastify, { FastifyInstance } from "fastify";
import { createSigner } from "fast-jwt";

const prismaMock = mockDeep<PrismaClient>();

vi.mock("../db", () => ({ default: prismaMock }));
vi.mock("../config", () => ({
  default: {
    JWT_SECRET: "test-jwt-secret-for-plugin",
  },
}));

// Import AFTER mocking
const authPlugin = await import("../plugins/auth").then((m) => m.default);

describe("Auth Plugin", () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    mockReset(prismaMock);
    server = Fastify({ logger: false });

    await server.register(authPlugin);

    // Test route to verify authentication
    server.get(
      "/protected",
      { preHandler: [server.authenticate] },
      async (req) => ({
        message: "success",
        user: req.user,
      }),
    );

    // Test route to verify role-based access
    server.get(
      "/staff-only",
      {
        preHandler: [server.authenticate, server.requireRole("STAFF")],
      },
      async () => ({
        message: "staff access granted",
      }),
    );

    server.get(
      "/user-only",
      {
        preHandler: [server.authenticate, server.requireRole("USER")],
      },
      async () => ({
        message: "user access granted",
      }),
    );

    await server.ready();
  });

  afterEach(async () => {
    if (server) await server.close();
  });

  describe("authenticate decorator", () => {
    it("returns 401 when no authorization header provided", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/protected",
      });

      expect(response.statusCode).toBe(401);
      const payload = JSON.parse(response.payload);
      expect(payload).toEqual({
        code: "UNAUTHORIZED",
        message: "Missing authorization header",
      });
    });

    it("returns 401 when authorization header is malformed", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/protected",
        headers: {
          authorization: "NotBearer token",
        },
      });

      expect(response.statusCode).toBe(401);
      const payload = JSON.parse(response.payload);
      expect(payload).toEqual({
        code: "UNAUTHORIZED",
        message: "Invalid token",
      });
    });

    it("returns 401 when token is invalid", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/protected",
        headers: {
          authorization: "Bearer invalid.jwt.token",
        },
      });

      expect(response.statusCode).toBe(401);
      const payload = JSON.parse(response.payload);
      expect(payload.code).toBe("UNAUTHORIZED");
      expect(payload.message).toBe("Invalid token");
    });

    it("returns 401 when token is expired", async () => {
      const signer = createSigner({
        key: "test-jwt-secret-for-plugin",
        expiresIn: "1ms", // Immediately expired
      });

      const userPayload = { userId: 123, openid: "test-openid" };
      const expiredToken = await signer(userPayload);

      // Wait for token to expire
      await new Promise((resolve) => setTimeout(resolve, 10));

      const response = await server.inject({
        method: "GET",
        url: "/protected",
        headers: {
          authorization: `Bearer ${expiredToken}`,
        },
      });

      expect(response.statusCode).toBe(401);
      const payload = JSON.parse(response.payload);
      expect(payload).toEqual({
        code: "UNAUTHORIZED",
        message: "Invalid token",
      });
    });

    it("decorates request with user payload when token is valid", async () => {
      const signer = createSigner({
        key: "test-jwt-secret-for-plugin",
        expiresIn: "1h",
      });

      const userPayload = { userId: 456, openid: "valid-test-openid" };
      const validToken = await signer(userPayload);

      const response = await server.inject({
        method: "GET",
        url: "/protected",
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.user).toEqual(userPayload);
      expect(body.message).toBe("success");
    });

    it("handles token without Bearer prefix gracefully", async () => {
      const signer = createSigner({
        key: "test-jwt-secret-for-plugin",
        expiresIn: "1h",
      });

      const userPayload = { userId: 789, openid: "no-bearer-openid" };
      const validToken = await signer(userPayload);

      const response = await server.inject({
        method: "GET",
        url: "/protected",
        headers: {
          authorization: validToken, // No "Bearer " prefix
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.user).toEqual(userPayload);
    });
  });

  describe("requireRole decorator", () => {
    let validToken: string;
    const userPayload = { userId: 100, openid: "role-test-openid" };

    beforeEach(async () => {
      const signer = createSigner({
        key: "test-jwt-secret-for-plugin",
        expiresIn: "1h",
      });
      validToken = await signer(userPayload);
      prismaMock.user.findUnique.mockResolvedValue({
        id: userPayload.userId,
        role: "STAFF",
        openid: userPayload.openid,
        unionid: null,
        created_at: new Date(),
        updated_at: new Date(),
      });
    });

    it("returns 401 when user is not authenticated", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/staff-only",
      });

      expect(response.statusCode).toBe(401);
    });

    it("returns 401 when req.user is missing even with token", async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      const response = await server.inject({
        method: "GET",
        url: "/staff-only",
        headers: { authorization: `Bearer ${validToken}` },
      });

      expect(response.statusCode).toBe(401);
      const payload = JSON.parse(response.payload);
      expect(payload.code).toBe("UNAUTHORIZED");
    });

    it("returns 403 when user has wrong role", async () => {
      // Mock user with USER role trying to access STAFF endpoint
      prismaMock.user.findUnique.mockResolvedValue({
        id: userPayload.userId,
        role: "USER",
        openid: userPayload.openid,
        unionid: null,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const response = await server.inject({
        method: "GET",
        url: "/staff-only",
        headers: { authorization: `Bearer ${validToken}` },
      });

      expect(response.statusCode).toBe(403);
      const payload = JSON.parse(response.payload);
      expect(payload.code).toBe("FORBIDDEN");
      expect(payload.message).toBe("Forbidden");
    });

    it("grants access when user has correct role", async () => {
      // Create token with STAFF role included
      const signer = createSigner({
        key: "test-jwt-secret-for-plugin",
        expiresIn: "1h",
      });
      const staffToken = await signer({
        userId: userPayload.userId,
        openid: userPayload.openid,
        role: "STAFF" // Include role in JWT payload
      });

      prismaMock.user.findUnique.mockResolvedValue({
        id: userPayload.userId,
        role: "STAFF",
        openid: userPayload.openid,
        unionid: null,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const response = await server.inject({
        method: "GET",
        url: "/staff-only",
        headers: { authorization: `Bearer ${staffToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual({
        message: "staff access granted",
      });
    });

    it("works correctly for USER role as well", async () => {
      // Create token with USER role included
      const signer = createSigner({
        key: "test-jwt-secret-for-plugin",
        expiresIn: "1h",
      });
      const userToken = await signer({
        userId: userPayload.userId,
        openid: userPayload.openid,
        role: "USER" // Include role in JWT payload
      });

      prismaMock.user.findUnique.mockResolvedValue({
        id: userPayload.userId,
        role: "USER",
        openid: userPayload.openid,
        unionid: null,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const response = await server.inject({
        method: "GET",
        url: "/user-only",
        headers: { authorization: `Bearer ${userToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.payload)).toEqual({
        message: "user access granted",
      });
    });

    it("returns 500 when database lookup fails", async () => {
      prismaMock.user.findUnique.mockRejectedValue(new Error("Database error"));

      const response = await server.inject({
        method: "GET",
        url: "/staff-only",
        headers: { authorization: `Bearer ${validToken}` },
      });

      expect(response.statusCode).toBe(500);
      const payload = JSON.parse(response.payload);
      expect(payload.code).toBe("INTERNAL_ERROR");
    });

    it("returns 401 when user not found in database", async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      const response = await server.inject({
        method: "GET",
        url: "/staff-only",
        headers: { authorization: `Bearer ${validToken}` },
      });

      expect(response.statusCode).toBe(401);
      const payload = JSON.parse(response.payload);
      expect(payload.code).toBe("UNAUTHORIZED");
      expect(payload.message).toBe("User not found");
    });
  });
});
