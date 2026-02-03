import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";

describe("/metrics auth", () => {
  const originalEnv = { ...process.env };
  let app: FastifyInstance | null = null;

  beforeAll(async () => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
      METRICS_ALLOW_ANONYMOUS: "false",
      METRICS_AUTH_TOKEN: "test-metrics-token",
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

  it("should reject when missing token", async () => {
    const res = await app!.inject({ method: "GET", url: "/metrics" });
    expect(res.statusCode).toBe(401);
  });

  it("should allow when token matches", async () => {
    const res = await app!.inject({
      method: "GET",
      url: "/metrics",
      headers: { authorization: "Bearer test-metrics-token" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
  });
});
