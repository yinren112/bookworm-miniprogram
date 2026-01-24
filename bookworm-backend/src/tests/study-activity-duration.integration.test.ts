import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import { createTestApp } from "../app-factory";
import { createTestUser } from "./globalSetup";

function getBeijingNow() {
  const now = new Date();
  return new Date(now.getTime() + 8 * 60 * 60 * 1000 + now.getTimezoneOffset() * 60 * 1000);
}

function formatYmd(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(ymd: string, deltaDays: number) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) throw new Error("invalid ymd");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  const next = new Date(date.getTime() + deltaDays * 24 * 60 * 60 * 1000);
  return next.toISOString().slice(0, 10);
}

describe("Study Activity Duration Integration", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("records duration idempotently via pulse and exposes it in activity-history", async () => {
    const { token } = await createTestUser("USER");
    const todayYmd = formatYmd(getBeijingNow());

    const pulse = async (totalDurationSeconds: number) => {
      return app.inject({
        method: "POST",
        url: "/api/study/activity/pulse",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          type: "card",
          activityDate: todayYmd,
          totalDurationSeconds,
        },
      });
    };

    const first = await pulse(600);
    expect(first.statusCode).toBe(200);

    const replay = await pulse(600);
    expect(replay.statusCode).toBe(200);

    const smaller = await pulse(300);
    expect(smaller.statusCode).toBe(200);

    const bigger = await pulse(900);
    expect(bigger.statusCode).toBe(200);

    const historyRes = await app.inject({
      method: "GET",
      url: "/api/study/activity-history?days=1",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(historyRes.statusCode).toBe(200);
    const historyPayload = JSON.parse(historyRes.payload);
    expect(historyPayload.totalDurationSeconds).toBe(900);
    expect(historyPayload.days).toHaveLength(1);
    expect(historyPayload.days[0].date).toBe(todayYmd);
    expect(historyPayload.days[0].cardDurationSeconds).toBe(900);
    expect(historyPayload.days[0].totalDurationSeconds).toBe(900);
  });

  it("keeps the maximum value under concurrent pulses", async () => {
    const { token } = await createTestUser("USER");
    const todayYmd = formatYmd(getBeijingNow());

    const pulse = (totalDurationSeconds: number) => {
      return app.inject({
        method: "POST",
        url: "/api/study/activity/pulse",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          type: "quiz",
          activityDate: todayYmd,
          totalDurationSeconds,
        },
      });
    };

    const results = await Promise.all([pulse(120), pulse(300), pulse(240)]);
    for (const res of results) {
      expect(res.statusCode).toBe(200);
    }

    const historyRes = await app.inject({
      method: "GET",
      url: "/api/study/activity-history?days=1",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(historyRes.statusCode).toBe(200);
    const payload = JSON.parse(historyRes.payload);
    expect(payload.days[0].quizDurationSeconds).toBe(300);
  });

  it("rejects activityDate outside backfill window and in the future", async () => {
    const { token } = await createTestUser("USER");
    const todayYmd = formatYmd(getBeijingNow());
    const tooOld = addDays(todayYmd, -8);
    const tomorrow = addDays(todayYmd, 1);

    const tooOldRes = await app.inject({
      method: "POST",
      url: "/api/study/activity/pulse",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        type: "quiz",
        activityDate: tooOld,
        totalDurationSeconds: 60,
      },
    });
    expect(tooOldRes.statusCode).toBe(400);

    const futureRes = await app.inject({
      method: "POST",
      url: "/api/study/activity/pulse",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        type: "quiz",
        activityDate: tomorrow,
        totalDurationSeconds: 60,
      },
    });
    expect(futureRes.statusCode).toBe(400);
  });
});
