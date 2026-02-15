import { PrismaClient, CourseStatus } from "@prisma/client";

interface CliOptions {
  apply: boolean;
  includeDraft: boolean;
  limit: number;
}

const MARKERS = ["答案占位符"];
const prisma = new PrismaClient();

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    apply: false,
    includeDraft: false,
    limit: 50,
  };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    switch (token) {
      case "--apply":
        options.apply = true;
        break;
      case "--include-draft":
        options.includeDraft = true;
        break;
      case "--limit": {
        const value = Number(argv[++i]);
        if (!Number.isInteger(value) || value <= 0) throw new Error("--limit 必须是正整数");
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
  console.log("用法: ts-node src/scripts/fix-study-placeholder-questions.ts [options]");
  console.log("");
  console.log("参数:");
  console.log("  --apply            实际删除占位题（默认 dry-run）");
  console.log("  --include-draft    包含 DRAFT 课程");
  console.log("  --limit <n>        控制台最多打印 n 条");
}

function buildMarkerWhere() {
  return {
    OR: MARKERS.flatMap((marker) => [
      { answerJson: { contains: marker } },
      { stem: { contains: marker } },
    ]),
  };
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

  const courses = await prisma.studyCourse.findMany({
    where: options.includeDraft ? {} : { status: CourseStatus.PUBLISHED },
    select: { id: true, courseKey: true },
  });
  const courseById = new Map(courses.map((course) => [course.id, course.courseKey]));
  const courseIds = courses.map((course) => course.id);

  const candidates = await prisma.studyQuestion.findMany({
    where: {
      courseId: { in: courseIds },
      ...buildMarkerWhere(),
    },
    select: {
      id: true,
      courseId: true,
      contentId: true,
      questionType: true,
      answerJson: true,
    },
    orderBy: [{ courseId: "asc" }, { id: "asc" }],
  });

  console.log("[FIX] 清理占位题（答案占位符）");
  console.log(`- mode: ${options.apply ? "apply" : "dry-run"}`);
  console.log(`- includeDraft: ${options.includeDraft}`);
  console.log(`- candidates: ${candidates.length}`);
  for (const item of candidates.slice(0, options.limit)) {
    console.log(
      `  - qid=${item.id} [${courseById.get(item.courseId) || item.courseId}] ${item.contentId} (${item.questionType})`,
    );
  }

  if (!options.apply || candidates.length === 0) return;

  const touchedCourseIds = Array.from(new Set(candidates.map((item) => item.courseId)));
  await prisma.$transaction(async (tx) => {
    await tx.studyQuestion.deleteMany({
      where: { id: { in: candidates.map((item) => item.id) } },
    });

    for (const courseId of touchedCourseIds) {
      const [totalCards, totalQuestions] = await Promise.all([
        tx.studyCard.count({ where: { courseId } }),
        tx.studyQuestion.count({ where: { courseId } }),
      ]);
      await tx.studyCourse.update({
        where: { id: courseId },
        data: { totalCards, totalQuestions },
      });
    }
  });

  console.log(`- deleted: ${candidates.length}`);
  console.log(`- updatedCourses: ${touchedCourseIds.length}`);
}

main()
  .catch((error) => {
    console.error(`[FATAL] ${(error as Error).message}`);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

