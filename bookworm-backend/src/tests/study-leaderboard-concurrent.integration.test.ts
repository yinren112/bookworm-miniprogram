import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestApp } from "../app-factory";
import { FastifyInstance } from "fastify";
import { getPrismaClientForWorker, createTestUser } from "./globalSetup";
import crypto from "node:crypto";

describe("Study Leaderboard Concurrent Integration", () => {
  let app: FastifyInstance;
  const prisma = getPrismaClientForWorker();

  beforeAll(async () => {
    app = await createTestApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("should not fail on concurrent first activity", async () => {
    const { token } = await createTestUser("USER");

    const courseKey = `LB_CONC_${Date.now()}`;
    const course = await prisma.studyCourse.create({
      data: {
        courseKey,
        title: "Leaderboard Concurrent Course",
        contentVersion: 1,
        status: "PUBLISHED",
      },
    });

    const unit = await prisma.studyUnit.create({
      data: {
        courseId: course.id,
        unitKey: "UNIT_LB",
        title: "Unit",
        orderIndex: 1,
      },
    });

    const card = await prisma.studyCard.create({
      data: {
        courseId: course.id,
        unitId: unit.id,
        contentId: `CARD_LB_${Date.now()}`,
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

    const [r1, r2] = await Promise.all([
      app.inject({
        method: "POST",
        url: `/api/study/cards/${encodeURIComponent(card.contentId)}/answer`,
        headers: { authorization: `Bearer ${token}` },
        payload: { sessionId: crypto.randomUUID(), rating: "KNEW", courseKey },
      }),
      app.inject({
        method: "POST",
        url: `/api/study/cards/${encodeURIComponent(card.contentId)}/answer`,
        headers: { authorization: `Bearer ${token}` },
        payload: { sessionId: crypto.randomUUID(), rating: "KNEW", courseKey },
      }),
    ]);

    expect([r1.statusCode, r2.statusCode].sort()).toEqual([200, 200]);

    const leaderboard = await app.inject({
      method: "GET",
      url: "/api/study/leaderboard?limit=10",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(leaderboard.statusCode).toBe(200);
    const payload = JSON.parse(leaderboard.payload);
    expect(payload.myStreak.weeklyPoints).toBeGreaterThanOrEqual(2);
  });
});
