import { describe, it, expect } from "vitest";
import { estimateMinutes } from "../services/study/dashboardService";

describe("dashboardService.estimateMinutes", () => {
  it("returns 0 for non-positive totals", () => {
    expect(estimateMinutes(0, 0, 0)).toBe(0);
    expect(estimateMinutes(-1, 0, 0)).toBe(0);
    expect(estimateMinutes(0, -1, 0)).toBe(0);
    expect(estimateMinutes(0, 0, -1)).toBe(0);
  });

  it("ceil-divides total seconds by 60", () => {
    const seconds = 8 + 30 + 30;
    const expected = Math.ceil((8 + 30 + 30) / 60);
    expect(estimateMinutes(1, 1, 1)).toBe(expected);
  });
});
