import prisma from "../../db";
import { metrics } from "../../plugins/metrics";
import {
  cardIdContentCourseView,
  enrollmentCourseIdView,
  questionIdCourseIdView,
} from "../../db/views";
import { getCourseByKey } from "../../services/study";
import { StudyServiceError, StudyErrorCodes } from "../../errors";

export interface ResolveCourseIdsOptions {
  courseKey?: string;
  courseId?: number;
  requireCourseKey?: boolean;
}

export async function resolveCourseIds(
  userId: number,
  options: ResolveCourseIdsOptions = {},
): Promise<number[]> {
  const { courseKey, courseId, requireCourseKey = false } = options;

  if (courseId) return [courseId];

  if (courseKey) {
    const course = await getCourseByKey(prisma, courseKey, { userId });
    if (!course) {
      throw new StudyServiceError(StudyErrorCodes.COURSE_NOT_FOUND, "Course not found");
    }
    return [course.id];
  }

  if (requireCourseKey) {
    metrics.courseScopeRequiredTotal.inc();
    throw new StudyServiceError(StudyErrorCodes.COURSE_SCOPE_REQUIRED, "Course scope is required");
  }

  const enrollments = await prisma.userCourseEnrollment.findMany({
    where: { userId, isActive: true },
    select: enrollmentCourseIdView,
  });

  return enrollments.map((e) => e.courseId);
}

export type ResolveCardOptions = ResolveCourseIdsOptions;
export type ResolveQuestionOptions = ResolveCourseIdsOptions;

export async function resolveCardByContentId(
  userId: number,
  contentId: string,
  options: ResolveCardOptions = {},
) {
  const courseIds = await resolveCourseIds(userId, options);
  if (courseIds.length === 0) {
    throw new StudyServiceError(StudyErrorCodes.CARD_NOT_FOUND, "Card not found");
  }

  const cards = await prisma.studyCard.findMany({
    where: {
      contentId,
      courseId: { in: courseIds },
    },
    select: cardIdContentCourseView,
  });

  if (cards.length === 0) {
    throw new StudyServiceError(StudyErrorCodes.CARD_NOT_FOUND, "Card not found");
  }

  if (cards.length > 1) {
    throw new StudyServiceError(StudyErrorCodes.CARD_CONTENT_ID_NOT_UNIQUE, "Card contentId is not unique");
  }

  return cards[0];
}

export async function resolveQuestionById(
  userId: number,
  questionId: number,
  options: ResolveQuestionOptions = {},
) {
  const courseIds = await resolveCourseIds(userId, options);
  if (courseIds.length === 0) {
    throw new StudyServiceError(StudyErrorCodes.QUESTION_NOT_FOUND, "Question not found");
  }

  const question = await prisma.studyQuestion.findFirst({
    where: {
      id: questionId,
      courseId: { in: courseIds },
    },
    select: questionIdCourseIdView,
  });

  if (!question) {
    throw new StudyServiceError(StudyErrorCodes.QUESTION_NOT_FOUND, "Question not found");
  }

  return question;
}
