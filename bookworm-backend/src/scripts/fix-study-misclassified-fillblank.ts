import { PrismaClient, CourseStatus, QuestionType } from "@prisma/client";
import { extractLegacyChoiceOptionsFromFillBlank } from "../services/study/fillBlankAnswer";

interface CliOptions {
  includeDraft: boolean;
  apply: boolean;
  courseKey?: string;
  limit: number;
}

interface FixCandidate {
  id: number;
  courseKey: string;
  contentId: string;
  answerJson: string;
  options: string[];
}

const prisma = new PrismaClient();

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    includeDraft: false,
    apply: false,
    limit: 100,
  };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    switch (token) {
      case "--include-draft":
        options.includeDraft = true;
        break;
      case "--apply":
        options.apply = true;
        break;
      case "--courseKey": {
        const value = argv[++i];
        if (!value) throw new Error("--courseKey 缺少参数");
        options.courseKey = value.trim();
        break;
      }
      case "--limit": {
        const value = Number(argv[++i]);
        if (!Number.isInteger(value) || value <= 0) {
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
  console.log("用法: ts-node src/scripts/fix-study-misclassified-fillblank.ts [options]");
  console.log("");
  console.log("参数:");
  console.log("  --apply               实际写库；默认仅 dry-run");
  console.log("  --include-draft       包含 DRAFT 课程（默认仅 PUBLISHED）");
  console.log("  --courseKey <key>     仅修复单门课程");
  console.log("  --limit <n>           控制台最多打印 n 条，默认 100");
}

function buildCourseWhere(options: CliOptions) {
  return {
    ...(options.courseKey ? { courseKey: options.courseKey } : {}),
    ...(options.includeDraft ? {} : { status: CourseStatus.PUBLISHED }),
  };
}

async function collectCandidates(options: CliOptions): Promise<FixCandidate[]> {
  const courses = await prisma.studyCourse.findMany({
    where: buildCourseWhere(options),
    select: { id: true, courseKey: true },
  });
  if (courses.length === 0) return [];

  const courseById = new Map(courses.map((course) => [course.id, course.courseKey]));
  const questions = await prisma.studyQuestion.findMany({
    where: {
      courseId: { in: courses.map((course) => course.id) },
      questionType: QuestionType.FILL_BLANK,
    },
    select: {
      id: true,
      courseId: true,
      contentId: true,
      answerJson: true,
    },
    orderBy: [{ courseId: "asc" }, { id: "asc" }],
  });

  const candidates: FixCandidate[] = [];
  for (const question of questions) {
    const optionsFromAnswer = extractLegacyChoiceOptionsFromFillBlank(question.answerJson);
    if (!optionsFromAnswer || optionsFromAnswer.length < 2) continue;
    candidates.push({
      id: question.id,
      courseKey: courseById.get(question.courseId) || `course#${question.courseId}`,
      contentId: question.contentId,
      answerJson: question.answerJson,
      options: optionsFromAnswer,
    });
  }

  return candidates;
}

async function applyFix(candidates: FixCandidate[]): Promise<number> {
  if (candidates.length === 0) return 0;
  return prisma.$transaction(async (tx) => {
    let updated = 0;
    for (const item of candidates) {
      const res = await tx.studyQuestion.updateMany({
        where: {
          id: item.id,
          questionType: QuestionType.FILL_BLANK,
        },
        data: {
          questionType: QuestionType.MULTI_CHOICE,
          optionsJson: item.options,
          answerJson: item.options.join("|"),
        },
      });
      updated += res.count;
    }
    return updated;
  });
}

function printResult(options: CliOptions, candidates: FixCandidate[], updatedCount: number): void {
  console.log("[FIX] 修复误导入填空题（多行全正确选项）");
  console.log(`- mode: ${options.apply ? "apply" : "dry-run"}`);
  console.log(`- includeDraft: ${options.includeDraft}`);
  if (options.courseKey) console.log(`- courseKey: ${options.courseKey}`);
  console.log(`- candidates: ${candidates.length}`);
  if (options.apply) console.log(`- updated: ${updatedCount}`);

  if (candidates.length === 0) return;
  console.log(`- sample(top ${Math.min(options.limit, candidates.length)}):`);
  for (const item of candidates.slice(0, options.limit)) {
    console.log(`  - qid=${item.id} [${item.courseKey}] contentId=${item.contentId}`);
    console.log(`    newOptions=${JSON.stringify(item.options)}`);
  }
}

async function main(): Promise<void> {
  let options: CliOptions;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`[ERROR] ${(error as Error).message}`);
    printUsage();
    process.exit(1);
    return;
  }

  const candidates = await collectCandidates(options);
  const updatedCount = options.apply ? await applyFix(candidates) : 0;
  printResult(options, candidates, updatedCount);
}

main()
  .catch((error) => {
    console.error(`[FATAL] ${(error as Error).message}`);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

