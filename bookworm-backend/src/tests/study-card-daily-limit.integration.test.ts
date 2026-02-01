import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestApp } from "../app-factory";
import { FastifyInstance } from "fastify";
import { getPrismaClientForWorker, createTestUser } from "./globalSetup";
import crypto from "node:crypto";

describe("Study Card Daily Limit Integration", () => {
  let app: FastifyInstance;
  const prisma = getPrismaClientForWorker();

  beforeAll(async () => {
    app = await createTestApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("should reject after exceeding daily attempts", async () => {
    const { token } = await createTestUser("USER");

    const courseKey = `CARD_DAILY_${Date.now()}`;
    const course = await prisma.studyCourse.create({
      data: {
        courseKey,
        title: "Card Daily Limit Course",
        contentVersion: 1,
        status: "PUBLISHED",
      },
    });

    const unit = await prisma.studyUnit.create({
      data: {
        courseId: course.id,
        unitKey: "UNIT_DAILY",
        title: "Unit",
        orderIndex: 1,
      },
    });

    const card = await prisma.studyCard.create({
      data: {
        courseId: course.id,
        unitId: unit.id,
        contentId: `CARD_DAILY_${Date.now()}`,
        front: "F",
        back: "B",
        difficulty: 1,
        sortOrder: 1,
      },
    });

    const start = await app.inject({
      method: "POST",
      url: "/api/study/start",
      headers: { authorization: `Bearer ${token}` },
      payload: { courseKey, limit: 1 },
    });
    expect(start.statusCode).toBe(200);

    for (const sessionId of [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()]) {
      const res = await app.inject({
        method: "POST",
        url: `/api/study/cards/${encodeURIComponent(card.contentId)}/answer`,
        headers: { authorization: `Bearer ${token}` },
        payload: { sessionId, rating: "KNEW", courseKey },
      });
      expect(res.statusCode).toBe(200);
    }

    const exceeded = await app.inject({
      method: "POST",
      url: `/api/study/cards/${encodeURIComponent(card.contentId)}/answer`,
      headers: { authorization: `Bearer ${token}` },
      payload: { sessionId: crypto.randomUUID(), rating: "KNEW", courseKey },
    });
    expect(exceeded.statusCode).toBe(429);
    const payload = JSON.parse(exceeded.payload);
    expect(payload.code).toBe("CARD_DAILY_LIMIT_REACHED");
  });
});
