import { beforeAll, afterAll, describe, expect, it } from "vitest";
import crypto from "crypto";
import { FastifyInstance } from "fastify";
import { createTestApp } from "../app-factory";
import { createTestUser, getPrismaClientForWorker } from "./globalSetup";

describe("Study Card Submit Scoped By Course", () => {
  let app: FastifyInstance;
  const prisma = getPrismaClientForWorker();

  beforeAll(async () => {
    app = await createTestApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("should submit card answers scoped by courseKey", async () => {
    const { token, userId } = await createTestUser("USER");
    const sharedContentId = `CARD_SHARED_${Date.now()}`;

    const courseA = await prisma.studyCourse.create({
      data: {
        courseKey: `COURSE_SCOPE_A_${Date.now()}`,
        title: "Course A",
        contentVersion: 1,
        status: "PUBLISHED",
      },
    });

    const courseB = await prisma.studyCourse.create({
      data: {
        courseKey: `COURSE_SCOPE_B_${Date.now()}`,
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

    const resA = await app.inject({
      method: "POST",
      url: `/api/study/cards/${sharedContentId}/answer`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        sessionId: crypto.randomUUID(),
        rating: "KNEW",
        courseKey: courseA.courseKey,
      },
    });
    expect(resA.statusCode).toBe(200);

    const resB = await app.inject({
      method: "POST",
      url: `/api/study/cards/${sharedContentId}/answer`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        sessionId: crypto.randomUUID(),
        rating: "KNEW",
        courseKey: courseB.courseKey,
      },
    });
    expect(resB.statusCode).toBe(200);

    const stateA = await prisma.userCardState.findUnique({
      where: { userId_cardId: { userId, cardId: cardA.id } },
    });
    const stateB = await prisma.userCardState.findUnique({
      where: { userId_cardId: { userId, cardId: cardB.id } },
    });
    expect(stateA).not.toBeNull();
    expect(stateB).not.toBeNull();
  });
});
