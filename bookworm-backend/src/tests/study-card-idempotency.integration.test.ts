import { describe, it, expect } from "vitest";
import { getPrismaClientForWorker } from "./globalSetup";
import { submitCardFeedback } from "../services/study";
import { FeedbackRating } from "@prisma/client";
import crypto from "crypto";

describe("Study Card Feedback Idempotency", () => {
  const prisma = getPrismaClientForWorker();

  it("should ignore duplicate submissions for the same session", async () => {
    const user = await prisma.user.create({
      data: {
        openid: `study-user-${Date.now()}`,
        role: "USER",
        nickname: "Study User",
      },
    });

    const course = await prisma.studyCourse.create({
      data: {
        courseKey: `COURSE_${Date.now()}`,
        title: "Test Course",
        contentVersion: 1,
        status: "PUBLISHED",
      },
    });

    const unit = await prisma.studyUnit.create({
      data: {
        courseId: course.id,
        unitKey: "UNIT_1",
        title: "Unit 1",
        orderIndex: 1,
      },
    });

    const card = await prisma.studyCard.create({
      data: {
        courseId: course.id,
        unitId: unit.id,
        contentId: "CARD_1",
        front: "Q",
        back: "A",
        difficulty: 1,
        sortOrder: 1,
      },
    });

    const sessionId = crypto.randomUUID();

    const first = await submitCardFeedback(
      prisma,
      user.id,
      card.id,
      sessionId,
      FeedbackRating.KNEW,
    );

    const second = await submitCardFeedback(
      prisma,
      user.id,
      card.id,
      sessionId,
      FeedbackRating.KNEW,
    );

    expect(second.newBoxLevel).toBe(first.newBoxLevel);
    expect(second.nextDueAt.toISOString()).toBe(first.nextDueAt.toISOString());
    expect(second.todayShownCount).toBe(first.todayShownCount);

    const state = await prisma.userCardState.findUnique({
      where: { userId_cardId: { userId: user.id, cardId: card.id } },
    });

    expect(state?.totalAttempts).toBe(1);
    expect(state?.todayShownCount).toBe(1);
    expect(state?.lastSessionId).toBe(sessionId);
  });
});
