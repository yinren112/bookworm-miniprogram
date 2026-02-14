// src/tests/importService.test.ts
// 课程包导入服务单元测试

import { describe, it, expect } from "vitest";
import { QuestionType } from "@prisma/client";
import {
  parseManifest,
  parseUnits,
  parseCardsTsv,
  parseQuestionsGift,
  parseCheatsheets,
  validateCoursePackage,
  validateCoursePackageSchema,
  CoursePackage,
} from "../services/study/importService";

describe("importService parsers", () => {
  // ============================================
  // parseManifest 测试
  // ============================================
  describe("parseManifest", () => {
    it("should parse valid manifest.json", () => {
      const content = JSON.stringify({
        courseKey: "MA101",
        title: "高等数学（上）",
        description: "大一必修课程",
        contentVersion: 2,
        locale: "zh-CN",
      });

      const result = parseManifest(content);

      expect(result.courseKey).toBe("MA101");
      expect(result.title).toBe("高等数学（上）");
      expect(result.description).toBe("大一必修课程");
      expect(result.contentVersion).toBe(2);
      expect(result.locale).toBe("zh-CN");
    });

    it("should use default locale if not provided", () => {
      const content = JSON.stringify({
        courseKey: "CS101",
        title: "计算机导论",
        contentVersion: 1,
      });

      const result = parseManifest(content);

      expect(result.locale).toBe("zh-CN");
    });

    it("should throw error for missing courseKey", () => {
      const content = JSON.stringify({
        title: "测试课程",
        contentVersion: 1,
      });

      expect(() => parseManifest(content)).toThrow("missing or invalid courseKey");
    });

    it("should throw error for invalid contentVersion", () => {
      const content = JSON.stringify({
        courseKey: "TEST",
        title: "测试",
        contentVersion: 0,
      });

      expect(() => parseManifest(content)).toThrow("contentVersion must be a positive integer");
    });

    it("should trim whitespace from values", () => {
      const content = JSON.stringify({
        courseKey: "  MA101  ",
        title: "  高等数学  ",
        contentVersion: 1,
      });

      const result = parseManifest(content);

      expect(result.courseKey).toBe("MA101");
      expect(result.title).toBe("高等数学");
    });
  });

  // ============================================
  // parseUnits 测试
  // ============================================
  describe("parseUnits", () => {
    it("should parse valid units.json", () => {
      const content = JSON.stringify([
        { unitKey: "limit", title: "极限", orderIndex: 1 },
        { unitKey: "derivative", title: "导数", orderIndex: 2 },
        { unitKey: "integral", title: "积分", orderIndex: 3 },
      ]);

      const result = parseUnits(content);

      expect(result).toHaveLength(3);
      expect(result[0].unitKey).toBe("limit");
      expect(result[0].title).toBe("极限");
      expect(result[0].orderIndex).toBe(1);
    });

    it("should auto-assign orderIndex if not provided", () => {
      const content = JSON.stringify([
        { unitKey: "a", title: "A" },
        { unitKey: "b", title: "B" },
      ]);

      const result = parseUnits(content);

      expect(result[0].orderIndex).toBe(1);
      expect(result[1].orderIndex).toBe(2);
    });

    it("should throw error for non-array input", () => {
      const content = JSON.stringify({ unitKey: "test" });

      expect(() => parseUnits(content)).toThrow("must be an array");
    });

    it("should throw error for missing unitKey", () => {
      const content = JSON.stringify([{ title: "测试" }]);

      expect(() => parseUnits(content)).toThrow("missing or invalid unitKey");
    });
  });

  // ============================================
  // parseCardsTsv 测试
  // ============================================
  describe("parseCardsTsv", () => {
    it("should parse valid TSV content", () => {
      const content = `contentId\tfront\tback\ttags\tdifficulty
card-001\t极限的定义是什么？\tε-δ语言：...\t定义,基础\t1
card-002\t洛必达法则适用条件？\t0/0型或∞/∞型\t法则,技巧\t2`;

      const result = parseCardsTsv(content, "limit");

      expect(result).toHaveLength(2);
      expect(result[0].contentId).toBe("card-001");
      expect(result[0].front).toBe("极限的定义是什么？");
      expect(result[0].back).toBe("ε-δ语言：...");
      expect(result[0].tags).toBe("定义,基础");
      expect(result[0].difficulty).toBe(1);
    });

    it("should handle missing optional columns", () => {
      const content = `contentId\tfront\tback
card-001\t问题\t答案`;

      const result = parseCardsTsv(content, "test");

      expect(result).toHaveLength(1);
      expect(result[0].tags).toBeUndefined();
      expect(result[0].difficulty).toBeUndefined();
    });

    it("should skip empty lines", () => {
      const content = `contentId\tfront\tback
card-001\t问题1\t答案1

card-002\t问题2\t答案2`;

      const result = parseCardsTsv(content, "test");

      expect(result).toHaveLength(2);
    });

    it("should return empty array for header-only file", () => {
      const content = `contentId\tfront\tback`;

      const result = parseCardsTsv(content, "test");

      expect(result).toHaveLength(0);
    });

    it("should throw error for missing required columns", () => {
      const content = `contentId\tfront
card-001\t问题`;

      expect(() => parseCardsTsv(content, "test")).toThrow("missing required columns");
    });

    it("should throw error for missing values in row", () => {
      const content = `contentId\tfront\tback
card-001\t\t答案`;

      expect(() => parseCardsTsv(content, "test")).toThrow("missing contentId, front, or back");
    });

    it("should handle case-insensitive headers", () => {
      const content = `ContentId\tFRONT\tBack\tTAGS\tDifficulty
card-001\t问题\t答案\t标签\t3`;

      const result = parseCardsTsv(content, "test");

      expect(result).toHaveLength(1);
      expect(result[0].contentId).toBe("card-001");
      expect(result[0].tags).toBe("标签");
      expect(result[0].difficulty).toBe(3);
    });
  });

  // ============================================
  // parseQuestionsGift 测试
  // ============================================
  describe("parseQuestionsGift", () => {
    it("should parse single choice question", () => {
      const content = `::Q001:: 极限存在的充要条件是什么？ {
=左右极限存在且相等
~只需左极限存在
~只需右极限存在
~极限等于函数值
}`;

      const result = parseQuestionsGift(content, "limit");

      expect(result).toHaveLength(1);
      expect(result[0].contentId).toBe("Q001");
      expect(result[0].questionType).toBe(QuestionType.SINGLE_CHOICE);
      expect(result[0].stem).toBe("极限存在的充要条件是什么？");
      expect(result[0].options).toHaveLength(4);
      expect(result[0].answer).toBe("左右极限存在且相等");
    });

    it("should parse multi choice question", () => {
      const content = `::Q002:: 下列哪些是无穷大量？ {
=1/x (x→0)
=tanx (x→π/2)
~sinx
~cosx
}`;

      const result = parseQuestionsGift(content, "limit");

      expect(result).toHaveLength(1);
      expect(result[0].questionType).toBe(QuestionType.MULTI_CHOICE);
      expect(result[0].answer).toBe("1/x (x→0)|tanx (x→π/2)");
    });

    it("should parse TRUE_FALSE question with TRUE", () => {
      const content = `::Q003:: 连续函数在闭区间上一定有最值。 {TRUE}`;

      const result = parseQuestionsGift(content, "limit");

      expect(result).toHaveLength(1);
      expect(result[0].questionType).toBe(QuestionType.TRUE_FALSE);
      expect(result[0].answer).toBe("TRUE");
    });

    it("should parse TRUE_FALSE question with FALSE", () => {
      const content = `::Q004:: 可导函数一定连续。 {FALSE}`;

      const result = parseQuestionsGift(content, "limit");

      expect(result).toHaveLength(1);
      expect(result[0].questionType).toBe(QuestionType.TRUE_FALSE);
      expect(result[0].answer).toBe("FALSE");
    });

    it("should parse TRUE_FALSE with short form T/F", () => {
      const content = `::Q005:: 极限存在的函数一定连续。 {F}
::Q006:: 连续函数一定可积。 {T}`;

      const result = parseQuestionsGift(content, "limit");

      expect(result).toHaveLength(2);
      expect(result[0].answer).toBe("FALSE");
      expect(result[1].answer).toBe("TRUE");
    });

    it("should parse FILL_BLANK question", () => {
      const content = `::Q007:: lim(x→0) sin(x)/x = {=1}`;

      const result = parseQuestionsGift(content, "limit");

      expect(result).toHaveLength(1);
      expect(result[0].questionType).toBe(QuestionType.FILL_BLANK);
      expect(result[0].stem).toBe("lim(x→0) sin(x)/x =");
      expect(result[0].answer).toBe("1");
    });

    it("should parse FILL_BLANK with multiple answers", () => {
      const content = `::Q008:: e的值约等于 {=2.718|2.72}`;

      const result = parseQuestionsGift(content, "limit");

      expect(result).toHaveLength(1);
      expect(result[0].questionType).toBe(QuestionType.FILL_BLANK);
      expect(result[0].answer).toBe("2.718|2.72");
    });

    it("should parse question when stem contains LaTeX braces", () => {
      const content = `::Q009:: 设 $f(x)=x^{2}$，求 $\\lim_{x\\to 0}\\frac{\\sin x}{x}$ 的值 {=1}`;

      const result = parseQuestionsGift(content, "limit");

      expect(result).toHaveLength(1);
      expect(result[0].questionType).toBe(QuestionType.FILL_BLANK);
      expect(result[0].stem).toContain("x^{2}");
      expect(result[0].stem).toContain("\\lim_{x\\to 0}");
      expect(result[0].answer).toBe("1");
    });

    it("should parse multiple questions", () => {
      const content = `::Q001:: 问题1 {TRUE}
::Q002:: 问题2 {
=正确
~错误
}
::Q003:: 填空 {=答案}`;

      const result = parseQuestionsGift(content, "test");

      expect(result).toHaveLength(3);
    });

    it("should ignore comment lines", () => {
      const content = `// 这是注释
::Q001:: 问题 {TRUE}
// 另一个注释`;

      const result = parseQuestionsGift(content, "test");

      expect(result).toHaveLength(1);
    });

    it("should throw error for question with no correct answer", () => {
      const content = `::Q001:: 问题 {
~选项A
~选项B
}`;

      expect(() => parseQuestionsGift(content, "test")).toThrow("has no correct answer");
    });

    it("should handle single option with correct answer as fill-blank", () => {
      // 只有一个 = 选项（无 ~ 选项）会被解析为填空题
      const content = `::Q001:: 问题 {=唯一答案}`;

      const result = parseQuestionsGift(content, "test");

      expect(result).toHaveLength(1);
      expect(result[0].questionType).toBe(QuestionType.FILL_BLANK);
      expect(result[0].answer).toBe("唯一答案");
    });
  });

  // ============================================
  // parseCheatsheets 测试
  // ============================================
  describe("parseCheatsheets", () => {
    it("should parse valid cheatsheets.json", () => {
      const content = JSON.stringify([
        {
          title: "极限公式汇总",
          assetType: "pdf",
          url: "https://example.com/limit.pdf",
          unitKey: "limit",
        },
        {
          title: "导数口诀图",
          assetType: "image",
          url: "https://example.com/derivative.png",
        },
      ]);

      const result = parseCheatsheets(content);

      expect(result).toHaveLength(2);
      expect(result[0].title).toBe("极限公式汇总");
      expect(result[0].assetType).toBe("pdf");
      expect(result[0].unitKey).toBe("limit");
      expect(result[1].assetType).toBe("image");
      expect(result[1].unitKey).toBeUndefined();
    });

    it("should use default version if not provided", () => {
      const content = JSON.stringify([
        {
          title: "测试",
          assetType: "pdf",
          url: "https://example.com/test.pdf",
        },
      ]);

      const result = parseCheatsheets(content);

      expect(result[0].version).toBe(1);
    });

    it("should throw error for invalid assetType", () => {
      const content = JSON.stringify([
        {
          title: "测试",
          assetType: "video",
          url: "https://example.com/test.mp4",
        },
      ]);

      expect(() => parseCheatsheets(content)).toThrow('assetType must be "pdf", "image" or "note"');
    });

    it("should throw error for missing url", () => {
      const content = JSON.stringify([
        {
          title: "测试",
          assetType: "pdf",
        },
      ]);

      expect(() => parseCheatsheets(content)).toThrow("missing or invalid url");
    });

    it("should parse note cheatsheet with default markdown format", () => {
      const content = JSON.stringify([
        {
          title: "必背考点",
          assetType: "note",
          content: "# 标题\n\n- 要点1\n- 要点2\n",
          unitKey: "limit",
        },
      ]);

      const result = parseCheatsheets(content);
      expect(result).toHaveLength(1);
      expect(result[0].assetType).toBe("note");
      expect(result[0].contentFormat).toBe("markdown");
      expect(result[0].url).toBeUndefined();
    });

    it("should normalize literal escaped newlines in note content", () => {
      const content = JSON.stringify([
        {
          title: "必背考点",
          assetType: "note",
          content: "# 标题\\n\\n- 要点1\\n- 要点2\\n",
        },
      ]);
      const result = parseCheatsheets(content);
      expect(result[0].content).toContain("\n");
      expect(result[0].content).not.toContain("\\n");
    });

    it("should throw error for note without content", () => {
      const content = JSON.stringify([
        {
          title: "必背考点",
          assetType: "note",
        },
      ]);

      expect(() => parseCheatsheets(content)).toThrow("missing or invalid content");
    });
  });
});

// ============================================
// validateCoursePackage 测试 (Dry-run 验证)
// ============================================
describe("validateCoursePackage", () => {
  const createValidPackage = (): CoursePackage => ({
    manifest: {
      courseKey: "TEST",
      title: "Test Course",
      contentVersion: 1,
    },
    units: [{ unitKey: "u1", title: "Unit 1", orderIndex: 1 }],
    cards: new Map([
      [
        "u1",
        [{ contentId: "C001", front: "Question", back: "Answer" }],
      ],
    ]),
    questions: new Map([
      [
        "u1",
        [
          {
            contentId: "Q001",
            questionType: QuestionType.SINGLE_CHOICE,
            stem: "Test question?",
            options: ["A. Option 1", "B. Option 2"],
            answer: "a",
          },
        ],
      ],
    ]),
    cheatsheets: [],
  });

  it("should pass validation for valid package", () => {
    const pkg = createValidPackage();
    const schemaErrors = validateCoursePackageSchema(pkg);
    const ruleErrors = validateCoursePackage(pkg);
    expect([...schemaErrors, ...ruleErrors]).toHaveLength(0);
  });

  it("should detect undefined unitKey in cards", () => {
    const pkg = createValidPackage();
    pkg.cards.set("undefined_unit", [
      { contentId: "C002", front: "Q", back: "A" },
    ]);

    const errors = validateCoursePackage(pkg);

    expect(errors.some((e) => e.includes("Unit not defined"))).toBe(true);
  });

  it("should detect missing contentId in card", () => {
    const pkg = createValidPackage();
    pkg.cards.set("u1", [
      { contentId: "", front: "Q", back: "A" },
    ]);

    const errors = validateCoursePackageSchema(pkg);

    expect(errors.some((e) => e.includes("schema:cards/u1/0/contentId"))).toBe(true);
  });

  it("should detect missing front in card", () => {
    const pkg = createValidPackage();
    pkg.cards.set("u1", [
      { contentId: "C001", front: "", back: "A" },
    ]);

    const errors = validateCoursePackageSchema(pkg);

    expect(errors.some((e) => e.includes("schema:cards/u1/0/front"))).toBe(true);
  });

  it("should detect unbalanced LaTeX delimiters", () => {
    const pkg = createValidPackage();
    pkg.cards.set("u1", [
      { contentId: "C001", front: "$$ x^2", back: "A" }, // 未闭合的 $$
    ]);

    const errors = validateCoursePackage(pkg);

    expect(errors.some((e) => e.includes("Unbalanced LaTeX"))).toBe(true);
  });

  it("should pass balanced LaTeX delimiters", () => {
    const pkg = createValidPackage();
    pkg.cards.set("u1", [
      { contentId: "C001", front: "$$ x^2 $$", back: "$$ y^2 $$" },
    ]);

    const errors = validateCoursePackage(pkg);

    expect(errors.filter((e) => e.includes("LaTeX"))).toHaveLength(0);
  });

  it("should detect choice question with less than 2 options", () => {
    const pkg = createValidPackage();
    pkg.questions.set("u1", [
      {
        contentId: "Q001",
        questionType: QuestionType.SINGLE_CHOICE,
        stem: "Question?",
        options: ["A. Only one option"],
        answer: "a",
      },
    ]);

    const errors = validateCoursePackage(pkg);

    expect(errors.some((e) => e.includes("at least 2 options"))).toBe(true);
  });

  it("should detect multi-choice with single answer", () => {
    const pkg = createValidPackage();
    pkg.questions.set("u1", [
      {
        contentId: "Q001",
        questionType: QuestionType.MULTI_CHOICE,
        stem: "Question?",
        options: ["A", "B", "C"],
        answer: "a", // 单个答案，不符合多选格式
      },
    ]);

    const errors = validateCoursePackage(pkg);

    expect(errors.some((e) => e.includes("Multi-choice"))).toBe(true);
  });

  it("should pass multi-choice with pipe-separated answers", () => {
    const pkg = createValidPackage();
    pkg.questions.set("u1", [
      {
        contentId: "Q001",
        questionType: QuestionType.MULTI_CHOICE,
        stem: "Question?",
        options: ["A", "B", "C"],
        answer: "a|b",
      },
    ]);

    const errors = validateCoursePackage(pkg);

    expect(errors.filter((e) => e.includes("Multi-choice"))).toHaveLength(0);
  });

  it("should pass multi-choice with JSON array answers", () => {
    const pkg = createValidPackage();
    pkg.questions.set("u1", [
      {
        contentId: "Q001",
        questionType: QuestionType.MULTI_CHOICE,
        stem: "Question?",
        options: ["A", "B", "C"],
        answer: '["a", "b"]',
      },
    ]);

    const errors = validateCoursePackage(pkg);

    expect(errors.filter((e) => e.includes("Multi-choice"))).toHaveLength(0);
  });

  it("should detect missing stem in question", () => {
    const pkg = createValidPackage();
    pkg.questions.set("u1", [
      {
        contentId: "Q001",
        questionType: QuestionType.TRUE_FALSE,
        stem: "",
        answer: "TRUE",
      },
    ]);

    const errors = validateCoursePackageSchema(pkg);

    expect(errors.some((e) => e.includes("schema:questions/u1/0/stem"))).toBe(true);
  });
});
