import { PrismaClient, CourseStatus, QuestionType } from "@prisma/client";

interface CliOptions {
  apply: boolean;
  includeDraft: boolean;
  limit: number;
}

interface AliasPatch {
  contentId: string;
  aliases: string[];
}

const ALIAS_PATCHES: AliasPatch[] = [
  {
    contentId: "CALC101-exam_2020_2021_2-Q005",
    aliases: ["(x-1)+0.5*(x-1)*(x-1)+o((x-1)*(x-1))"],
  },
  {
    contentId: "CALC101-exam_2020_2021_2-Q010",
    aliases: ["infinity", "inf"],
  },
  {
    contentId: "MATH101-exam_2020_2021_1-Q007",
    aliases: ["[[1,2],[2,2]]", "(1,2;2,2)"],
  },
  {
    contentId: "MATH101-exam_2020_2021_1-Q009",
    aliases: ["(1,5,-1)", "[1,5,-1]"],
  },
  {
    contentId: "MATH101-exam_2020_2021_1-Q011",
    aliases: ["k!=-1", "k<>-1"],
  },
  {
    contentId: "PHY101-exam_2023_2024_1-Q016",
    aliases: ["48 m/s2", "48"],
  },
  {
    contentId: "PHY101-exam_2023_2024_1-Q018",
    aliases: ["0.5*J*w0*w0", "J*w0*w0/2"],
  },
  {
    contentId: "PHY101-exam_2023_2024_1-Q022",
    aliases: ["0.7071*B*I*S", "B*I*S/sqrt(2)"],
  },
  {
    contentId: "PROB101-exam_2020_2021_2-Q006",
    aliases: ["A!B!C+!AB!C+!A!BC"],
  },
  {
    contentId: "PROB101-exam_2020_2021_2-Q008",
    aliases: ["exp(-1/3)", "e^(-1/3)", "0.71653"],
  },
  {
    contentId: "PROB101-exam_2020_2021_2-Q012",
    aliases: ["xbar+-s/sqrt(n)*t(alpha/2,n-1)"],
  },
];

const DELETE_CONTENT_IDS = [
  "PROB101-exam_2021_2022_1-Q002_dup4",
];

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
  console.log("用法: ts-node src/scripts/fix-study-fillblank-usability.ts [options]");
  console.log("");
  console.log("参数:");
  console.log("  --apply            实际写库（默认 dry-run）");
  console.log("  --include-draft    包含 DRAFT 课程（默认仅 PUBLISHED）");
  console.log("  --limit <n>        控制台最多打印 n 条（默认 50）");
}

function splitAnswers(answer: string): string[] {
  return String(answer || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function mergeAnswers(original: string, aliases: string[]): string {
  const set = new Set<string>(splitAnswers(original));
  for (const alias of aliases) {
    const trimmed = alias.trim();
    if (!trimmed) continue;
    set.add(trimmed);
  }
  return Array.from(set).join("|");
}

function buildCourseWhere(includeDraft: boolean) {
  return includeDraft ? {} : { status: CourseStatus.PUBLISHED };
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
    where: buildCourseWhere(options.includeDraft),
    select: { id: true, courseKey: true },
  });
  const courseIds = courses.map((course) => course.id);
  const courseById = new Map(courses.map((course) => [course.id, course.courseKey]));

  const questions = await prisma.studyQuestion.findMany({
    where: {
      courseId: { in: courseIds },
      OR: [
        { contentId: { in: ALIAS_PATCHES.map((item) => item.contentId) } },
        { contentId: { in: DELETE_CONTENT_IDS } },
      ],
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

  const patchMap = new Map(ALIAS_PATCHES.map((item) => [item.contentId, item.aliases]));
  const deleteSet = new Set(DELETE_CONTENT_IDS);

  const toPatch = questions
    .filter((question) => patchMap.has(question.contentId) && question.questionType === QuestionType.FILL_BLANK)
    .map((question) => {
      const aliases = patchMap.get(question.contentId) || [];
      const nextAnswer = mergeAnswers(question.answerJson, aliases);
      return {
        ...question,
        nextAnswer,
        changed: nextAnswer !== question.answerJson,
      };
    })
    .filter((question) => question.changed);

  const toDelete = questions.filter((question) => deleteSet.has(question.contentId));
  const touchedCourseIds = new Set<number>([
    ...toPatch.map((item) => item.courseId),
    ...toDelete.map((item) => item.courseId),
  ]);

  console.log("[FIX] 填空题可输入性修复");
  console.log(`- mode: ${options.apply ? "apply" : "dry-run"}`);
  console.log(`- includeDraft: ${options.includeDraft}`);
  console.log(`- patchCandidates: ${toPatch.length}`);
  console.log(`- deleteCandidates: ${toDelete.length}`);

  const preview = [
    ...toPatch.slice(0, options.limit).map((item) => ({
      kind: "patch",
      id: item.id,
      courseKey: courseById.get(item.courseId) || `course#${item.courseId}`,
      contentId: item.contentId,
      nextAnswer: item.nextAnswer,
    })),
    ...toDelete.slice(0, options.limit).map((item) => ({
      kind: "delete",
      id: item.id,
      courseKey: courseById.get(item.courseId) || `course#${item.courseId}`,
      contentId: item.contentId,
      nextAnswer: "",
    })),
  ];
  for (const item of preview) {
    console.log(`  - [${item.kind}] qid=${item.id} [${item.courseKey}] ${item.contentId}`);
    if (item.kind === "patch") {
      console.log(`    answer=${item.nextAnswer}`);
    }
  }

  if (!options.apply) return;

  await prisma.$transaction(async (tx) => {
    for (const item of toPatch) {
      await tx.studyQuestion.update({
        where: { id: item.id },
        data: { answerJson: item.nextAnswer },
      });
    }
    if (toDelete.length > 0) {
      await tx.studyQuestion.deleteMany({
        where: { id: { in: toDelete.map((item) => item.id) } },
      });
    }

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

  console.log(`- patched: ${toPatch.length}`);
  console.log(`- deleted: ${toDelete.length}`);
  console.log(`- updatedCourses: ${touchedCourseIds.size}`);
}

main()
  .catch((error) => {
    console.error(`[FATAL] ${(error as Error).message}`);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

