import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestApp } from "../app-factory";
import { FastifyInstance } from "fastify";
import { getPrismaClientForWorker, createTestUser } from "./globalSetup";
import { QuestionType } from "@prisma/client";

describe("Study Wrong Item Clear Integration", () => {
  let app: FastifyInstance;
  const prisma = getPrismaClientForWorker();

  beforeAll(async () => {
    app = await createTestApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("should re-add wrong item after manual clear and wrong again", async () => {
    const { token } = await createTestUser("USER");

    const courseKey = `WRONG_CLEAR_${Date.now()}`;
    const course = await prisma.studyCourse.create({
      data: {
        courseKey,
        title: "Wrong Item Clear Course",
        contentVersion: 1,
        status: "PUBLISHED",
      },
    });

    const unit = await prisma.studyUnit.create({
      data: {
        courseId: course.id,
        unitKey: "UNIT_WRONG_CLEAR",
        title: "Unit",
        orderIndex: 1,
      },
    });

    const question = await prisma.studyQuestion.create({
      data: {
        courseId: course.id,
        unitId: unit.id,
        contentId: `QUESTION_WRONG_CLEAR_${Date.now()}`,
        questionType: QuestionType.SINGLE_CHOICE,
        stem: "Q?",
        optionsJson: ["A", "B"],
        answerJson: "A",
        explanationShort: "E",
        difficulty: 1,
        sortOrder: 1,
      },
    });

    const start1 = await app.inject({
      method: "POST",
      url: "/api/study/quiz/start",
      headers: { authorization: `Bearer ${token}` },
      payload: { courseKey, limit: 1 },
    });
    expect(start1.statusCode).toBe(200);
    const startPayload1 = JSON.parse(start1.payload);
    const sessionId1 = startPayload1.sessionId;

    const submitWrong1 = await app.inject({
      method: "POST",
      url: "/api/study/quiz/answer",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        sessionId: sessionId1,
        questionId: question.id,
        answer: "B",
        durationMs: 123,
      },
    });
    expect(submitWrong1.statusCode).toBe(200);

    const list1 = await app.inject({
      method: "GET",
      url: `/api/study/wrong-items?courseKey=${encodeURIComponent(courseKey)}&limit=20&offset=0`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(list1.statusCode).toBe(200);
    const listPayload1 = JSON.parse(list1.payload);
    expect(listPayload1.total).toBe(1);
    expect(listPayload1.items.some((item: any) => item.questionId === question.id)).toBe(true);

    const clear = await app.inject({
      method: "DELETE",
      url: `/api/study/wrong-items/${question.id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(clear.statusCode).toBe(200);

    const list2 = await app.inject({
      method: "GET",
      url: `/api/study/wrong-items?courseKey=${encodeURIComponent(courseKey)}&limit=20&offset=0`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(list2.statusCode).toBe(200);
    const listPayload2 = JSON.parse(list2.payload);
    expect(listPayload2.total).toBe(0);

    const start2 = await app.inject({
      method: "POST",
      url: "/api/study/quiz/start",
      headers: { authorization: `Bearer ${token}` },
      payload: { courseKey, limit: 1 },
    });
    expect(start2.statusCode).toBe(200);
    const startPayload2 = JSON.parse(start2.payload);
    const sessionId2 = startPayload2.sessionId;

    const submitWrong2 = await app.inject({
      method: "POST",
      url: "/api/study/quiz/answer",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        sessionId: sessionId2,
        questionId: question.id,
        answer: "B",
        durationMs: 456,
      },
    });
    expect(submitWrong2.statusCode).toBe(200);

    const list3 = await app.inject({
      method: "GET",
      url: `/api/study/wrong-items?courseKey=${encodeURIComponent(courseKey)}&limit=20&offset=0`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(list3.statusCode).toBe(200);
    const listPayload3 = JSON.parse(list3.payload);
    expect(listPayload3.total).toBe(1);
    expect(listPayload3.items.some((item: any) => item.questionId === question.id)).toBe(true);
  });
});

