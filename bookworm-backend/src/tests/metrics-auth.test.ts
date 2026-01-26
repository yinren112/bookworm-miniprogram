import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("/metrics auth", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
      METRICS_ALLOW_ANONYMOUS: "false",
      METRICS_AUTH_TOKEN: "test-metrics-token",
    };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("should reject when missing token", async () => {
    const { createTestApp } = await import("../app-factory");
    const app = await createTestApp();
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/metrics" });
    expect(res.statusCode).toBe(401);

    await app.close();
  });

  it("should allow when token matches", async () => {
    const { createTestApp } = await import("../app-factory");
    const app = await createTestApp();
    await app.ready();

    const res = await app.inject({
      method: "GET",
      url: "/metrics",
      headers: { authorization: "Bearer test-metrics-token" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");

    await app.close();
  });
});

