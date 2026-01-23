import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { createTestApp } from "../app-factory";
import { getPrismaClientForWorker, createTestUser } from "./globalSetup";

describe("Study Reminders Integration", () => {
  let app: FastifyInstance;
  const prisma = getPrismaClientForWorker();

  beforeAll(async () => {
    app = await createTestApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("should upsert reminder subscription and return status", async () => {
    const { token, userId } = await createTestUser("USER");
    const templateId = `TEMPLATE_${Date.now()}`;

    const acceptRes = await app.inject({
      method: "POST",
      url: "/api/study/reminders/subscribe",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        templateId,
        result: "accept",
        timezone: "Asia/Shanghai",
      },
    });

    expect(acceptRes.statusCode).toBe(200);
    const acceptPayload = JSON.parse(acceptRes.payload);
    expect(acceptPayload.status).toBe("ACTIVE");
    expect(acceptPayload.nextSendAt).not.toBeNull();

    const acceptRes2 = await app.inject({
      method: "POST",
      url: "/api/study/reminders/subscribe",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        templateId,
        result: "accept",
      },
    });
    expect(acceptRes2.statusCode).toBe(200);

    const count = await prisma.studyReminderSubscription.count({
      where: {
        userId,
        templateId,
      },
    });
    expect(count).toBe(1);

    const rejectRes = await app.inject({
      method: "POST",
      url: "/api/study/reminders/subscribe",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        templateId,
        result: "reject",
      },
    });

    expect(rejectRes.statusCode).toBe(200);
    const rejectPayload = JSON.parse(rejectRes.payload);
    expect(rejectPayload.status).toBe("REJECT");
    expect(rejectPayload.nextSendAt).toBeNull();

    const statusRes = await app.inject({
      method: "GET",
      url: `/api/study/reminders/status?templateId=${templateId}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(statusRes.statusCode).toBe(200);
    const statusPayload = JSON.parse(statusRes.payload);
    expect(statusPayload.status).toBe("REJECT");
    expect(statusPayload.templateId).toBe(templateId);
  });

  it("should return UNKNOWN when no subscription exists", async () => {
    const { token } = await createTestUser("USER");
    const templateId = `TEMPLATE_UNKNOWN_${Date.now()}`;

    const statusRes = await app.inject({
      method: "GET",
      url: `/api/study/reminders/status?templateId=${templateId}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(statusRes.statusCode).toBe(200);
    const statusPayload = JSON.parse(statusRes.payload);
    expect(statusPayload.status).toBe("UNKNOWN");
    expect(statusPayload.templateId).toBe(templateId);
  });
});
