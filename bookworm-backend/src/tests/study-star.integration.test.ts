import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestApp } from "../app-factory";
import { FastifyInstance } from "fastify";
import { getPrismaClientForWorker, createTestUser } from "./globalSetup";
import { QuestionType } from "@prisma/client";

describe("Study Star Integration", () => {
  let app: FastifyInstance;
  const prisma = getPrismaClientForWorker();

  beforeAll(async () => {
    app = await createTestApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("should star and unstar a card", async () => {
    const { token } = await createTestUser("USER");

    const course = await prisma.studyCourse.create({
      data: {
        courseKey: `STAR_CARD_${Date.now()}`,
        title: "Star Card Course",
        contentVersion: 1,
        status: "PUBLISHED",
      },
    });

    const unit = await prisma.studyUnit.create({
      data: {
        courseId: course.id,
        unitKey: "UNIT_CARD",
        title: "Unit Card",
        orderIndex: 1,
      },
    });

    const card = await prisma.studyCard.create({
      data: {
        courseId: course.id,
        unitId: unit.id,
        contentId: `CARD_${Date.now()}`,
        front: "Front",
        back: "Back",
        difficulty: 1,
        sortOrder: 1,
      },
    });

    const starRes = await app.inject({
      method: "POST",
      url: "/api/study/star",
      headers: { authorization: `Bearer ${token}` },
      payload: { type: "card", contentId: card.contentId },
    });
    expect(starRes.statusCode).toBe(200);

    const listRes = await app.inject({
      method: "GET",
      url: `/api/study/starred-items?type=card&courseKey=${course.courseKey}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(listRes.statusCode).toBe(200);
    const listPayload = JSON.parse(listRes.payload);
    expect(listPayload.items.some((item: any) => item.contentId === card.contentId)).toBe(true);

    const unstarRes = await app.inject({
      method: "DELETE",
      url: "/api/study/star",
      headers: { authorization: `Bearer ${token}` },
      payload: { type: "card", contentId: card.contentId },
    });
    expect(unstarRes.statusCode).toBe(200);

    const listAfter = await app.inject({
      method: "GET",
      url: `/api/study/starred-items?type=card&courseKey=${course.courseKey}`,
      headers: { authorization: `Bearer ${token}` },
    });
    const listAfterPayload = JSON.parse(listAfter.payload);
    expect(listAfterPayload.items.some((item: any) => item.contentId === card.contentId)).toBe(false);
  });

  it("should star and unstar a question", async () => {
    const { token } = await createTestUser("USER");

    const course = await prisma.studyCourse.create({
      data: {
        courseKey: `STAR_Q_${Date.now()}`,
        title: "Star Question Course",
        contentVersion: 1,
        status: "PUBLISHED",
      },
    });

    const unit = await prisma.studyUnit.create({
      data: {
        courseId: course.id,
        unitKey: "UNIT_Q",
        title: "Unit Q",
        orderIndex: 1,
      },
    });

    const question = await prisma.studyQuestion.create({
      data: {
        courseId: course.id,
        unitId: unit.id,
        contentId: `QUESTION_${Date.now()}`,
        questionType: QuestionType.SINGLE_CHOICE,
        stem: "Question?",
        optionsJson: ["A", "B"],
        answerJson: "a",
        explanationShort: "Because.",
        difficulty: 1,
        sortOrder: 1,
      },
    });

    const starRes = await app.inject({
      method: "POST",
      url: "/api/study/star",
      headers: { authorization: `Bearer ${token}` },
      payload: { type: "question", questionId: question.id },
    });
    expect(starRes.statusCode).toBe(200);

    const listRes = await app.inject({
      method: "GET",
      url: `/api/study/starred-items?type=question&courseKey=${course.courseKey}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(listRes.statusCode).toBe(200);
    const listPayload = JSON.parse(listRes.payload);
    expect(listPayload.items.some((item: any) => item.questionId === question.id)).toBe(true);

    const unstarRes = await app.inject({
      method: "DELETE",
      url: "/api/study/star",
      headers: { authorization: `Bearer ${token}` },
      payload: { type: "question", questionId: question.id },
    });
    expect(unstarRes.statusCode).toBe(200);

    const listAfter = await app.inject({
      method: "GET",
      url: `/api/study/starred-items?type=question&courseKey=${course.courseKey}`,
      headers: { authorization: `Bearer ${token}` },
    });
    const listAfterPayload = JSON.parse(listAfter.payload);
    expect(listAfterPayload.items.some((item: any) => item.questionId === question.id)).toBe(false);
  });
});
