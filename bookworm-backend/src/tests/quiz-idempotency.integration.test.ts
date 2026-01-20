import { describe, it, expect } from "vitest";
import { getPrismaClientForWorker } from "./globalSetup";
import { submitQuizAnswer } from "../services/study";
import crypto from "crypto";

describe("Quiz Answer Idempotency", () => {
  const prisma = getPrismaClientForWorker();

  it("should return a single attempt for concurrent duplicate submissions", async () => {
    const user = await prisma.user.create({
      data: {
        openid: `quiz-user-${Date.now()}`,
        role: "USER",
        nickname: "Quiz User",
      },
    });

    const course = await prisma.studyCourse.create({
      data: {
        courseKey: `QUIZ_${Date.now()}`,
        title: "Quiz Course",
        contentVersion: 1,
        status: "PUBLISHED",
      },
    });

    const unit = await prisma.studyUnit.create({
      data: {
        courseId: course.id,
        unitKey: "UNIT_QUIZ",
        title: "Quiz Unit",
        orderIndex: 1,
      },
    });

    const question = await prisma.studyQuestion.create({
      data: {
        courseId: course.id,
        unitId: unit.id,
        contentId: "QUESTION_1",
        questionType: "SINGLE_CHOICE",
        stem: "Q",
        optionsJson: ["A", "B"],
        answerJson: "A",
        explanationShort: "A",
        difficulty: 1,
        sortOrder: 1,
      },
    });

    const sessionId = crypto.randomUUID();

    const [first, second] = await Promise.all([
      submitQuizAnswer(prisma, user.id, question.id, sessionId, "A"),
      submitQuizAnswer(prisma, user.id, question.id, sessionId, "A"),
    ]);

    expect(first.isCorrect).toBe(true);
    expect(second.isCorrect).toBe(true);

    const attempts = await prisma.userQuestionAttempt.findMany({
      where: {
        userId: user.id,
        questionId: question.id,
        sessionId,
      },
    });

    expect(attempts).toHaveLength(1);
  });
});
