import { FastifyPluginAsync } from "fastify";
import { FeedbackRating } from "@prisma/client";
import prisma from "../../db";
import config from "../../config";
import {
  assertIncludeUnpublishedAllowed,
} from "../../utils/studyCourseVisibility";
import {
  getCourseByKey,
  enrollCourse,
  getTodayQueueSummary,
  getStudyDashboard,
  startCardSession,
  submitCardFeedback,
  startQuizSession,
  submitQuizAnswer,
  getWrongItems,
  clearWrongItem,
  getQuizStats,
} from "../../services/study";
import { StudyServiceError, StudyErrorCodes } from "../../errors";
import { getBeijingDateOnlyString } from "../../utils/timezone";
import { resolveCardByContentId } from "./helpers";
import {
  TodayQueueQuerySchema,
  TodayQueueQuery,
  StudyDashboardQuerySchema,
  StudyDashboardQuery,
  StudyDashboardResponseSchema,
  StartSessionBodySchema,
  StartSessionBody,
  CardAnswerParamsSchema,
  CardAnswerParams,
  CardAnswerBodySchema,
  CardAnswerBody,
  StartQuizBodySchema,
  StartQuizBody,
  SubmitQuizAnswerBodySchema,
  SubmitQuizAnswerBody,
  GetWrongItemsQuerySchema,
  GetWrongItemsQuery,
  ClearWrongItemParamsSchema,
  ClearWrongItemParams,
  QuizStatsQuerySchema,
  QuizStatsQuery,
} from "../studySchemas";

const studySessionsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: TodayQueueQuery }>(
    "/api/study/today",
    {
      preHandler: [fastify.authenticate],
      schema: {
        querystring: TodayQueueQuerySchema,
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { courseKey } = request.query;

      const course = await getCourseByKey(prisma, courseKey, { userId });
      if (!course) {
        throw new StudyServiceError(StudyErrorCodes.COURSE_NOT_FOUND, "Course not found");
      }

      const summary = await getTodayQueueSummary(prisma, userId, course.id);
      reply.send({ summary });
    },
  );

  fastify.get<{ Querystring: StudyDashboardQuery }>(
    "/api/study/dashboard",
    {
      preHandler: [fastify.authenticate],
      schema: {
        querystring: StudyDashboardQuerySchema,
        response: {
          200: StudyDashboardResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { courseKey, includeUnpublished } = request.query;
      const includeUnpublishedFlag = includeUnpublished === true;
      assertIncludeUnpublishedAllowed(includeUnpublishedFlag, config.NODE_ENV);

      const dashboard = await getStudyDashboard(prisma, userId, courseKey, {
        includeUnpublished: includeUnpublishedFlag,
      });

      if (courseKey && !dashboard.currentCourse) {
        throw new StudyServiceError(StudyErrorCodes.COURSE_NOT_FOUND, "Course not found");
      }

      reply.send({
        ...dashboard,
        resumeSession: dashboard.resumeSession
          ? {
              ...dashboard.resumeSession,
              updatedAt: new Date(dashboard.resumeSession.updatedAt).toISOString(),
            }
          : null,
      });
    },
  );

  fastify.post<{ Body: StartSessionBody }>(
    "/api/study/start",
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: StartSessionBodySchema,
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { courseKey, unitId, limit } = request.body;

      const course = await getCourseByKey(prisma, courseKey, { userId });
      if (!course) {
        throw new StudyServiceError(StudyErrorCodes.COURSE_NOT_FOUND, "Course not found");
      }

      if (!course.enrollment) {
        await enrollCourse(prisma, userId, course.id);
      }

      const session = await startCardSession(prisma, userId, course.id, {
        unitId,
        limit,
      });

      reply.send(session);
    },
  );

  fastify.post<{ Params: CardAnswerParams; Body: CardAnswerBody }>(
    "/api/study/cards/:contentId/answer",
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: CardAnswerParamsSchema,
        body: CardAnswerBodySchema,
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { contentId } = request.params;
      const { sessionId, rating, courseKey, courseId } = request.body;

      const card = await resolveCardByContentId(userId, contentId, {
        courseKey,
        courseId,
        requireCourseKey: true,
      });

      const ratingEnum = rating as FeedbackRating;

      const update = await submitCardFeedback(
        prisma,
        userId,
        card.id,
        sessionId,
        ratingEnum,
      );

      reply.send({
        ...update,
        todayDate: getBeijingDateOnlyString(),
      });
    },
  );

  fastify.post<{ Body: StartQuizBody }>(
    "/api/study/quiz/start",
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: StartQuizBodySchema,
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { courseKey, unitId, limit, wrongItemsOnly } = request.body;

      const course = await getCourseByKey(prisma, courseKey, { userId });
      if (!course) {
        throw new StudyServiceError(StudyErrorCodes.COURSE_NOT_FOUND, "Course not found");
      }

      if (!course.enrollment) {
        await enrollCourse(prisma, userId, course.id);
      }

      const session = await startQuizSession(prisma, userId, course.id, {
        unitId,
        limit,
        wrongItemsOnly,
      });

      reply.send(session);
    },
  );

  fastify.post<{ Body: SubmitQuizAnswerBody }>(
    "/api/study/quiz/answer",
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: SubmitQuizAnswerBodySchema,
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { sessionId, questionId, answer, durationMs } = request.body;

      const result = await submitQuizAnswer(
        prisma,
        userId,
        questionId,
        sessionId,
        answer,
        durationMs,
      );

      reply.send(result);
    },
  );

  fastify.get<{ Querystring: GetWrongItemsQuery }>(
    "/api/study/wrong-items",
    {
      preHandler: [fastify.authenticate],
      schema: {
        querystring: GetWrongItemsQuerySchema,
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { courseKey, limit, offset } = request.query;

      let courseId: number | undefined;
      if (courseKey) {
        const course = await getCourseByKey(prisma, courseKey, { userId });
        if (!course) {
          throw new StudyServiceError(StudyErrorCodes.COURSE_NOT_FOUND, "Course not found");
        }
        courseId = course.id;
      }

      const result = await getWrongItems(prisma, userId, courseId, { limit, offset });

      reply.send({
        items: result.items.map((item) => ({
          ...item,
          lastWrongAt: item.lastWrongAt ? item.lastWrongAt.toISOString() : null,
        })),
        total: result.total,
      });
    },
  );

  fastify.delete<{ Params: ClearWrongItemParams }>(
    "/api/study/wrong-items/:questionId",
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: ClearWrongItemParamsSchema,
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const questionId = parseInt(request.params.questionId, 10);

      const cleared = await clearWrongItem(prisma, userId, questionId);
      if (!cleared) {
        throw new StudyServiceError(StudyErrorCodes.WRONG_ITEM_NOT_FOUND, "Wrong item not found");
      }

      reply.send({ success: true });
    },
  );

  fastify.get<{ Querystring: QuizStatsQuery }>(
    "/api/study/quiz/stats",
    {
      preHandler: [fastify.authenticate],
      schema: {
        querystring: QuizStatsQuerySchema,
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { courseKey } = request.query;

      let courseId: number | undefined;
      if (courseKey) {
        const course = await getCourseByKey(prisma, courseKey, { userId });
        if (!course) {
          throw new StudyServiceError(StudyErrorCodes.COURSE_NOT_FOUND, "Course not found");
        }
        courseId = course.id;
      }

      const stats = await getQuizStats(prisma, userId, courseId);
      reply.send(stats);
    },
  );
};

export default studySessionsRoutes;
