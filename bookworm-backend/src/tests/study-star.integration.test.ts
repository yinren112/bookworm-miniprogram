import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "crypto";
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
      payload: { type: "card", contentId: card.contentId, courseKey: course.courseKey },
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
      payload: { type: "card", contentId: card.contentId, courseKey: course.courseKey },
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

  it("should paginate starred items by course", async () => {
    const { token } = await createTestUser("USER");

    const course = await prisma.studyCourse.create({
      data: {
        courseKey: `STAR_PAGE_${Date.now()}`,
        title: "Star Pagination Course",
        contentVersion: 1,
        status: "PUBLISHED",
      },
    });

    const unit = await prisma.studyUnit.create({
      data: {
        courseId: course.id,
        unitKey: "UNIT_PAGE",
        title: "Unit Page",
        orderIndex: 1,
      },
    });

    const cards = await Promise.all(
      [1, 2, 3].map((index) =>
        prisma.studyCard.create({
          data: {
            courseId: course.id,
            unitId: unit.id,
            contentId: `CARD_PAGE_${Date.now()}_${index}`,
            front: `Front ${index}`,
            back: `Back ${index}`,
            difficulty: 1,
            sortOrder: index,
          },
        }),
      ),
    );

    for (const card of cards) {
      const starRes = await app.inject({
        method: "POST",
        url: "/api/study/star",
        headers: { authorization: `Bearer ${token}` },
        payload: { type: "card", contentId: card.contentId, courseKey: course.courseKey },
      });
      expect(starRes.statusCode).toBe(200);
    }

    const pageRes = await app.inject({
      method: "GET",
      url: `/api/study/starred-items?type=card&courseKey=${course.courseKey}&limit=1&offset=1`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(pageRes.statusCode).toBe(200);
    const pagePayload = JSON.parse(pageRes.payload);
    expect(pagePayload.items.length).toBe(1);
    expect(pagePayload.total).toBe(3);
    expect(cards.some((card) => card.contentId === pagePayload.items[0].contentId)).toBe(true);

    const pageRes2 = await app.inject({
      method: "GET",
      url: `/api/study/starred-items?type=card&courseKey=${course.courseKey}&limit=2&offset=0`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(pageRes2.statusCode).toBe(200);
    const pagePayload2 = JSON.parse(pageRes2.payload);
    expect(pagePayload2.items.length).toBe(2);
    expect(pagePayload2.total).toBe(3);
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
      payload: { type: "question", questionId: question.id, courseKey: course.courseKey },
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
      payload: { type: "question", questionId: question.id, courseKey: course.courseKey },
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

  it("should return published course details when newer draft exists", async () => {
    const { token } = await createTestUser("USER");
    const courseKey = `COURSE_MULTI_${Date.now()}`;

    const coursePublished = await prisma.studyCourse.create({
      data: {
        courseKey,
        title: "Published Course",
        contentVersion: 1,
        status: "PUBLISHED",
      },
    });

    const unit = await prisma.studyUnit.create({
      data: {
        courseId: coursePublished.id,
        unitKey: "UNIT_PUB",
        title: "Unit Pub",
        orderIndex: 1,
      },
    });

    const card = await prisma.studyCard.create({
      data: {
        courseId: coursePublished.id,
        unitId: unit.id,
        contentId: `CARD_PUB_${Date.now()}`,
        front: "Front",
        back: "Back",
        difficulty: 1,
        sortOrder: 1,
      },
    });

    await prisma.studyCourse.create({
      data: {
        courseKey,
        title: "Draft Course",
        contentVersion: 2,
        status: "DRAFT",
      },
    });

    const detailRes = await app.inject({
      method: "GET",
      url: `/api/study/courses/${courseKey}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(detailRes.statusCode).toBe(200);
    const detailPayload = JSON.parse(detailRes.payload);
    expect(detailPayload.course.contentVersion).toBe(1);

    const startRes = await app.inject({
      method: "POST",
      url: "/api/study/start",
      headers: { authorization: `Bearer ${token}` },
      payload: { courseKey },
    });
    expect(startRes.statusCode).toBe(200);
    const startPayload = JSON.parse(startRes.payload);
    expect(startPayload.cards.some((item: any) => item.contentId === card.contentId)).toBe(true);
  });

  it("should enforce course scoping for contentId conflicts", async () => {
    const { token, userId } = await createTestUser("USER");
    const sharedContentId = `CARD_SHARED_${Date.now()}`;

    const courseA = await prisma.studyCourse.create({
      data: {
        courseKey: `COURSE_A_${Date.now()}`,
        title: "Course A",
        contentVersion: 1,
        status: "PUBLISHED",
      },
    });

    const courseB = await prisma.studyCourse.create({
      data: {
        courseKey: `COURSE_B_${Date.now()}`,
        title: "Course B",
        contentVersion: 1,
        status: "PUBLISHED",
      },
    });

    const unitA = await prisma.studyUnit.create({
      data: {
        courseId: courseA.id,
        unitKey: "UNIT_A",
        title: "Unit A",
        orderIndex: 1,
      },
    });

    const unitB = await prisma.studyUnit.create({
      data: {
        courseId: courseB.id,
        unitKey: "UNIT_B",
        title: "Unit B",
        orderIndex: 1,
      },
    });

    const cardA = await prisma.studyCard.create({
      data: {
        courseId: courseA.id,
        unitId: unitA.id,
        contentId: sharedContentId,
        front: "Front A",
        back: "Back A",
        difficulty: 1,
        sortOrder: 1,
      },
    });

    const cardB = await prisma.studyCard.create({
      data: {
        courseId: courseB.id,
        unitId: unitB.id,
        contentId: sharedContentId,
        front: "Front B",
        back: "Back B",
        difficulty: 1,
        sortOrder: 1,
      },
    });

    await prisma.userCourseEnrollment.create({
      data: {
        userId,
        courseId: courseA.id,
      },
    });

    await prisma.userCourseEnrollment.create({
      data: {
        userId,
        courseId: courseB.id,
      },
    });

    const ambiguousRes = await app.inject({
      method: "POST",
      url: `/api/study/cards/${sharedContentId}/answer`,
      headers: { authorization: `Bearer ${token}` },
      payload: { sessionId: crypto.randomUUID(), rating: "KNEW" },
    });
    expect(ambiguousRes.statusCode).toBe(409);

    const scopedRes = await app.inject({
      method: "POST",
      url: `/api/study/cards/${sharedContentId}/answer`,
      headers: { authorization: `Bearer ${token}` },
      payload: { sessionId: crypto.randomUUID(), rating: "KNEW", courseKey: courseA.courseKey },
    });
    expect(scopedRes.statusCode).toBe(200);

    const stateA = await prisma.userCardState.findUnique({
      where: { userId_cardId: { userId, cardId: cardA.id } },
    });
    const stateB = await prisma.userCardState.findUnique({
      where: { userId_cardId: { userId, cardId: cardB.id } },
    });
    expect(stateA).not.toBeNull();
    expect(stateB).toBeNull();
  });

  it("should reject stars without courseKey when contentId is ambiguous", async () => {
    const { token, userId } = await createTestUser("USER");
    const sharedContentId = `CARD_STAR_${Date.now()}`;

    const courseA = await prisma.studyCourse.create({
      data: {
        courseKey: `STAR_A_${Date.now()}`,
        title: "Star A",
        contentVersion: 1,
        status: "PUBLISHED",
      },
    });

    const courseB = await prisma.studyCourse.create({
      data: {
        courseKey: `STAR_B_${Date.now()}`,
        title: "Star B",
        contentVersion: 1,
        status: "PUBLISHED",
      },
    });

    const unitA = await prisma.studyUnit.create({
      data: {
        courseId: courseA.id,
        unitKey: "UNIT_SA",
        title: "Unit SA",
        orderIndex: 1,
      },
    });

    const unitB = await prisma.studyUnit.create({
      data: {
        courseId: courseB.id,
        unitKey: "UNIT_SB",
        title: "Unit SB",
        orderIndex: 1,
      },
    });

    await prisma.studyCard.create({
      data: {
        courseId: courseA.id,
        unitId: unitA.id,
        contentId: sharedContentId,
        front: "Front SA",
        back: "Back SA",
        difficulty: 1,
        sortOrder: 1,
      },
    });

    await prisma.studyCard.create({
      data: {
        courseId: courseB.id,
        unitId: unitB.id,
        contentId: sharedContentId,
        front: "Front SB",
        back: "Back SB",
        difficulty: 1,
        sortOrder: 1,
      },
    });

    await prisma.userCourseEnrollment.create({
      data: {
        userId,
        courseId: courseA.id,
      },
    });

    await prisma.userCourseEnrollment.create({
      data: {
        userId,
        courseId: courseB.id,
      },
    });

    const ambiguousStarRes = await app.inject({
      method: "POST",
      url: "/api/study/star",
      headers: { authorization: `Bearer ${token}` },
      payload: { type: "card", contentId: sharedContentId },
    });
    expect(ambiguousStarRes.statusCode).toBe(409);

    const scopedStarRes = await app.inject({
      method: "POST",
      url: "/api/study/star",
      headers: { authorization: `Bearer ${token}` },
      payload: { type: "card", contentId: sharedContentId, courseKey: courseA.courseKey },
    });
    expect(scopedStarRes.statusCode).toBe(200);
  });

  it("should reject feedback when target does not belong to course", async () => {
    const { token } = await createTestUser("USER");

    const courseA = await prisma.studyCourse.create({
      data: {
        courseKey: `FEEDBACK_A_${Date.now()}`,
        title: "Feedback A",
        contentVersion: 1,
        status: "PUBLISHED",
      },
    });

    const courseB = await prisma.studyCourse.create({
      data: {
        courseKey: `FEEDBACK_B_${Date.now()}`,
        title: "Feedback B",
        contentVersion: 1,
        status: "PUBLISHED",
      },
    });

    const unitB = await prisma.studyUnit.create({
      data: {
        courseId: courseB.id,
        unitKey: "UNIT_FB",
        title: "Unit FB",
        orderIndex: 1,
      },
    });

    const cardB = await prisma.studyCard.create({
      data: {
        courseId: courseB.id,
        unitId: unitB.id,
        contentId: `CARD_FB_${Date.now()}`,
        front: "Front FB",
        back: "Back FB",
        difficulty: 1,
        sortOrder: 1,
      },
    });

    const feedbackRes = await app.inject({
      method: "POST",
      url: "/api/study/feedback",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        courseKey: courseA.courseKey,
        cardId: cardB.id,
        reason: "OTHER",
        message: "Mismatch",
      },
    });
    expect(feedbackRes.statusCode).toBe(404);
  });
});
