// src/tests/auth-semantics.test.ts
/**
 * 401 vs 403 语义测试
 * 401: 未认证 (无 token / token 无效 / 过期)
 * 403: 已认证但无权限 (role 缺失或不匹配)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import { PrismaClient } from "@prisma/client";
import Fastify, { FastifyInstance } from "fastify";
import { createSigner } from "fast-jwt";

const prismaMock = mockDeep<PrismaClient>();

vi.mock("../db", () => ({ default: prismaMock }));
vi.mock("../config", () => ({
  default: {
    JWT_SECRET: "test-jwt-secret-auth-semantics",
  },
}));

// Import AFTER mocking
const authPlugin = await import("../plugins/auth").then((m) => m.default);

describe("Auth Middleware: 401 vs 403 Semantics", () => {
  let server: FastifyInstance;
  let signer: ReturnType<typeof createSigner>;

  beforeEach(async () => {
    mockReset(prismaMock);
    server = Fastify({ logger: false });

    await server.register(authPlugin);

    // STAFF-only endpoint for testing
    server.get(
      "/staff-endpoint",
      {
        preHandler: [server.authenticate, server.requireRole("STAFF")],
      },
      async () => ({
        message: "staff access granted",
      }),
    );

    // USER-only endpoint for testing
    server.get(
      "/user-endpoint",
      {
        preHandler: [server.authenticate, server.requireRole("USER")],
      },
      async () => ({
        message: "user access granted",
      }),
    );

    await server.ready();

    // Create token signer
    signer = createSigner({
      key: "test-jwt-secret-auth-semantics",
      expiresIn: "1h",
    });
  });

  afterEach(async () => {
    if (server) await server.close();
  });

  describe("401 UNAUTHORIZED - 未认证场景", () => {
    it("missing token → 401", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/staff-endpoint",
      });

      expect(response.statusCode).toBe(401);
      const payload = JSON.parse(response.payload);
      expect(payload.code).toBe("UNAUTHORIZED");
      expect(payload.message).toContain("Missing");
    });

    it("invalid token → 401", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/staff-endpoint",
        headers: {
          authorization: "Bearer invalid.jwt.token",
        },
      });

      expect(response.statusCode).toBe(401);
      const payload = JSON.parse(response.payload);
      expect(payload.code).toBe("UNAUTHORIZED");
      expect(payload.message).toBe("Invalid token");
    });

    it("expired token → 401", async () => {
      const expiredSigner = createSigner({
        key: "test-jwt-secret-auth-semantics",
        expiresIn: "1ms",
      });

      const expiredToken = await expiredSigner({
        userId: 1,
        openid: "test-openid",
        role: "STAFF",
      });

      // Wait for token to expire
      await new Promise((resolve) => setTimeout(resolve, 10));

      const response = await server.inject({
        method: "GET",
        url: "/staff-endpoint",
        headers: {
          authorization: `Bearer ${expiredToken}`,
        },
      });

      expect(response.statusCode).toBe(401);
      const payload = JSON.parse(response.payload);
      expect(payload.code).toBe("UNAUTHORIZED");
    });
  });

  describe("403 FORBIDDEN - 已认证但无权限场景", () => {
    it("token without role field → 403 (老 token 场景)", async () => {
      // 模拟旧版本签发的 token，不包含 role 字段
      const tokenWithoutRole = await signer({
        userId: 1,
        openid: "test-openid",
        // 故意不设置 role
      });

      const response = await server.inject({
        method: "GET",
        url: "/staff-endpoint",
        headers: {
          authorization: `Bearer ${tokenWithoutRole}`,
        },
      });

      expect(response.statusCode).toBe(403);
      const payload = JSON.parse(response.payload);
      expect(payload.code).toBe("FORBIDDEN");
      expect(payload.message).toBe("Role required");
    });

    it("token with wrong role → 403", async () => {
      // USER 尝试访问 STAFF 端点
      const userToken = await signer({
        userId: 1,
        openid: "test-openid",
        role: "USER",
      });

      const response = await server.inject({
        method: "GET",
        url: "/staff-endpoint",
        headers: {
          authorization: `Bearer ${userToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
      const payload = JSON.parse(response.payload);
      expect(payload.code).toBe("FORBIDDEN");
      expect(payload.message).toBe("Forbidden");
    });

    it("STAFF token trying to access USER endpoint → 403", async () => {
      const staffToken = await signer({
        userId: 1,
        openid: "test-openid",
        role: "STAFF",
      });

      const response = await server.inject({
        method: "GET",
        url: "/user-endpoint",
        headers: {
          authorization: `Bearer ${staffToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
      const payload = JSON.parse(response.payload);
      expect(payload.code).toBe("FORBIDDEN");
    });
  });

  describe("200 OK - 正确的认证和授权", () => {
    it("STAFF token accessing STAFF endpoint → 200", async () => {
      const staffToken = await signer({
        userId: 1,
        openid: "test-openid",
        role: "STAFF",
      });

      const response = await server.inject({
        method: "GET",
        url: "/staff-endpoint",
        headers: {
          authorization: `Bearer ${staffToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.payload);
      expect(payload.message).toBe("staff access granted");
    });

    it("USER token accessing USER endpoint → 200", async () => {
      const userToken = await signer({
        userId: 2,
        openid: "test-openid-2",
        role: "USER",
      });

      const response = await server.inject({
        method: "GET",
        url: "/user-endpoint",
        headers: {
          authorization: `Bearer ${userToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const payload = JSON.parse(response.payload);
      expect(payload.message).toBe("user access granted");
    });
  });

  describe("边界情况", () => {
    it("role 为 null → 403", async () => {
      const tokenWithNullRole = await signer({
        userId: 1,
        openid: "test-openid",
        role: null, // 明确设置为 null
      });

      const response = await server.inject({
        method: "GET",
        url: "/staff-endpoint",
        headers: {
          authorization: `Bearer ${tokenWithNullRole}`,
        },
      });

      expect(response.statusCode).toBe(403);
      const payload = JSON.parse(response.payload);
      expect(payload.code).toBe("FORBIDDEN");
    });

    it("role 为空字符串 → 403", async () => {
      const tokenWithEmptyRole = await signer({
        userId: 1,
        openid: "test-openid",
        role: "", // 空字符串
      });

      const response = await server.inject({
        method: "GET",
        url: "/staff-endpoint",
        headers: {
          authorization: `Bearer ${tokenWithEmptyRole}`,
        },
      });

      expect(response.statusCode).toBe(403);
      const payload = JSON.parse(response.payload);
      expect(payload.code).toBe("FORBIDDEN");
    });

    it("role 为未知值 → 403", async () => {
      const tokenWithInvalidRole = await signer({
        userId: 1,
        openid: "test-openid",
        role: "ADMIN", // 不存在的角色
      });

      const response = await server.inject({
        method: "GET",
        url: "/staff-endpoint",
        headers: {
          authorization: `Bearer ${tokenWithInvalidRole}`,
        },
      });

      expect(response.statusCode).toBe(403);
      const payload = JSON.parse(response.payload);
      expect(payload.code).toBe("FORBIDDEN");
    });
  });
});
