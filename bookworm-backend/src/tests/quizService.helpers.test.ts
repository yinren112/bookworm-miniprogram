import { describe, it, expect } from "vitest";
import { __testing } from "../services/study/quizService";

describe("quizService helper functions", () => {
  describe("parseAnswerTokens", () => {
    it("parses JSON array format", () => {
      expect(__testing.parseAnswerTokens('["A","B"]')).toEqual(["A", "B"]);
    });

    it("falls back to separator parsing when JSON is invalid", () => {
      expect(__testing.parseAnswerTokens('["A",')).toEqual(['["A"']);
    });

    it("splits by pipe and comma (including Chinese comma)", () => {
      expect(__testing.parseAnswerTokens("A|B")).toEqual(["A", "B"]);
      expect(__testing.parseAnswerTokens("A,B")).toEqual(["A", "B"]);
      expect(__testing.parseAnswerTokens("A，B")).toEqual(["A", "B"]);
    });

    it("returns single trimmed token for simple answers", () => {
      expect(__testing.parseAnswerTokens("  hello  ")).toEqual(["hello"]);
      expect(__testing.parseAnswerTokens("")).toEqual([]);
    });
  });

  describe("resolveOptionIndexByLabel", () => {
    it("resolves numeric index", () => {
      const options = ["a", "b", "c"];
      expect(__testing.resolveOptionIndexByLabel("1", options)).toBe(1);
      expect(__testing.resolveOptionIndexByLabel("9", options)).toBe(-1);
    });

    it("resolves true/false aliases", () => {
      const options = ["正确", "错误"];
      expect(__testing.resolveOptionIndexByLabel("true", options)).toBe(0);
      expect(__testing.resolveOptionIndexByLabel("正确", options)).toBe(0);
      expect(__testing.resolveOptionIndexByLabel("false", options)).toBe(1);
      expect(__testing.resolveOptionIndexByLabel("错误", options)).toBe(1);
    });

    it("resolves letter labels A-F", () => {
      const options = ["a", "b", "c", "d"];
      expect(__testing.resolveOptionIndexByLabel("a", options)).toBe(0);
      expect(__testing.resolveOptionIndexByLabel("d", options)).toBe(3);
      expect(__testing.resolveOptionIndexByLabel("f", options)).toBe(-1);
    });
  });

  describe("extractCorrectOptionIndices", () => {
    it("matches answer by option text for single choice", () => {
      const idx = __testing.extractCorrectOptionIndices(
        "SINGLE_CHOICE" as any,
        ["Apple", "Banana", "Cherry"],
        "banana",
      );
      expect(idx).toEqual([1]);
    });

    it("supports multi choice with pipe-separated answer tokens", () => {
      const idx = __testing.extractCorrectOptionIndices(
        "MULTI_CHOICE" as any,
        ["A", "B", "C"],
        "A|C",
      );
      expect(idx.sort()).toEqual([0, 2]);
    });
  });
});

