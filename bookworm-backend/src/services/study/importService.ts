// src/services/study/importService.ts
// 课程包导入服务

import { Prisma, PrismaClient, QuestionType, CourseStatus } from "@prisma/client";
import crypto from "crypto";
import { Value } from "@sinclair/typebox/value";
import {
  courseIdStatusView,
  courseIdVersionView,
  courseKeyOnlyView,
  courseVersionView,
  unitIdOnlyView,
  cardIdOnlyView,
  questionIdOnlyView,
  cheatsheetIdView,
} from "../../db/views";
import { ImportCourseBodySchema } from "../../routes/studySchemas";
import { updateCourseTotals, archiveOtherPublishedCourses } from "./courseService";

type DbCtx = PrismaClient | Prisma.TransactionClient;

// ============================================
// 类型定义
// ============================================

export interface CourseManifest {
  courseKey: string;
  title: string;
  description?: string;
  contentVersion: number;
  locale?: string;
}

export interface UnitDefinition {
  unitKey: string;
  title: string;
  orderIndex: number;
}

export interface CardDefinition {
  contentId: string;
  front: string;
  back: string;
  tags?: string;
  difficulty?: number;
}

export interface QuestionDefinition {
  contentId: string;
  questionType: QuestionType;
  stem: string;
  options?: string[];
  answer: string;
  explanation?: string;
  difficulty?: number;
}

export interface CheatSheetDefinition {
  title: string;
  assetType: "pdf" | "image" | "note";
  url?: string;
  content?: string;
  contentFormat?: "markdown";
  unitKey?: string;
  version?: number;
}

export interface ImportOptions {
  dryRun?: boolean;
  overwriteContent?: boolean;
  publishOnImport?: boolean;
}

export interface ImportResult {
  success: boolean;
  courseId: number | null;
  stats: {
    unitsCreated: number;
    unitsUpdated: number;
    cardsCreated: number;
    cardsUpdated: number;
    questionsCreated: number;
    questionsUpdated: number;
    cheatsheetsCreated: number;
  };
  errors: string[];
  warnings: string[];
}

export interface CoursePackage {
  manifest: CourseManifest;
  units: UnitDefinition[];
  cards: Map<string, CardDefinition[]>; // unitKey -> cards
  questions: Map<string, QuestionDefinition[]>; // unitKey -> questions
  cheatsheets: CheatSheetDefinition[];
}

// ============================================
// 解析器：manifest.json
// ============================================

export function parseManifest(content: string): CourseManifest {
  const data = JSON.parse(content);

  if (!data.courseKey || typeof data.courseKey !== "string") {
    throw new Error("manifest.json: missing or invalid courseKey");
  }
  if (!data.title || typeof data.title !== "string") {
    throw new Error("manifest.json: missing or invalid title");
  }
  if (typeof data.contentVersion !== "number" || data.contentVersion < 1) {
    throw new Error("manifest.json: contentVersion must be a positive integer");
  }

  return {
    courseKey: data.courseKey.trim(),
    title: data.title.trim(),
    description: data.description?.trim() || undefined,
    contentVersion: Math.floor(data.contentVersion),
    locale: data.locale || "zh-CN",
  };
}

// ============================================
// 解析器：units.json
// ============================================

export function parseUnits(content: string): UnitDefinition[] {
  const data = JSON.parse(content);

  if (!Array.isArray(data)) {
    throw new Error("units.json: must be an array");
  }

  return data.map((item, index) => {
    if (!item.unitKey || typeof item.unitKey !== "string") {
      throw new Error(`units.json[${index}]: missing or invalid unitKey`);
    }
    if (!item.title || typeof item.title !== "string") {
      throw new Error(`units.json[${index}]: missing or invalid title`);
    }

    return {
      unitKey: item.unitKey.trim(),
      title: item.title.trim(),
      orderIndex: typeof item.orderIndex === "number" ? item.orderIndex : index + 1,
    };
  });
}

// ============================================
// 解析器：TSV 格式卡片
// ============================================

export function parseCardsTsv(content: string, unitKey: string): CardDefinition[] {
  const lines = content.trim().split(/\r?\n/);
  if (lines.length < 2) {
    return []; // 只有表头或空文件
  }

  // 解析表头
  const headerLine = lines[0];
  const headers = headerLine.split("\t").map((h) => h.trim().toLowerCase());

  const contentIdIdx = headers.indexOf("contentid");
  const frontIdx = headers.indexOf("front");
  const backIdx = headers.indexOf("back");
  const tagsIdx = headers.indexOf("tags");
  const difficultyIdx = headers.indexOf("difficulty");

  if (contentIdIdx === -1 || frontIdx === -1 || backIdx === -1) {
    throw new Error(
      `cards/${unitKey}.tsv: missing required columns (contentId, front, back)`
    );
  }

  const cards: CardDefinition[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // 跳过空行

    const fields = line.split("\t");
    const contentId = fields[contentIdIdx]?.trim();
    const front = fields[frontIdx]?.trim();
    const back = fields[backIdx]?.trim();

    if (!contentId || !front || !back) {
      throw new Error(
        `cards/${unitKey}.tsv line ${i + 1}: missing contentId, front, or back`
      );
    }

    const card: CardDefinition = {
      contentId,
      front,
      back,
    };

    if (tagsIdx !== -1 && fields[tagsIdx]) {
      card.tags = fields[tagsIdx].trim();
    }

    if (difficultyIdx !== -1 && fields[difficultyIdx]) {
      const diff = parseInt(fields[difficultyIdx], 10);
      if (!isNaN(diff) && diff >= 1 && diff <= 5) {
        card.difficulty = diff;
      }
    }

    cards.push(card);
  }

  return cards;
}

// ============================================
// 解析器：GIFT 格式题目（简化子集）
// ============================================

/**
 * 支持的 GIFT 格式子集:
 *
 * 单选题:
 * ::Q001:: 问题内容 {
 *   =正确答案
 *   ~错误答案A
 *   ~错误答案B
 *   ~错误答案C
 * }
 *
 * 判断题:
 * ::Q002:: 判断题内容 {TRUE}
 * ::Q002:: 判断题内容 {FALSE}
 * ::Q002:: 判断题内容 {T}
 * ::Q002:: 判断题内容 {F}
 *
 * 填空题:
 * ::Q003:: 问题内容 {=答案}
 * ::Q003:: 问题内容 {=答案1|答案2}  (多个可接受答案)
 */

export function parseQuestionsGift(content: string, unitKey: string): QuestionDefinition[] {
  const questions: QuestionDefinition[] = [];

  // 预处理：移除注释行和空行，规范化换行
  const cleanContent = content
    .split(/\r?\n/)
    .filter(line => !line.trim().startsWith("//"))
    .join("\n");

  // 匹配题目模式: ::ID:: 题干 { 答案区域 }
  // 使用非贪婪匹配和多行模式
  const questionPattern = /::(\S+)::\s*([\s\S]*?)\s*\{([\s\S]*?)\}/g;

  let match;

  while ((match = questionPattern.exec(cleanContent)) !== null) {
    const contentId = match[1].trim();
    const stem = match[2].trim();
    const answerBlock = match[3].trim();

    if (!contentId || !stem) {
      throw new Error(`questions/${unitKey}.gift: invalid question format at "${match[0].substring(0, 50)}..."`);
    }

    // 判断题目类型
    const upperAnswer = answerBlock.toUpperCase();

    // 判断题: {TRUE}, {FALSE}, {T}, {F}
    if (upperAnswer === "TRUE" || upperAnswer === "T") {
      questions.push({
        contentId,
        questionType: QuestionType.TRUE_FALSE,
        stem,
        options: ["TRUE", "FALSE"],
        answer: "TRUE",
      });
      continue;
    }

    if (upperAnswer === "FALSE" || upperAnswer === "F") {
      questions.push({
        contentId,
        questionType: QuestionType.TRUE_FALSE,
        stem,
        options: ["TRUE", "FALSE"],
        answer: "FALSE",
      });
      continue;
    }

    // 填空题: {=答案} 或 {=答案1|答案2}
    // 特征: 只有一个 = 开头的答案，没有 ~ 选项
    if (answerBlock.startsWith("=") && !answerBlock.includes("\n~") && !answerBlock.includes("~")) {
      const fillAnswer = answerBlock.substring(1).trim();
      questions.push({
        contentId,
        questionType: QuestionType.FILL_BLANK,
        stem,
        answer: fillAnswer,
      });
      continue;
    }

    // 选择题: 包含 = 和 ~ 开头的选项
    const optionLines = answerBlock.split(/\r?\n/).map(l => l.trim()).filter(l => l);
    const options: string[] = [];
    const correctAnswers: string[] = [];

    for (const optionLine of optionLines) {
      if (optionLine.startsWith("=")) {
        const optionText = optionLine.substring(1).trim();
        options.push(optionText);
        correctAnswers.push(optionText);
      } else if (optionLine.startsWith("~")) {
        const optionText = optionLine.substring(1).trim();
        options.push(optionText);
      }
    }

    if (options.length < 2) {
      throw new Error(`questions/${unitKey}.gift: question ${contentId} must have at least 2 options`);
    }

    if (correctAnswers.length === 0) {
      throw new Error(`questions/${unitKey}.gift: question ${contentId} has no correct answer (use = prefix)`);
    }

    // 单选 vs 多选
    if (correctAnswers.length === 1) {
      questions.push({
        contentId,
        questionType: QuestionType.SINGLE_CHOICE,
        stem,
        options,
        answer: correctAnswers[0],
      });
    } else {
      questions.push({
        contentId,
        questionType: QuestionType.MULTI_CHOICE,
        stem,
        options,
        answer: correctAnswers.join("|"),
      });
    }
  }

  return questions;
}

// ============================================
// 解析器：急救包配置
// ============================================

function normalizeEscapedWhitespace(text: string): string {
  return text.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\t/g, "\t");
}

function buildCheatsheetStableKey(
  courseId: number,
  unitId: number | null,
  cheatsheet: CheatSheetDefinition,
): string {
  const unitPart = unitId ?? 0;
  const version = cheatsheet.version || 1;
  const source = `${courseId}:${unitPart}:${cheatsheet.assetType}:${cheatsheet.title}:${version}`;
  return crypto.createHash("md5").update(source).digest("hex");
}

export function parseCheatsheets(content: string): CheatSheetDefinition[] {
  const data = JSON.parse(content);

  if (!Array.isArray(data)) {
    throw new Error("cheatsheets.json: must be an array");
  }

  return data.map((item, index) => {
    if (!item.title || typeof item.title !== "string") {
      throw new Error(`cheatsheets.json[${index}]: missing or invalid title`);
    }
    const assetType = String(item.assetType || "").toLowerCase();
    if (!assetType || !["pdf", "image", "note"].includes(assetType)) {
      throw new Error(`cheatsheets.json[${index}]: assetType must be "pdf", "image" or "note"`);
    }

    if (assetType === "pdf" || assetType === "image") {
      if (!item.url || typeof item.url !== "string") {
        throw new Error(`cheatsheets.json[${index}]: missing or invalid url`);
      }
      return {
        title: item.title.trim(),
        assetType: assetType as "pdf" | "image",
        url: item.url.trim(),
        unitKey: item.unitKey?.trim(),
        version: typeof item.version === "number" ? item.version : 1,
      };
    }

    if (!item.content || typeof item.content !== "string" || !item.content.trim()) {
      throw new Error(`cheatsheets.json[${index}]: missing or invalid content`);
    }

    const contentFormat = item.contentFormat ? String(item.contentFormat).toLowerCase() : "markdown";
    if (!["markdown"].includes(contentFormat)) {
      throw new Error(`cheatsheets.json[${index}]: contentFormat must be "markdown"`);
    }

    return {
      title: item.title.trim(),
      assetType: "note",
      content: normalizeEscapedWhitespace(item.content),
      contentFormat: contentFormat as "markdown",
      unitKey: item.unitKey?.trim(),
      version: typeof item.version === "number" ? item.version : 1,
    };
  });
}

// ============================================
// Dry-run 验证辅助函数
// ============================================

/**
 * 检查文本中的分隔符是否平衡（如 LaTeX 的 $$）
 */
function hasBalancedDelimiters(text: string, delimiter: string): boolean {
  const escaped = delimiter.replace(/\$/g, "\\$");
  const count = (text.match(new RegExp(escaped, "g")) || []).length;
  return count % 2 === 0;
}

function mapToRecord<T>(map: Map<string, T[]>): Record<string, T[]> | undefined {
  if (map.size === 0) return undefined;
  const record: Record<string, T[]> = {};
  for (const [key, value] of map.entries()) {
    record[key] = value;
  }
  return record;
}

function buildImportBody(pkg: CoursePackage) {
  return {
    manifest: pkg.manifest,
    units: pkg.units,
    cards: mapToRecord(pkg.cards),
    questions: mapToRecord(pkg.questions),
    cheatsheets: pkg.cheatsheets.length > 0 ? pkg.cheatsheets : undefined,
  };
}

function formatSchemaError(path: string, message: string) {
  const normalizedPath = path ? path.replace(/^\//, "") : "(root)";
  return `schema:${normalizedPath} ${message}`;
}

/**
 * Dry-run 模式的完整数据验证
 * 返回验证错误列表
 * @exported for testing
 */
export function validateCoursePackage(pkg: CoursePackage): string[] {
  const errors: string[] = [];
  const importBody = buildImportBody(pkg);
  for (const error of Value.Errors(ImportCourseBodySchema, importBody)) {
    errors.push(formatSchemaError(error.path, error.message));
  }

  // 1. 验证 units 定义
  const definedUnits = new Set(pkg.units.map((u) => u.unitKey));

  // 2. 验证卡片数据
  for (const [unitKey, cards] of pkg.cards.entries()) {
    // 2.1 检查 unitKey 引用
    if (!definedUnits.has(unitKey)) {
      errors.push(`cards/${unitKey}: Unit not defined in units list`);
    }

    for (const card of cards) {
      const prefix = `cards/${unitKey}/${card.contentId || "unknown"}`;

      // 2.3 LaTeX 公式平衡检查
      if (card.front && !hasBalancedDelimiters(card.front, "$$")) {
        errors.push(`${prefix}: Unbalanced LaTeX delimiters ($$) in 'front'`);
      }
      if (card.back && !hasBalancedDelimiters(card.back, "$$")) {
        errors.push(`${prefix}: Unbalanced LaTeX delimiters ($$) in 'back'`);
      }
    }
  }

  // 3. 验证题目数据
  for (const [unitKey, questions] of pkg.questions.entries()) {
    // 3.1 检查 unitKey 引用
    if (!definedUnits.has(unitKey)) {
      errors.push(`questions/${unitKey}: Unit not defined in units list`);
    }

    for (const q of questions) {
      const prefix = `questions/${unitKey}/${q.contentId || "unknown"}`;

      // 3.3 选择题选项数量检查
      if (
        (q.questionType === "SINGLE_CHOICE" || q.questionType === "MULTI_CHOICE") &&
        (!q.options || q.options.length < 2)
      ) {
        errors.push(`${prefix}: Choice question must have at least 2 options`);
      }

      // 3.4 多选题答案格式检查
      if (q.questionType === "MULTI_CHOICE") {
        try {
          // 尝试解析 JSON 数组格式
          const parsed = JSON.parse(q.answer);
          if (!Array.isArray(parsed) || parsed.length < 2) {
            errors.push(
              `${prefix}: Multi-choice answer must be a JSON array with at least 2 correct answers`
            );
          }
        } catch {
          // 可能是 | 分隔格式
          const parts = q.answer.split("|");
          if (parts.length < 2) {
            errors.push(
              `${prefix}: Multi-choice answer must have multiple correct answers (JSON array or | separated)`
            );
          }
        }
      }

      // 3.5 LaTeX 检查
      if (q.stem && !hasBalancedDelimiters(q.stem, "$$")) {
        errors.push(`${prefix}: Unbalanced LaTeX delimiters ($$) in 'stem'`);
      }
    }
  }

  return errors;
}

// ============================================
// 导入核心逻辑
// ============================================

export async function importCoursePackage(
  db: DbCtx,
  pkg: CoursePackage,
  options: ImportOptions = {},
): Promise<ImportResult> {
  const { dryRun = false, overwriteContent = false, publishOnImport = false } = options;
  const result: ImportResult = {
    success: false,
    courseId: null,
    stats: {
      unitsCreated: 0,
      unitsUpdated: 0,
      cardsCreated: 0,
      cardsUpdated: 0,
      questionsCreated: 0,
      questionsUpdated: 0,
      cheatsheetsCreated: 0,
    },
    errors: [],
    warnings: [],
  };

  try {
    // 1. 检查是否存在相同 courseKey + contentVersion
    const existingCourse = await db.studyCourse.findFirst({
      where: {
        courseKey: pkg.manifest.courseKey,
        contentVersion: pkg.manifest.contentVersion,
      },
      select: courseIdStatusView,
    });

    if (existingCourse && !overwriteContent) {
      result.warnings.push(
        `Course ${pkg.manifest.courseKey} v${pkg.manifest.contentVersion} already exists (id=${existingCourse.id}). Use overwriteContent=true to update.`
      );
      result.courseId = existingCourse.id;
      result.success = true;
      return result;
    }

    if (dryRun) {
      // 验证模式：完整数据格式校验，不写入
      const validationErrors = validateCoursePackage(pkg);

      if (validationErrors.length > 0) {
        result.errors.push(...validationErrors);
        result.warnings.push("Dry run mode: validation failed, no changes will be made");
        result.success = false;
        return result;
      }

      result.warnings.push("Dry run mode: validation passed, no changes will be made");
      result.success = true;
      return result;
    }

    // 2. 创建或更新课程
    let courseId: number;

    if (existingCourse) {
      // 更新现有课程
      await db.studyCourse.update({
        where: { id: existingCourse.id },
        data: {
          title: pkg.manifest.title,
          description: pkg.manifest.description,
          locale: pkg.manifest.locale,
          status: publishOnImport ? CourseStatus.PUBLISHED : existingCourse.status,
        },
      });
      courseId = existingCourse.id;
    } else {
      // 检查是否存在相同 courseKey 的其他版本
      const existingAnyVersion = await db.studyCourse.findFirst({
        where: { courseKey: pkg.manifest.courseKey },
        select: courseIdVersionView,
        orderBy: { contentVersion: "desc" },
      });

      if (existingAnyVersion && existingAnyVersion.contentVersion >= pkg.manifest.contentVersion) {
        result.warnings.push(
          `Existing version ${existingAnyVersion.contentVersion} >= import version ${pkg.manifest.contentVersion}`
        );
      }

      // 创建新课程
      const newCourse = await db.studyCourse.create({
        data: {
          courseKey: pkg.manifest.courseKey,
          title: pkg.manifest.title,
          description: pkg.manifest.description,
          contentVersion: pkg.manifest.contentVersion,
          locale: pkg.manifest.locale || "zh-CN",
          status: publishOnImport ? CourseStatus.PUBLISHED : CourseStatus.DRAFT,
        },
      });
      courseId = newCourse.id;
    }

    result.courseId = courseId;

    // 3. 导入章节
    const unitIdMap = new Map<string, number>(); // unitKey -> unitId

    for (const unitDef of pkg.units) {
      const existingUnit = await db.studyUnit.findFirst({
        where: { courseId, unitKey: unitDef.unitKey },
        select: unitIdOnlyView,
      });

      if (existingUnit) {
        await db.studyUnit.update({
          where: { id: existingUnit.id },
          data: {
            title: unitDef.title,
            orderIndex: unitDef.orderIndex,
          },
        });
        unitIdMap.set(unitDef.unitKey, existingUnit.id);
        result.stats.unitsUpdated++;
      } else {
        const newUnit = await db.studyUnit.create({
          data: {
            courseId,
            unitKey: unitDef.unitKey,
            title: unitDef.title,
            orderIndex: unitDef.orderIndex,
          },
        });
        unitIdMap.set(unitDef.unitKey, newUnit.id);
        result.stats.unitsCreated++;
      }
    }

    // 4. 导入卡片
    for (const [unitKey, cards] of pkg.cards.entries()) {
      const unitId = unitIdMap.get(unitKey);
      if (!unitId) {
        result.warnings.push(`Skipping cards for unknown unit: ${unitKey}`);
        continue;
      }

      for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        const existingCard = await db.studyCard.findFirst({
          where: { unitId, contentId: card.contentId },
          select: cardIdOnlyView,
        });

        if (existingCard) {
          await db.studyCard.update({
            where: { id: existingCard.id },
            data: {
              front: card.front,
              back: card.back,
              tags: card.tags,
              difficulty: card.difficulty || 1,
              sortOrder: i,
            },
          });
          result.stats.cardsUpdated++;
        } else {
          await db.studyCard.create({
            data: {
              courseId,
              unitId,
              contentId: card.contentId,
              front: card.front,
              back: card.back,
              tags: card.tags,
              difficulty: card.difficulty || 1,
              sortOrder: i,
            },
          });
          result.stats.cardsCreated++;
        }
      }
    }

    // 5. 导入题目
    for (const [unitKey, questions] of pkg.questions.entries()) {
      const unitId = unitIdMap.get(unitKey);
      if (!unitId) {
        result.warnings.push(`Skipping questions for unknown unit: ${unitKey}`);
        continue;
      }

      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const existingQuestion = await db.studyQuestion.findFirst({
          where: { unitId, contentId: q.contentId },
          select: questionIdOnlyView,
        });

        if (existingQuestion) {
          await db.studyQuestion.update({
            where: { id: existingQuestion.id },
            data: {
              questionType: q.questionType,
              stem: q.stem,
              optionsJson: q.options ? q.options : Prisma.JsonNull,
              answerJson: q.answer,
              explanationShort: q.explanation,
              difficulty: q.difficulty || 1,
              sortOrder: i,
            },
          });
          result.stats.questionsUpdated++;
        } else {
          await db.studyQuestion.create({
            data: {
              courseId,
              unitId,
              contentId: q.contentId,
              questionType: q.questionType,
              stem: q.stem,
              optionsJson: q.options ? q.options : Prisma.JsonNull,
              answerJson: q.answer,
              explanationShort: q.explanation,
              difficulty: q.difficulty || 1,
              sortOrder: i,
            },
          });
          result.stats.questionsCreated++;
        }
      }
    }

    // 6. 导入急救包
    let cheatSheetOrder = 0;
    for (const cs of pkg.cheatsheets) {
      let unitId: number | null = null;
      if (cs.unitKey) {
        unitId = unitIdMap.get(cs.unitKey) || null;
        if (!unitId) {
          result.warnings.push(`Cheatsheet "${cs.title}" references unknown unit: ${cs.unitKey}`);
        }
      }

      const stableKey = buildCheatsheetStableKey(courseId, unitId, cs);
      const existingSheet = await db.studyCheatSheet.findUnique({
        where: { stableKey },
        select: cheatsheetIdView,
      });

      await db.studyCheatSheet.upsert({
        where: { stableKey },
        create: {
          courseId,
          unitId,
          title: cs.title,
          stableKey,
          assetType: cs.assetType,
          url: cs.url ? cs.url : null,
          content: cs.content ? normalizeEscapedWhitespace(cs.content) : null,
          contentFormat: cs.contentFormat ? cs.contentFormat : null,
          version: cs.version || 1,
          sortOrder: cheatSheetOrder,
        },
        update: {
          unitId,
          title: cs.title,
          assetType: cs.assetType,
          url: cs.url ? cs.url : null,
          content: cs.content ? normalizeEscapedWhitespace(cs.content) : null,
          contentFormat: cs.contentFormat ? cs.contentFormat : null,
          version: cs.version || 1,
          sortOrder: cheatSheetOrder,
        },
      });

      if (!existingSheet) {
        result.stats.cheatsheetsCreated++;
      }
      cheatSheetOrder++;
    }

    // 7. 更新课程统计
    await updateCourseTotals(db, courseId);

    if (publishOnImport) {
      await archiveOtherPublishedCourses(db, pkg.manifest.courseKey, courseId);
    }

    result.success = true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    result.errors.push(message);
  }

  return result;
}

// ============================================
// 解析完整课程包（从文件内容）
// ============================================

export interface PackageFiles {
  manifestJson: string;
  unitsJson: string;
  cardsTsv: Map<string, string>; // unitKey -> TSV content
  questionsGift: Map<string, string>; // unitKey -> GIFT content
  cheatsheetsJson?: string;
}

export function parseCoursePackage(files: PackageFiles): CoursePackage {
  // 1. 解析 manifest
  const manifest = parseManifest(files.manifestJson);

  // 2. 解析 units
  const units = parseUnits(files.unitsJson);

  // 3. 解析卡片
  const cards = new Map<string, CardDefinition[]>();
  for (const [unitKey, tsvContent] of files.cardsTsv.entries()) {
    const parsedCards = parseCardsTsv(tsvContent, unitKey);
    if (parsedCards.length > 0) {
      cards.set(unitKey, parsedCards);
    }
  }

  // 4. 解析题目
  const questions = new Map<string, QuestionDefinition[]>();
  for (const [unitKey, giftContent] of files.questionsGift.entries()) {
    const parsedQuestions = parseQuestionsGift(giftContent, unitKey);
    if (parsedQuestions.length > 0) {
      questions.set(unitKey, parsedQuestions);
    }
  }

  // 5. 解析急救包（可选）
  let cheatsheets: CheatSheetDefinition[] = [];
  if (files.cheatsheetsJson) {
    cheatsheets = parseCheatsheets(files.cheatsheetsJson);
  }

  return {
    manifest,
    units,
    cards,
    questions,
    cheatsheets,
  };
}

// ============================================
// 列出课程版本
// ============================================

export interface CourseVersionInfo {
  id: number;
  courseKey: string;
  contentVersion: number;
  title: string;
  status: CourseStatus;
  totalCards: number;
  totalQuestions: number;
  createdAt: Date;
}

export async function listCourseVersions(
  db: DbCtx,
  courseKey: string,
): Promise<CourseVersionInfo[]> {
  const courses = await db.studyCourse.findMany({
    where: { courseKey },
    select: courseVersionView,
    orderBy: { contentVersion: "desc" },
  });

  return courses;
}

// ============================================
// 发布/归档课程
// ============================================

export async function setCourseStatus(
  db: DbCtx,
  courseId: number,
  status: CourseStatus,
): Promise<void> {
  if (status === CourseStatus.PUBLISHED) {
    const course = await db.studyCourse.findUnique({
      where: { id: courseId },
      select: courseKeyOnlyView,
    });
    if (course) {
      await archiveOtherPublishedCourses(db, course.courseKey, courseId);
    }
  }

  await db.studyCourse.update({
    where: { id: courseId },
    data: { status },
  });
}
