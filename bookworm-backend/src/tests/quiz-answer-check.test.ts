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

  it("accepts numeric chosen answer index for single choice", () => {
    const ok = __testing.checkAnswer(
      "SINGLE_CHOICE",
      "A",
      "0",
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

  it("accepts numeric chosen indices for multi choice", () => {
    const ok = __testing.checkAnswer(
      "MULTI_CHOICE",
      "A,C",
      "0|2",
      ["foo", "bar", "baz"],
    );
    expect(ok).toBe(true);
  });

  it("accepts exp(x) as equivalent of e^x for fill blank", () => {
    const ok = __testing.checkAnswer(
      "FILL_BLANK",
      "e^x",
      "exp(x)",
    );
    expect(ok).toBe(true);
  });

  it("accepts LaTeX fraction as equivalent of plain fraction for fill blank", () => {
    const ok = __testing.checkAnswer(
      "FILL_BLANK",
      "\\frac{1}{2}",
      "(1)/(2)",
    );
    expect(ok).toBe(true);
  });

  it("accepts expression with math delimiters for fill blank", () => {
    const ok = __testing.checkAnswer(
      "FILL_BLANK",
      "$e^{-1/3}$",
      "exp(-1/3)",
    );
    expect(ok).toBe(true);
  });
});
