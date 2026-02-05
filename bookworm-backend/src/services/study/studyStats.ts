import { PrismaClient, Prisma } from "@prisma/client";
import { enrollmentCourseKeyView, questionAttemptQuestionIdView } from "../../db/views";
import { getCourseByKey } from "./courseService";

type DbCtx = PrismaClient | Prisma.TransactionClient;

export interface ResolvedCourse {
  id: number;
  courseKey: string;
  title: string;
  totalCards: number;
  totalQuestions: number;
  upgradeAvailable: boolean;
}

export interface ResolveCurrentCourseOptions {
  includeUnpublished?: boolean;
}

export async function resolveCurrentCourse(
  dbCtx: DbCtx,
  userId: number,
  courseKey?: string,
  options: ResolveCurrentCourseOptions = {},
): Promise<ResolvedCourse | null> {
  const { includeUnpublished = false } = options;

  if (courseKey) {
    const course = await getCourseByKey(dbCtx, courseKey, {
      userId,
      publishedOnly: !includeUnpublished,
    });
    return course ? toResolvedCourse(course) : null;
  }

  const enrollment = await dbCtx.userCourseEnrollment.findFirst({
    where: { userId, isActive: true },
    orderBy: [
      { lastStudiedAt: { sort: "desc", nulls: "last" } },
      { enrolledAt: "desc" },
    ],
    select: enrollmentCourseKeyView,
  });

  if (!enrollment?.course?.courseKey) {
    return null;
  }

  const course = await getCourseByKey(dbCtx, enrollment.course.courseKey, {
    userId,
    publishedOnly: !includeUnpublished,
  });

  return course ? toResolvedCourse(course) : null;
}

export async function getQuizPendingStats(
  dbCtx: DbCtx,
  userId: number,
  courseId: number,
  totalQuestions: number,
): Promise<{ pendingCount: number }> {
  if (totalQuestions <= 0) {
    return { pendingCount: 0 };
  }

  const [questionCount, answered] = await Promise.all([
    dbCtx.studyQuestion.count({ where: { courseId } }),
    dbCtx.userQuestionAttempt.findMany({
      where: { userId, question: { courseId } },
      distinct: ["questionId"],
      select: questionAttemptQuestionIdView,
    }),
  ]);

  const effectiveTotal = questionCount > 0 ? questionCount : totalQuestions;
  return { pendingCount: Math.max(0, effectiveTotal - answered.length) };
}

export async function getWrongCount(
  dbCtx: DbCtx,
  userId: number,
  courseId: number,
): Promise<number> {
  return dbCtx.userWrongItem.count({
    where: { userId, clearedAt: null, question: { courseId } },
  });
}

function toResolvedCourse(course: {
  id: number;
  courseKey: string;
  title: string;
  totalCards: number;
  totalQuestions: number;
  upgradeAvailable?: boolean;
}): ResolvedCourse {
  return {
    id: course.id,
    courseKey: course.courseKey,
    title: course.title,
    totalCards: course.totalCards,
    totalQuestions: course.totalQuestions,
    upgradeAvailable: course.upgradeAvailable ?? false,
  };
}
