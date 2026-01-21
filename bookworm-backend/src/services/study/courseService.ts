// src/services/study/courseService.ts
import { Prisma, PrismaClient, CourseStatus } from "@prisma/client";
import {
  courseSelectPublic,
  unitSelectPublic,
  courseIdStatusView,
  enrollmentLastStudiedView,
  enrollmentSelectPublic,
} from "../../db/views";

type DbCtx = PrismaClient | Prisma.TransactionClient;

// 重新导出供其他模块使用
export { courseSelectPublic, unitSelectPublic };

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

  /* eslint-disable local-rules/no-prisma-raw-select -- complex query with dynamic enrollment select */
  const courses = await dbCtx.studyCourse.findMany({
    where: publishedOnly ? { status: CourseStatus.PUBLISHED } : undefined,
    select: {
      ...courseSelectPublic,
      enrollments: userId
        ? {
            where: { userId },
            select: enrollmentLastStudiedView,
          }
        : false,
    },
    orderBy: { updatedAt: "desc" },
  });
  /* eslint-enable local-rules/no-prisma-raw-select */

  return courses.map((course) => ({
    id: course.id,
    courseKey: course.courseKey,
    title: course.title,
    description: course.description,
    totalCards: course.totalCards,
    totalQuestions: course.totalQuestions,
    status: course.status,
    enrolled: userId ? course.enrollments.length > 0 : undefined,
    lastStudiedAt: userId ? course.enrollments[0]?.lastStudiedAt : undefined,
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
  /* eslint-disable local-rules/no-prisma-raw-select -- complex nested query with _count */
  const course = await dbCtx.studyCourse.findFirst({
    where: {
      courseKey,
      ...(publishedOnly ? { status: CourseStatus.PUBLISHED } : {}),
    },
    select: {
      ...courseSelectPublic,
      units: {
        select: {
          ...unitSelectPublic,
          _count: {
            select: {
              cards: true,
              questions: true,
            },
          },
        },
        orderBy: { orderIndex: "asc" },
      },
      enrollments: userId
        ? {
            where: { userId },
            select: enrollmentSelectPublic,
          }
        : false,
    },
    orderBy: latestVersion ? { contentVersion: "desc" } : undefined,
  });
  /* eslint-enable local-rules/no-prisma-raw-select */

  if (!course) {
    return null;
  }

  return {
    id: course.id,
    courseKey: course.courseKey,
    title: course.title,
    description: course.description,
    contentVersion: course.contentVersion,
    totalCards: course.totalCards,
    totalQuestions: course.totalQuestions,
    units: course.units.map((unit) => ({
      id: unit.id,
      unitKey: unit.unitKey,
      title: unit.title,
      orderIndex: unit.orderIndex,
      cardCount: unit._count.cards,
      questionCount: unit._count.questions,
    })),
    enrollment: userId && course.enrollments.length > 0
      ? {
          enrolledAt: course.enrollments[0].enrolledAt,
          lastStudiedAt: course.enrollments[0].lastStudiedAt,
          completedCards: course.enrollments[0].completedCards,
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
  /* eslint-disable local-rules/no-prisma-raw-select -- nested include with course select */
  const enrollments = await dbCtx.userCourseEnrollment.findMany({
    where: { userId },
    select: {
      lastStudiedAt: true,
      course: {
        select: courseSelectPublic,
      },
    },
    orderBy: { lastStudiedAt: { sort: "desc", nulls: "last" } },
  });
  /* eslint-enable local-rules/no-prisma-raw-select */

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
