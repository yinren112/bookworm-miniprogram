import { describe, it, expect } from "vitest";
import { __testing } from "../services/study/quizService";

describe("Quiz answer checking compatibility", () => {
  it("accepts direct text match for single choice", () => {
    const ok = __testing.checkAnswer(
      "SINGLE_CHOICE",
      "Paris",
      "paris",
      ["Paris", "London"],
    );
    expect(ok).toBe(true);
  });

  it("accepts label-based correct answer (A) against chosen option text", () => {
    const ok = __testing.checkAnswer(
      "SINGLE_CHOICE",
      "A",
      "foo",
      ["foo", "bar"],
    );
    expect(ok).toBe(true);
  });

  it("accepts numeric correct answer (0) against chosen option text", () => {
    const ok = __testing.checkAnswer(
      "SINGLE_CHOICE",
      "0",
      "foo",
      ["foo", "bar"],
    );
    expect(ok).toBe(true);
  });

  it("accepts Chinese true/false aliases with TRUE/FALSE options", () => {
    const ok = __testing.checkAnswer(
      "TRUE_FALSE",
      "正确",
      "TRUE",
      ["TRUE", "FALSE"],
    );
    expect(ok).toBe(true);
  });

  it("accepts multi choice with comma-separated labels", () => {
    const ok = __testing.checkAnswer(
      "MULTI_CHOICE",
      "A,C",
      "foo|baz",
      ["foo", "bar", "baz"],
    );
    expect(ok).toBe(true);
  });

  it("rejects wrong multi choice selection", () => {
    const ok = __testing.checkAnswer(
      "MULTI_CHOICE",
      "A,C",
      "foo|bar",
      ["foo", "bar", "baz"],
    );
    expect(ok).toBe(false);
  });
});

