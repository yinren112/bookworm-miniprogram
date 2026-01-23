import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "crypto";
import { FastifyInstance } from "fastify";
import { createTestApp } from "../app-factory";
import { getPrismaClientForWorker, createTestUser } from "./globalSetup";
import { QuestionType } from "@prisma/client";

describe("Study Dashboard Integration", () => {
  let app: FastifyInstance;
  const prisma = getPrismaClientForWorker();

  beforeAll(async () => {
    app = await createTestApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("should aggregate dashboard stats for enrolled course", async () => {
    const { token, userId } = await createTestUser("USER");
    const courseKey = `DASH_${Date.now()}`;

    const course = await prisma.studyCourse.create({
      data: {
        courseKey,
        title: "Dashboard Course",
        contentVersion: 1,
        status: "PUBLISHED",
        totalCards: 1,
        totalQuestions: 2,
      },
    });

    const unit = await prisma.studyUnit.create({
      data: {
        courseId: course.id,
        unitKey: "UNIT_DASH",
        title: "Unit Dash",
        orderIndex: 1,
      },
    });

    const card = await prisma.studyCard.create({
      data: {
        courseId: course.id,
        unitId: unit.id,
        contentId: `CARD_DASH_${Date.now()}`,
        front: "Front",
        back: "Back",
        difficulty: 1,
        sortOrder: 1,
      },
    });

    const question1 = await prisma.studyQuestion.create({
      data: {
        courseId: course.id,
        unitId: unit.id,
        contentId: `Q_DASH_${Date.now()}_1`,
        questionType: QuestionType.SINGLE_CHOICE,
        stem: "Question 1?",
        optionsJson: ["A", "B"],
        answerJson: "A",
        difficulty: 1,
        sortOrder: 1,
      },
    });

    const question2 = await prisma.studyQuestion.create({
      data: {
        courseId: course.id,
        unitId: unit.id,
        contentId: `Q_DASH_${Date.now()}_2`,
        questionType: QuestionType.SINGLE_CHOICE,
        stem: "Question 2?",
        optionsJson: ["A", "B"],
        answerJson: "B",
        difficulty: 1,
        sortOrder: 2,
      },
    });

    await prisma.userCourseEnrollment.create({
      data: {
        userId,
        courseId: course.id,
      },
    });

    await prisma.userCardState.create({
      data: {
        userId,
        cardId: card.id,
        boxLevel: 1,
        nextDueAt: new Date(Date.now() - 60 * 1000),
        lastAnsweredAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        todayShownCount: 0,
        totalAttempts: 1,
      },
    });

    await prisma.userQuestionAttempt.create({
      data: {
        userId,
        questionId: question1.id,
        sessionId: crypto.randomUUID(),
        chosenAnswerJson: "A",
        isCorrect: true,
      },
    });

    await prisma.userWrongItem.create({
      data: {
        userId,
        questionId: question2.id,
        wrongCount: 1,
        lastWrongAt: new Date(),
      },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/study/dashboard",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.payload);
    expect(payload.dueCardCount).toBe(1);
    expect(payload.dueQuizCount).toBe(1);
    expect(payload.wrongCount).toBe(1);
    expect(payload.etaMinutes).toBe(1);
    expect(payload.currentCourse.courseKey).toBe(courseKey);
  });
});
