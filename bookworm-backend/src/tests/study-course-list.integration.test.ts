import { describe, it, expect } from "vitest";
import { getPrismaClientForWorker } from "./globalSetup";
import { getCourseList } from "../services/study/courseService";
import {
  assertIncludeUnpublishedAllowed,
  shouldIncludeUnpublishedFallback,
} from "../utils/studyCourseVisibility";
import { ApiError } from "../errors";

describe("Study course list includeUnpublished fallback", () => {
  const prisma = getPrismaClientForWorker();

  it("should return latest non-archived per courseKey when no published exists", async () => {
    const courseKey = `COURSE_${Date.now()}`;
    const otherKey = `OTHER_${Date.now()}`;

    await prisma.studyCourse.create({
      data: {
        courseKey,
        title: "Draft v1",
        contentVersion: 1,
        status: "DRAFT",
        totalCards: 0,
        totalQuestions: 0,
      },
    });
    const v2 = await prisma.studyCourse.create({
      data: {
        courseKey,
        title: "Draft v2",
        contentVersion: 2,
        status: "DRAFT",
        totalCards: 0,
        totalQuestions: 0,
      },
    });
    await prisma.studyCourse.create({
      data: {
        courseKey: otherKey,
        title: "Other Draft",
        contentVersion: 1,
        status: "DRAFT",
        totalCards: 0,
        totalQuestions: 0,
      },
    });

    const courses = await getCourseList(prisma, {
      publishedOnly: true,
      includeUnpublishedFallback: true,
    });

    expect(courses).toHaveLength(2);
    const selected = courses.find((course) => course.courseKey === courseKey);
    expect(selected?.id).toBe(v2.id);
    expect(selected?.status).toBe("DRAFT");
  });

  it("should prefer published list when at least one published exists", async () => {
    await prisma.studyCourse.create({
      data: {
        courseKey: "DRAFT_ONLY",
        title: "Draft Only",
        contentVersion: 1,
        status: "DRAFT",
        totalCards: 0,
        totalQuestions: 0,
      },
    });
    await prisma.studyCourse.create({
      data: {
        courseKey: "PUBLISHED_ONLY",
        title: "Published",
        contentVersion: 1,
        status: "PUBLISHED",
        totalCards: 0,
        totalQuestions: 0,
      },
    });

    const courses = await getCourseList(prisma, {
      publishedOnly: true,
      includeUnpublishedFallback: true,
    });

    expect(courses).toHaveLength(1);
    expect(courses[0].status).toBe("PUBLISHED");
    expect(courses[0].courseKey).toBe("PUBLISHED_ONLY");
  });
});

describe("Study course visibility guard", () => {
  it("should block includeUnpublished in production", () => {
    try {
      assertIncludeUnpublishedAllowed(true, "production");
      throw new Error("Expected error was not thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      const apiError = error as ApiError;
      expect(apiError.statusCode).toBe(403);
      expect(apiError.code).toBe("INCLUDE_UNPUBLISHED_FORBIDDEN");
    }
  });

  it("should allow includeUnpublished in non-production", () => {
    expect(() => assertIncludeUnpublishedAllowed(true, "development")).not.toThrow();
    expect(shouldIncludeUnpublishedFallback(true, "development")).toBe(true);
    expect(shouldIncludeUnpublishedFallback(true, "staging")).toBe(true);
  });
});
