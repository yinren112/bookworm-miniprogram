import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { FeedbackRating } from "@prisma/client";
import { getPrismaClientForWorker } from "./globalSetup";
import { submitCardFeedback } from "../services/study";
import { getBeijingTodayStart } from "../utils/timezone";

describe("Study Card todayShownCount", () => {
  const prisma = getPrismaClientForWorker();

  const createSeed = async () => {
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

    return { user, course, card };
  };

  it("resets todayShownCount when lastAnsweredAt is before todayStart", async () => {
    const { user, card } = await createSeed();
    const todayStart = getBeijingTodayStart();
    const sessionId = crypto.randomUUID();

    await prisma.userCardState.create({
      data: {
        userId: user.id,
        cardId: card.id,
        boxLevel: 2,
        nextDueAt: new Date(),
        lastAnsweredAt: new Date(todayStart.getTime() - 60 * 1000),
        todayShownCount: 2,
        totalAttempts: 2,
      },
    });

    await submitCardFeedback(
      prisma,
      user.id,
      card.id,
      sessionId,
      FeedbackRating.KNEW,
    );

    const state = await prisma.userCardState.findUnique({
      where: { userId_cardId: { userId: user.id, cardId: card.id } },
    });

    expect(state?.todayShownCount).toBe(1);
    expect(state?.totalAttempts).toBe(3);
    expect(state?.lastSessionId).toBe(sessionId);
  });

  it("increments todayShownCount within the same day", async () => {
    const { user, card } = await createSeed();
    const todayStart = getBeijingTodayStart();
    const firstSessionId = crypto.randomUUID();

    await prisma.userCardState.create({
      data: {
        userId: user.id,
        cardId: card.id,
        boxLevel: 1,
        nextDueAt: new Date(),
        lastAnsweredAt: new Date(todayStart.getTime() + 60 * 1000),
        todayShownCount: 1,
        totalAttempts: 1,
        lastSessionId: firstSessionId,
      },
    });

    const secondSessionId = crypto.randomUUID();

    await submitCardFeedback(
      prisma,
      user.id,
      card.id,
      secondSessionId,
      FeedbackRating.FUZZY,
    );

    const state = await prisma.userCardState.findUnique({
      where: { userId_cardId: { userId: user.id, cardId: card.id } },
    });

    expect(state?.todayShownCount).toBe(2);
    expect(state?.totalAttempts).toBe(2);
    expect(state?.lastSessionId).toBe(secondSessionId);
  });
});
