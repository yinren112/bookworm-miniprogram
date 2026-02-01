import { describe, it, expect } from "vitest";
import { getUserRank, getWeeklyLeaderboard, resetWeeklyPoints } from "../services/study/streakService";

function createDbMock(overrides: any = {}) {
  return {
    userStudyStreak: {
      findUnique: async () => null,
      findMany: async () => [],
      count: async () => 0,
      updateMany: async () => ({ count: 0 }),
      ...overrides.userStudyStreak,
    },
  } as any;
}

describe("streakService (unit)", () => {
  it("getUserRank returns null when streak is missing", async () => {
    const db = createDbMock({
      userStudyStreak: {
        findUnique: async () => null,
      },
    });

    expect(await getUserRank(db, 123)).toBeNull();
  });

  it("getUserRank returns null when weeklyPoints is 0", async () => {
    const db = createDbMock({
      userStudyStreak: {
        findUnique: async () => ({
          userId: 1,
          weeklyPoints: 0,
          currentStreak: 1,
          weekStartDate: new Date(),
        }),
      },
    });

    expect(await getUserRank(db, 1)).toBeNull();
  });

  it("getUserRank returns rank based on higher count", async () => {
    const db = createDbMock({
      userStudyStreak: {
        findUnique: async () => ({
          userId: 1,
          weeklyPoints: 10,
          currentStreak: 3,
          weekStartDate: new Date(),
        }),
        count: async () => 4,
      },
    });

    expect(await getUserRank(db, 1)).toBe(5);
  });

  it("getWeeklyLeaderboard maps entries with rank and nickname fallback", async () => {
    const db = createDbMock({
      userStudyStreak: {
        findMany: async () => [
          {
            userId: 1,
            weeklyPoints: 3,
            currentStreak: 2,
            weekStartDate: new Date(),
            user: { nickname: "", avatar_url: null },
          },
          {
            userId: 2,
            weeklyPoints: 2,
            currentStreak: 1,
            weekStartDate: new Date(),
            user: { nickname: "A", avatar_url: "x" },
          },
        ],
      },
    });

    const list = await getWeeklyLeaderboard(db, undefined, 50);
    expect(list[0].rank).toBe(1);
    expect(list[0].nickname).toBe("匿名用户");
    expect(list[1].rank).toBe(2);
    expect(list[1].nickname).toBe("A");
  });

  it("resetWeeklyPoints returns updated count", async () => {
    const db = createDbMock({
      userStudyStreak: {
        updateMany: async () => ({ count: 7 }),
      },
    });

    expect(await resetWeeklyPoints(db)).toBe(7);
  });
});

