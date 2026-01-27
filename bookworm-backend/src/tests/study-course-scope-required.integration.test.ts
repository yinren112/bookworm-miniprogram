import { beforeAll, afterAll, describe, expect, it } from "vitest";
import crypto from "crypto";
import { FastifyInstance } from "fastify";
import { createTestApp } from "../app-factory";
import { createTestUser } from "./globalSetup";

describe("Study Course Scope Required", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("should reject card answers and stars without course scope", async () => {
    const { token } = await createTestUser("USER");

    const answerRes = await app.inject({
      method: "POST",
      url: "/api/study/cards/CARD_SCOPE_REQUIRED/answer",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        sessionId: crypto.randomUUID(),
        rating: "KNEW",
      },
    });
    expect(answerRes.statusCode).toBe(400);
    expect(JSON.parse(answerRes.payload).code).toBe("COURSE_SCOPE_REQUIRED");

    const starCardRes = await app.inject({
      method: "POST",
      url: "/api/study/star",
      headers: { authorization: `Bearer ${token}` },
      payload: { type: "card", contentId: "CARD_SCOPE_REQUIRED" },
    });
    expect(starCardRes.statusCode).toBe(400);
    expect(JSON.parse(starCardRes.payload).code).toBe("COURSE_SCOPE_REQUIRED");

    const starQuestionRes = await app.inject({
      method: "POST",
      url: "/api/study/star",
      headers: { authorization: `Bearer ${token}` },
      payload: { type: "question", questionId: 1 },
    });
    expect(starQuestionRes.statusCode).toBe(400);
    expect(JSON.parse(starQuestionRes.payload).code).toBe("COURSE_SCOPE_REQUIRED");
  });
});
