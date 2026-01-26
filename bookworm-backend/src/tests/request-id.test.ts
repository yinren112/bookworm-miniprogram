import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { createTestApp } from "../app-factory";

describe("requestId propagation", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("should set x-request-id header when missing", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/__test__/not-found",
    });

    expect(res.statusCode).toBe(404);
    expect(res.headers["x-request-id"]).toBeTruthy();
  });

  it("should echo provided x-request-id header", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/__test__/not-found",
      headers: {
        "x-request-id": "req_test_123",
      },
    });

    expect(res.statusCode).toBe(404);
    expect(res.headers["x-request-id"]).toBe("req_test_123");
  });
});

