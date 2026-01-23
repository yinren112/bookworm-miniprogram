import { describe, it, expect } from "vitest";
import { FeedbackRating } from "@prisma/client";
import { calculateNextSchedule, LEITNER_INTERVALS } from "../services/study";
import { getBeijingDateStart } from "../utils/timezone";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

describe("Study Card exam schedule", () => {
  it("uses cram intervals when exam is within 7 days", () => {
    const now = new Date("2026-01-10T04:00:00.000Z");
    const todayStart = getBeijingDateStart(now);
    const examDate = new Date(now.getTime() + 5 * MS_PER_DAY);

    const result = calculateNextSchedule(1, FeedbackRating.KNEW, {
      examDate,
      now,
      todayStart,
    });

    const diffDays = Math.round((result.nextDueAt.getTime() - now.getTime()) / MS_PER_DAY);
    expect(diffDays).toBe(1);
  });

  it("falls back to Leitner intervals when exam is far away", () => {
    const now = new Date("2026-01-10T04:00:00.000Z");
    const todayStart = getBeijingDateStart(now);
    const examDate = new Date(now.getTime() + 30 * MS_PER_DAY);

    const result = calculateNextSchedule(1, FeedbackRating.KNEW, {
      examDate,
      now,
      todayStart,
    });

    const diffDays = Math.round((result.nextDueAt.getTime() - now.getTime()) / MS_PER_DAY);
    expect(diffDays).toBe(LEITNER_INTERVALS[2]);
  });
});
