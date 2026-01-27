// src/services/study/courseService.ts
import { Prisma, PrismaClient, CourseStatus } from "@prisma/client";
import {
  courseSelectPublic,
  courseIdOnlyView,
  courseIdStatusKeyView,
  courseIdVersionView,
  enrollmentCourseIdView,
  enrollmentCourseKeyView,
  unitWithCountsView,
  enrollmentSelectPublic,
  enrollmentWithCourseView,
} from "../../db/views";
import { log } from "../../lib/logger";
import { metrics } from "../../plugins/metrics";

type DbCtx = PrismaClient | Prisma.TransactionClient;

// 重新导出供其他模块使用
export { courseSelectPublic };

// ============================================
// 类型定义
// ============================================

export interface CourseListItem {
  id: number;
  courseKey: string;
  title: string;
  description: string | null;
  totalCards: number;
  totalQuestions: number;
  status: CourseStatus;
  enrolled?: boolean;
  lastStudiedAt?: Date | null;
}

export interface CourseDetail {
  id: number;
  courseKey: string;
  title: string;
  description: string | null;
  contentVersion: number;
  totalCards: number;
  totalQuestions: number;
  enrolledCourseId?: number | null;
  enrolledContentVersion?: number | null;
  latestContentVersion?: number | null;
  upgradeAvailable?: boolean;
  units: UnitListItem[];
  enrollment?: {
    enrolledAt: Date;
    lastStudiedAt: Date | null;
    completedCards: number;
    examDate: Date | null;
  } | null;
}

export interface UnitListItem {
  id: number;
  unitKey: string;
  title: string;
  orderIndex: number;
  cardCount: number;
  questionCount: number;
}

// ============================================
// 课程列表
// ============================================

export async function getCourseList(
  dbCtx: DbCtx,
  options: { publishedOnly?: boolean; userId?: number; includeUnpublishedFallback?: boolean } = {},
): Promise<CourseListItem[]> {
  const { publishedOnly = true, userId, includeUnpublishedFallback = false } = options;

  let courses = await dbCtx.studyCourse.findMany({
    where: publishedOnly ? { status: CourseStatus.PUBLISHED } : undefined,
    select: courseSelectPublic,
    orderBy: { updatedAt: "desc" },
  });

  if (publishedOnly && includeUnpublishedFallback && courses.length === 0) {
    courses = await dbCtx.studyCourse.findMany({
      where: { status: { not: CourseStatus.ARCHIVED } },
      select: courseSelectPublic,
      orderBy: [
        { courseKey: "asc" },
        { contentVersion: "desc" },
        { updatedAt: "desc" },
      ],
      distinct: ["courseKey"],
    });
  }
  const enrollments = userId
    ? await dbCtx.userCourseEnrollment.findMany({
        where: { userId, isActive: true },
        select: enrollmentCourseKeyView,
      })
    : [];

  const enrollmentByCourseKey = new Map<string, Date | null>();
  for (const enrollment of enrollments) {
    const courseKey = enrollment.course.courseKey;
    const current = enrollmentByCourseKey.get(courseKey);
    if (!current) {
      enrollmentByCourseKey.set(courseKey, enrollment.lastStudiedAt ?? null);
      continue;
    }
    if (enrollment.lastStudiedAt && enrollment.lastStudiedAt > current) {
      enrollmentByCourseKey.set(courseKey, enrollment.lastStudiedAt);
    }
  }

  return courses.map((course) => ({
    id: course.id,
    courseKey: course.courseKey,
    title: course.title,
    description: course.description,
    totalCards: course.totalCards,
    totalQuestions: course.totalQuestions,
    status: course.status,
    enrolled: userId ? enrollmentByCourseKey.has(course.courseKey) : undefined,
    lastStudiedAt: userId ? enrollmentByCourseKey.get(course.courseKey) ?? null : undefined,
  }));
}

// ============================================
// 课程详情
// ============================================

async function getCourseDetailById(
  dbCtx: DbCtx,
  courseId: number,
  options: { userId?: number } = {},
): Promise<CourseDetail | null> {
  const { userId } = options;
  const course = await dbCtx.studyCourse.findUnique({
    where: { id: courseId },
    select: courseSelectPublic,
  });

  if (!course) {
    return null;
  }

  const units = await dbCtx.studyUnit.findMany({
    where: { courseId: course.id },
    select: unitWithCountsView,
    orderBy: { orderIndex: "asc" },
  });
  const enrollment = userId
    ? await dbCtx.userCourseEnrollment.findUnique({
        where: { userId_courseId: { userId, courseId: course.id } },
        select: enrollmentSelectPublic,
      })
    : null;

  return {
    id: course.id,
    courseKey: course.courseKey,
    title: course.title,
    description: course.description,
    contentVersion: course.contentVersion,
    totalCards: course.totalCards,
    totalQuestions: course.totalQuestions,
    units: units.map((unit) => ({
      id: unit.id,
      unitKey: unit.unitKey,
      title: unit.title,
      orderIndex: unit.orderIndex,
      cardCount: unit._count.cards,
      questionCount: unit._count.questions,
    })),
    enrollment: enrollment
      ? {
          enrolledAt: enrollment.enrolledAt,
          lastStudiedAt: enrollment.lastStudiedAt,
          completedCards: enrollment.completedCards,
          examDate: enrollment.examDate,
        }
      : null,
  };
}

async function getLatestPublishedCourse(
  dbCtx: DbCtx,
  courseKey: string,
  options: { publishedOnly?: boolean; latestVersion?: boolean } = {},
): Promise<{ id: number; contentVersion: number } | null> {
  const { publishedOnly = true, latestVersion = true } = options;
  return dbCtx.studyCourse.findFirst({
    where: {
      courseKey,
      ...(publishedOnly ? { status: CourseStatus.PUBLISHED } : {}),
    },
    select: courseIdVersionView,
    orderBy: latestVersion ? { contentVersion: "desc" } : undefined,
  });
}

async function getEnrolledCourseForUser(
  dbCtx: DbCtx,
  userId: number,
  courseKey: string,
): Promise<{ courseId: number } | null> {
  const activeEnrollment = await dbCtx.userCourseEnrollment.findFirst({
    where: {
      userId,
      isActive: true,
      course: { courseKey },
    },
    select: enrollmentCourseIdView,
    orderBy: { enrolledAt: "desc" },
  });

  if (activeEnrollment) {
    return activeEnrollment;
  }

  return dbCtx.userCourseEnrollment.findFirst({
    where: {
      userId,
      course: { courseKey },
    },
    select: enrollmentCourseIdView,
    orderBy: { enrolledAt: "desc" },
  });
}

export async function getCourseByKey(
  dbCtx: DbCtx,
  courseKey: string,
  options: { userId?: number; publishedOnly?: boolean; latestVersion?: boolean } = {},
): Promise<CourseDetail | null> {
  const { userId, publishedOnly = true, latestVersion = true } = options;

  if (userId) {
    const enrolled = await getEnrolledCourseForUser(dbCtx, userId, courseKey);
    if (enrolled) {
      const detail = await getCourseDetailById(dbCtx, enrolled.courseId, { userId });
      if (!detail) {
        return null;
      }
      const latest = await getLatestPublishedCourse(dbCtx, courseKey, {
        publishedOnly: true,
        latestVersion: true,
      });
      const upgradeAvailable = !!latest && latest.id !== detail.id;

      return {
        ...detail,
        enrolledCourseId: detail.id,
        enrolledContentVersion: detail.contentVersion,
        latestContentVersion: latest?.contentVersion ?? null,
        upgradeAvailable,
      };
    }
  }

  const latest = await getLatestPublishedCourse(dbCtx, courseKey, {
    publishedOnly,
    latestVersion,
  });
  if (!latest) {
    return null;
  }

  const detail = await getCourseDetailById(dbCtx, latest.id, { userId });
  if (!detail) {
    return null;
  }

  return {
    ...detail,
    latestContentVersion: detail.contentVersion,
    upgradeAvailable: false,
  };
}

// ============================================
// 课程注册
// ============================================

export async function enrollCourse(
  dbCtx: DbCtx,
  userId: number,
  courseId: number,
  sourceScene?: string,
): Promise<{ enrolled: boolean; alreadyEnrolled: boolean }> {
  // 检查课程是否存在
  const course = await dbCtx.studyCourse.findUnique({
    where: { id: courseId },
    select: courseIdStatusKeyView,
  });

  if (!course) {
    throw new Error("COURSE_NOT_FOUND");
  }

  if (course.status !== CourseStatus.PUBLISHED) {
    throw new Error("COURSE_NOT_PUBLISHED");
  }

  const enrollInTransaction = async (tx: Prisma.TransactionClient) => {
    const courseIds = await tx.studyCourse.findMany({
      where: { courseKey: course.courseKey },
      select: courseIdOnlyView,
    });

    if (courseIds.length > 0) {
      await tx.userCourseEnrollment.updateMany({
        where: {
          userId,
          courseId: { in: courseIds.map((item) => item.id) },
        },
        data: { isActive: false },
      });
    }

    const existingEnrollment = await tx.userCourseEnrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
      select: enrollmentCourseIdView,
    });

    await tx.userCourseEnrollment.upsert({
      where: { userId_courseId: { userId, courseId } },
      create: {
        userId,
        courseId,
        sourceScene,
        isActive: true,
      },
      update: {
        ...(sourceScene ? { sourceScene } : {}),
        isActive: true,
      },
    });

    const activeCount = await tx.userCourseEnrollment.count({
      where: {
        userId,
        courseId: { in: courseIds.map((item) => item.id) },
        isActive: true,
      },
    });
    if (activeCount > 1) {
      metrics.enrollmentActiveConflictTotal.inc();
      log.warn(
        { userId, courseKey: course.courseKey, activeCount },
        "enrollment active conflict detected",
      );
    }

    return { enrolled: true, alreadyEnrolled: !!existingEnrollment };
  };

  if ("$transaction" in dbCtx) {
    return (dbCtx as PrismaClient).$transaction(enrollInTransaction);
  }
  return enrollInTransaction(dbCtx as Prisma.TransactionClient);
}

// ============================================
// 考试日期更新
// ============================================

export async function updateEnrollmentExamDate(
  dbCtx: DbCtx,
  userId: number,
  courseId: number,
  examDate: Date | null,
): Promise<Date | null> {
  const enrollment = await dbCtx.userCourseEnrollment.update({
    where: { userId_courseId: { userId, courseId } },
    data: { examDate },
    select: enrollmentSelectPublic,
  });

  return enrollment.examDate;
}

// ============================================
// 课程统计更新（内部使用）
// ============================================

export async function updateCourseTotals(
  dbCtx: DbCtx,
  courseId: number,
): Promise<void> {
  const [cardCount, questionCount] = await Promise.all([
    dbCtx.studyCard.count({ where: { courseId } }),
    dbCtx.studyQuestion.count({ where: { courseId } }),
  ]);

  await dbCtx.studyCourse.update({
    where: { id: courseId },
    data: {
      totalCards: cardCount,
      totalQuestions: questionCount,
    },
  });
}

// ============================================
// 发布版本归档（内部使用）
// ============================================

export async function archiveOtherPublishedCourses(
  dbCtx: DbCtx,
  courseKey: string,
  excludeCourseId?: number,
): Promise<void> {
  try {
    await dbCtx.studyCourse.updateMany({
      where: {
        courseKey,
        status: CourseStatus.PUBLISHED,
        ...(excludeCourseId ? { NOT: { id: excludeCourseId } } : {}),
      },
      data: { status: CourseStatus.ARCHIVED },
    });
  } catch (error) {
    metrics.coursePublishArchiveFailedTotal.inc();
    log.error(
      { err: error, courseKey, excludeCourseId },
      "publish archive old published failed",
    );
    throw error;
  }

  const remainingPublished = await dbCtx.studyCourse.count({
    where: { courseKey, status: CourseStatus.PUBLISHED },
  });
  if (remainingPublished > 1) {
    metrics.coursePublishArchiveFailedTotal.inc();
    log.warn(
      { courseKey, excludeCourseId, remainingPublished },
      "publish archive old published failed",
    );
  }
}

// ============================================
// 获取用户已注册的课程
// ============================================

export async function getUserEnrolledCourses(
  dbCtx: DbCtx,
  userId: number,
): Promise<CourseListItem[]> {
  const enrollments = await dbCtx.userCourseEnrollment.findMany({
    where: { userId, isActive: true },
    select: enrollmentWithCourseView,
    orderBy: { lastStudiedAt: { sort: "desc", nulls: "last" } },
  });

  return enrollments.map((enrollment) => ({
    id: enrollment.course.id,
    courseKey: enrollment.course.courseKey,
    title: enrollment.course.title,
    description: enrollment.course.description,
    totalCards: enrollment.course.totalCards,
    totalQuestions: enrollment.course.totalQuestions,
    status: enrollment.course.status,
    enrolled: true,
    lastStudiedAt: enrollment.lastStudiedAt,
  }));
}
