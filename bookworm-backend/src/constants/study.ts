export const LEITNER_INTERVALS: Record<number, number> = {
  1: 1,
  2: 3,
  3: 7,
  4: 14,
  5: 30,
};

export const MAX_DAILY_ATTEMPTS = 3;
export const FORGOT_INTERVAL_HOURS = 5;
export const EXAM_PREP_DAYS = 21;
export const EXAM_CRAM_DAYS = 7;

export const EXAM_INTERVALS: Record<"prep" | "cram", Record<number, number>> = {
  prep: {
    1: 1,
    2: 2,
    3: 4,
    4: 7,
    5: 14,
  },
  cram: {
    1: 1,
    2: 1,
    3: 2,
    4: 3,
    5: 5,
  },
};

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

