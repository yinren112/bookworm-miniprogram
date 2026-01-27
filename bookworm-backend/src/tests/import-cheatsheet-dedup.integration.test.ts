import { describe, expect, it } from "vitest";
import { importCoursePackage, type CoursePackage } from "../services/study";
import { getPrismaClientForWorker } from "./globalSetup";

describe("Import Cheatsheet Dedup", () => {
  const prisma = getPrismaClientForWorker();

  it("should not duplicate cheatsheets on repeated imports", async () => {
    const courseKey = `CHEAT_DEDUP_${Date.now()}`;

    const cards: CoursePackage["cards"] = new Map();
    const questions: CoursePackage["questions"] = new Map();

    const pkg: CoursePackage = {
      manifest: {
        courseKey,
        title: "Cheatsheet Dedup Course",
        contentVersion: 1,
      },
      units: [
        { unitKey: "UNIT_1", title: "Unit 1", orderIndex: 1 },
      ],
      cards,
      questions,
      cheatsheets: [
        {
          title: "Cheatsheet 1",
          assetType: "pdf",
          url: "https://example.com/cheat.pdf",
          unitKey: "UNIT_1",
          version: 1,
        },
      ],
    };

    const first = await importCoursePackage(prisma, pkg, {
      overwriteContent: true,
      publishOnImport: false,
    });
    expect(first.success).toBe(true);
    expect(first.courseId).not.toBeNull();

    const count1 = await prisma.studyCheatSheet.count({
      where: { courseId: first.courseId! },
    });

    const second = await importCoursePackage(prisma, pkg, {
      overwriteContent: true,
      publishOnImport: false,
    });
    expect(second.success).toBe(true);

    const count2 = await prisma.studyCheatSheet.count({
      where: { courseId: first.courseId! },
    });

    expect(count2).toBe(count1);
  });
});
