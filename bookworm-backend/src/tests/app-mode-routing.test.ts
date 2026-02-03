import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";

describe("review-only routing", () => {
  const originalEnv = { ...process.env };
  let app: FastifyInstance | null = null;

  beforeAll(async () => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
      APP_MODE: "review",
    };

    const { createTestApp } = await import("../app-factory");
    app = await createTestApp();
    await app.ready();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
      app = null;
    }
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("should register study routes in review mode", async () => {
    const res = await app!.inject({
      method: "GET",
      url: "/api/study/courses",
    });
    expect(res.statusCode).toBe(401);
  });

  it("should not register commerce routes in review mode", async () => {
    const ordersRes = await app!.inject({
      method: "POST",
      url: "/api/orders/create",
    });
    expect(ordersRes.statusCode).toBe(404);

    const paymentRes = await app!.inject({
      method: "POST",
      url: "/api/payment/notify",
    });
    expect(paymentRes.statusCode).toBe(404);
  });
});
