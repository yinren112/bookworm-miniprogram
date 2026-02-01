import { describe, it, expect } from "vitest";
import { FeedbackRating } from "@prisma/client";
import { calculateNextSchedule } from "../services/study/cardScheduler";
import { EXAM_INTERVALS, FORGOT_INTERVAL_HOURS, LEITNER_INTERVALS, MS_PER_DAY } from "../constants/study";

describe("cardScheduler.calculateNextSchedule", () => {
  it("schedules FORGOT as box 1 and +FORGOT_INTERVAL_HOURS", () => {
    const todayStart = new Date("2026-02-01T00:00:00+08:00");
    const now = new Date("2026-02-01T01:00:00+08:00");

    const result = calculateNextSchedule(3, FeedbackRating.FORGOT, { now, todayStart });

    expect(result.newBoxLevel).toBe(1);
    expect(result.nextDueAt.getTime()).toBe(now.getTime() + FORGOT_INTERVAL_HOURS * 60 * 60 * 1000);
  });

  it("schedules FUZZY as box-1 (min 1) and +1 day", () => {
    const todayStart = new Date("2026-02-01T00:00:00+08:00");
    const now = new Date("2026-02-01T01:00:00+08:00");

    const result = calculateNextSchedule(1, FeedbackRating.FUZZY, { now, todayStart });

    expect(result.newBoxLevel).toBe(1);
    expect(result.nextDueAt.getTime()).toBe(now.getTime() + MS_PER_DAY);
  });

  it("uses LEITNER intervals when exam is not within prep/cram window", () => {
    const todayStart = new Date("2026-02-01T00:00:00+08:00");
    const now = new Date("2026-02-01T01:00:00+08:00");
    const examDate = new Date("2026-04-01T00:00:00+08:00");

    const result = calculateNextSchedule(2, FeedbackRating.KNEW, { now, todayStart, examDate });

    expect(result.newBoxLevel).toBe(3);
    expect(result.nextDueAt.getTime()).toBe(now.getTime() + LEITNER_INTERVALS[3] * MS_PER_DAY);
  });

  it("uses cram intervals when exam is within EXAM_CRAM_DAYS", () => {
    const todayStart = new Date("2026-02-01T00:00:00+08:00");
    const now = new Date("2026-02-01T01:00:00+08:00");
    const examDate = new Date("2026-02-04T00:00:00+08:00");

    const result = calculateNextSchedule(1, FeedbackRating.PERFECT, { now, todayStart, examDate });

    expect(result.newBoxLevel).toBe(3);
    expect(result.nextDueAt.getTime()).toBe(now.getTime() + EXAM_INTERVALS.cram[3] * MS_PER_DAY);
  });
});

