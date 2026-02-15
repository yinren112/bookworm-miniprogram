import * as fs from "fs";
import * as path from "path";
import { PrismaClient, CourseStatus, QuestionType } from "@prisma/client";
import { parseManifest, parseQuestionsGift } from "../services/study/importService";
import {
  collectFillBlankInputIssues,
  type FillBlankInputIssue,
} from "../services/study/fillBlankAnswer";

type SourceType = "db" | "files";

interface CliOptions {
  source: SourceType;
  dir: string;
  includeDraft: boolean;
  output?: string;
  failOnIssue: boolean;
  limit: number;
}

interface AuditFinding {
  source: SourceType;
  courseKey: string;
  questionId?: number;
  contentId: string;
  answer: string;
  stemPreview: string;
  location?: string;
  issues: FillBlankInputIssue[];
}

interface AuditReport {
  generatedAt: string;
  source: SourceType;
  totalFillBlankQuestions: number;
  totalFindings: number;
  findingsBySeverity: Record<FillBlankInputIssue["severity"], number>;
  findingsByIssueCode: Record<string, number>;
  findingsByCourse: Record<string, number>;
  findings: AuditFinding[];
}

const prisma = new PrismaClient();

function defaultCoursesDir(): string {
  const fromRepoRoot = path.resolve(process.cwd(), "..", "courses");
  if (fs.existsSync(fromRepoRoot)) return fromRepoRoot;
  return path.resolve(process.cwd(), "courses");
}

function parseCliArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    source: "db",
    dir: defaultCoursesDir(),
    includeDraft: false,
    failOnIssue: false,
    limit: 30,
  };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    switch (token) {
      case "--source": {
        const value = argv[++i];
        if (value !== "db" && value !== "files") {
          throw new Error("--source 仅支持 db 或 files");
        }
        options.source = value;
        break;
      }
      case "--dir": {
        const value = argv[++i];
        if (!value) throw new Error("--dir 缺少路径参数");
        options.dir = path.resolve(value);
        break;
      }
      case "--include-draft":
        options.includeDraft = true;
        break;
      case "--output": {
        const value = argv[++i];
        if (!value) throw new Error("--output 缺少路径参数");
        options.output = path.resolve(value);
        break;
      }
      case "--fail-on-issue":
        options.failOnIssue = true;
        break;
      case "--limit": {
        const value = Number(argv[++i]);
        if (!Number.isInteger(value) || value < 1) {
          throw new Error("--limit 必须是正整数");
        }
        options.limit = value;
        break;
      }
      case "--help":
      case "-h":
        printUsage();
        process.exit(0);
        break;
      default:
        throw new Error(`未知参数: ${token}`);
    }
  }

  return options;
}

function printUsage(): void {
  console.log("用法: ts-node src/scripts/audit-study-content.ts [options]");
  console.log("");
  console.log("可选参数:");
  console.log("  --source <db|files>     审核来源，默认 db");
  console.log("  --dir <path>            文件模式下课程目录，默认 ../courses");
  console.log("  --include-draft         数据库模式下包含 DRAFT 课程");
  console.log("  --output <path>         输出 JSON 报告文件");
  console.log("  --limit <n>             控制台最多打印 n 条问题，默认 30");
  console.log("  --fail-on-issue         若发现问题则返回非 0");
}

function getStemPreview(stem: string): string {
  const raw = String(stem || "").replace(/\s+/g, " ").trim();
  return raw.length <= 80 ? raw : `${raw.slice(0, 80)}...`;
}

function findCoursePackageDirs(rootDir: string): string[] {
  const result: string[] = [];

  function walk(dir: string, depth: number): void {
    if (depth > 8) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    const names = new Set(entries.map((entry) => entry.name));
    if (names.has("manifest.json") && names.has("units.json")) {
      result.push(dir);
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      walk(path.join(dir, entry.name), depth + 1);
    }
  }

  walk(rootDir, 0);
  return result.sort();
}

function collectIssueStats(
  findings: AuditFinding[],
): Pick<AuditReport, "findingsBySeverity" | "findingsByIssueCode" | "findingsByCourse"> {
  const findingsBySeverity: Record<FillBlankInputIssue["severity"], number> = {
    high: 0,
    medium: 0,
  };
  const findingsByIssueCode: Record<string, number> = {};
  const findingsByCourse: Record<string, number> = {};

  for (const finding of findings) {
    findingsByCourse[finding.courseKey] = (findingsByCourse[finding.courseKey] || 0) + 1;
    for (const issue of finding.issues) {
      findingsBySeverity[issue.severity] += 1;
      findingsByIssueCode[issue.code] = (findingsByIssueCode[issue.code] || 0) + 1;
    }
  }

  return {
    findingsBySeverity,
    findingsByIssueCode,
    findingsByCourse,
  };
}

async function auditFromDatabase(includeDraft: boolean): Promise<{
  totalFillBlankQuestions: number;
  findings: AuditFinding[];
}> {
  const courseWhere = includeDraft ? {} : { status: CourseStatus.PUBLISHED };
  const courses = await prisma.studyCourse.findMany({
    where: courseWhere,
    select: {
      id: true,
      courseKey: true,
    },
  });

  const courseById = new Map(courses.map((course) => [course.id, course.courseKey]));
  const courseIds = courses.map((course) => course.id);
  if (courseIds.length === 0) {
    return { totalFillBlankQuestions: 0, findings: [] };
  }

  const questions = await prisma.studyQuestion.findMany({
    where: {
      courseId: { in: courseIds },
      questionType: QuestionType.FILL_BLANK,
    },
    select: {
      id: true,
      courseId: true,
      contentId: true,
      answerJson: true,
      stem: true,
    },
    orderBy: [{ courseId: "asc" }, { id: "asc" }],
  });

  const findings: AuditFinding[] = [];
  for (const question of questions) {
    const issues = collectFillBlankInputIssues(question.answerJson);
    if (issues.length === 0) continue;
    findings.push({
      source: "db",
      courseKey: courseById.get(question.courseId) || `course#${question.courseId}`,
      questionId: question.id,
      contentId: question.contentId,
      answer: question.answerJson,
      stemPreview: getStemPreview(question.stem),
      issues,
    });
  }

  return {
    totalFillBlankQuestions: questions.length,
    findings,
  };
}

function loadGiftFiles(questionsDir: string): Array<{ unitKey: string; fullPath: string }> {
  if (!fs.existsSync(questionsDir)) return [];
  const entries = fs.readdirSync(questionsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".gift"))
    .map((entry) => ({
      unitKey: path.basename(entry.name, ".gift"),
      fullPath: path.join(questionsDir, entry.name),
    }))
    .sort((a, b) => a.fullPath.localeCompare(b.fullPath));
}

async function auditFromFiles(rootDir: string): Promise<{
  totalFillBlankQuestions: number;
  findings: AuditFinding[];
}> {
  const packageDirs = findCoursePackageDirs(rootDir);
  const findings: AuditFinding[] = [];
  let totalFillBlankQuestions = 0;

  for (const packageDir of packageDirs) {
    const manifestPath = path.join(packageDir, "manifest.json");
    let courseKey = path.basename(packageDir);

    try {
      const manifestRaw = fs.readFileSync(manifestPath, "utf8");
      courseKey = parseManifest(manifestRaw).courseKey;
    } catch {
      findings.push({
        source: "files",
        courseKey,
        contentId: "manifest",
        answer: "",
        stemPreview: "manifest.json 解析失败",
        location: manifestPath,
        issues: [
          {
            code: "EXPRESSION_TOO_COMPLEX",
            message: "manifest.json 解析失败，无法继续课程审核",
            severity: "high",
          },
        ],
      });
      continue;
    }

    const questionsDir = path.join(packageDir, "questions");
    const giftFiles = loadGiftFiles(questionsDir);
    for (const file of giftFiles) {
      let questions;
      try {
        const giftRaw = fs.readFileSync(file.fullPath, "utf8");
        questions = parseQuestionsGift(giftRaw, file.unitKey);
      } catch (error) {
        findings.push({
          source: "files",
          courseKey,
          contentId: file.unitKey,
          answer: "",
          stemPreview: `题目文件解析失败: ${(error as Error).message}`,
          location: file.fullPath,
          issues: [
            {
              code: "EXPRESSION_TOO_COMPLEX",
              message: "题目文件解析失败，需先修复格式错误",
              severity: "high",
            },
          ],
        });
        continue;
      }

      for (const question of questions) {
        if (question.questionType !== QuestionType.FILL_BLANK) continue;
        totalFillBlankQuestions += 1;
        const issues = collectFillBlankInputIssues(question.answer);
        if (issues.length === 0) continue;
        findings.push({
          source: "files",
          courseKey,
          contentId: question.contentId,
          answer: question.answer,
          stemPreview: getStemPreview(question.stem),
          location: file.fullPath,
          issues,
        });
      }
    }
  }

  return { totalFillBlankQuestions, findings };
}

function buildReport(
  source: SourceType,
  totalFillBlankQuestions: number,
  findings: AuditFinding[],
): AuditReport {
  const stats = collectIssueStats(findings);
  return {
    generatedAt: new Date().toISOString(),
    source,
    totalFillBlankQuestions,
    totalFindings: findings.length,
    findingsBySeverity: stats.findingsBySeverity,
    findingsByIssueCode: stats.findingsByIssueCode,
    findingsByCourse: stats.findingsByCourse,
    findings,
  };
}

function printSummary(report: AuditReport, limit: number): void {
  console.log("[AUDIT] 复习填空题可输入性审核");
  console.log(`- source: ${report.source}`);
  console.log(`- generatedAt: ${report.generatedAt}`);
  console.log(`- totalFillBlankQuestions: ${report.totalFillBlankQuestions}`);
  console.log(`- totalFindings: ${report.totalFindings}`);
  console.log(
    `- findingsBySeverity: high=${report.findingsBySeverity.high}, medium=${report.findingsBySeverity.medium}`,
  );

  const issuePairs = Object.entries(report.findingsByIssueCode).sort((a, b) => b[1] - a[1]);
  if (issuePairs.length > 0) {
    console.log("- findingsByIssueCode:");
    for (const [code, count] of issuePairs) {
      console.log(`  - ${code}: ${count}`);
    }
  }

  const coursePairs = Object.entries(report.findingsByCourse).sort((a, b) => b[1] - a[1]);
  if (coursePairs.length > 0) {
    console.log("- findingsByCourse:");
    for (const [courseKey, count] of coursePairs) {
      console.log(`  - ${courseKey}: ${count}`);
    }
  }

  if (report.findings.length === 0) return;

  console.log(`- sampleFindings(top ${Math.min(limit, report.findings.length)}):`);
  for (const finding of report.findings.slice(0, limit)) {
    const issueCodes = finding.issues.map((issue) => issue.code).join(",");
    const location = finding.location ? ` file=${finding.location}` : "";
    const questionId = finding.questionId ? ` qid=${finding.questionId}` : "";
    console.log(
      `  - [${finding.courseKey}]${questionId} contentId=${finding.contentId} issues=${issueCodes}${location}`,
    );
    console.log(`    answer=${finding.answer}`);
    console.log(`    stem=${finding.stemPreview}`);
  }
}

async function main(): Promise<void> {
  let options: CliOptions;
  try {
    options = parseCliArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`[ERROR] ${(error as Error).message}`);
    printUsage();
    process.exit(1);
    return;
  }

  const result = options.source === "db"
    ? await auditFromDatabase(options.includeDraft)
    : await auditFromFiles(options.dir);

  const report = buildReport(options.source, result.totalFillBlankQuestions, result.findings);
  printSummary(report, options.limit);

  if (options.output) {
    fs.mkdirSync(path.dirname(options.output), { recursive: true });
    fs.writeFileSync(options.output, JSON.stringify(report, null, 2), "utf8");
    console.log(`- reportFile: ${options.output}`);
  }

  if (options.failOnIssue && report.totalFindings > 0) {
    process.exit(2);
    return;
  }
}

main()
  .catch((error) => {
    console.error(`[FATAL] ${(error as Error).message}`);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

