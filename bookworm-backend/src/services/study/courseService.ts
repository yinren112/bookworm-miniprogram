// src/services/study/courseService.ts
import { Prisma, PrismaClient, CourseStatus } from "@prisma/client";
import {
  courseSelectPublic,
  unitWithCountsView,
  courseIdStatusView,
  enrollmentCourseProgressView,
  enrollmentSelectPublic,
  enrollmentWithCourseView,
} from "../../db/views";

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
  options: { publishedOnly?: boolean; userId?: number } = {},
): Promise<CourseListItem[]> {
  const { publishedOnly = true, userId } = options;

  const courses = await dbCtx.studyCourse.findMany({
    where: publishedOnly ? { status: CourseStatus.PUBLISHED } : undefined,
    select: courseSelectPublic,
    orderBy: { updatedAt: "desc" },
  });
  const enrollments = userId
    ? await dbCtx.userCourseEnrollment.findMany({
        where: { userId },
        select: enrollmentCourseProgressView,
      })
    : [];

  const enrollmentByCourseId = new Map(
    enrollments.map((enrollment) => [enrollment.courseId, enrollment.lastStudiedAt]),
  );

  return courses.map((course) => ({
    id: course.id,
    courseKey: course.courseKey,
    title: course.title,
    description: course.description,
    totalCards: course.totalCards,
    totalQuestions: course.totalQuestions,
    status: course.status,
    enrolled: userId ? enrollmentByCourseId.has(course.id) : undefined,
    lastStudiedAt: userId ? enrollmentByCourseId.get(course.id) ?? null : undefined,
  }));
}

// ============================================
// 课程详情
// ============================================

export async function getCourseByKey(
  dbCtx: DbCtx,
  courseKey: string,
  options: { userId?: number; publishedOnly?: boolean; latestVersion?: boolean } = {},
): Promise<CourseDetail | null> {
  const { userId, publishedOnly = true, latestVersion = true } = options;
  const course = await dbCtx.studyCourse.findFirst({
    where: {
      courseKey,
      ...(publishedOnly ? { status: CourseStatus.PUBLISHED } : {}),
    },
    select: courseSelectPublic,
    orderBy: latestVersion ? { contentVersion: "desc" } : undefined,
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
    select: courseIdStatusView,
  });

  if (!course) {
    throw new Error("COURSE_NOT_FOUND");
  }

  if (course.status !== CourseStatus.PUBLISHED) {
    throw new Error("COURSE_NOT_PUBLISHED");
  }

  // 尝试创建注册记录（幂等操作）
  try {
    await dbCtx.userCourseEnrollment.create({
      data: {
        userId,
        courseId,
        sourceScene,
      },
    });
    return { enrolled: true, alreadyEnrolled: false };
  } catch (error) {
    // P2002: Unique constraint violation (already enrolled)
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { enrolled: true, alreadyEnrolled: true };
    }
    throw error;
  }
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
// 获取用户已注册的课程
// ============================================

export async function getUserEnrolledCourses(
  dbCtx: DbCtx,
  userId: number,
): Promise<CourseListItem[]> {
  const enrollments = await dbCtx.userCourseEnrollment.findMany({
    where: { userId },
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
