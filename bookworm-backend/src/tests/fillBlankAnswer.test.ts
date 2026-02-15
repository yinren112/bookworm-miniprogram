import { describe, expect, it } from "vitest";
import {
  collectFillBlankInputIssues,
  normalizeFillBlankAnswerToken,
  getFillBlankComparableTokens,
  extractLegacyChoiceOptionsFromFillBlank,
} from "../services/study/fillBlankAnswer";

describe("fillBlankAnswer", () => {
  it("normalizes latex exp notation", () => {
    expect(normalizeFillBlankAnswerToken("$e^{x}$")).toBe("exp(x)");
  });

  it("builds comparable tokens for exp and e^ forms", () => {
    const tokens = getFillBlankComparableTokens("exp(x)");
    expect(tokens.has("exp(x)")).toBe(true);
    expect(tokens.has("e^x")).toBe(true);
  });

  it("flags hard-to-input fill answer when no easy alias", () => {
    const issues = collectFillBlankInputIssues("\\frac{1}{2}");
    expect(issues.some((issue) => issue.code === "LATEX_COMMAND")).toBe(true);
  });

  it("does not flag when easy alias exists", () => {
    const issues = collectFillBlankInputIssues("e^x|exp(x)");
    expect(issues).toHaveLength(0);
  });

  it("flags possible misclassified choice answer block", () => {
    const issues = collectFillBlankInputIssues("=A\n=B\n=C");
    expect(issues.some((issue) => issue.code === "POSSIBLE_MISCLASSIFIED_CHOICE")).toBe(true);
  });

  it("flags possible misclassified block when first line has lost '='", () => {
    const issues = collectFillBlankInputIssues("A\n=B\n=C");
    expect(issues.some((issue) => issue.code === "POSSIBLE_MISCLASSIFIED_CHOICE")).toBe(true);
  });

  it("extracts legacy multi-choice options from fill-blank answer", () => {
    expect(extractLegacyChoiceOptionsFromFillBlank("A\n=B\n=C")).toEqual(["A", "B", "C"]);
    expect(extractLegacyChoiceOptionsFromFillBlank("=A\n=B\n=C")).toEqual(["A", "B", "C"]);
  });

  it("flags placeholder answer", () => {
    const issues = collectFillBlankInputIssues("答案占位符");
    expect(issues.some((issue) => issue.code === "PLACEHOLDER_ANSWER")).toBe(true);
  });
});
