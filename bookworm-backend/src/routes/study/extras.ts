import { FastifyPluginAsync } from "fastify";
import { CourseStatus, FeedbackReasonType } from "@prisma/client";
import prisma from "../../db";
import config from "../../config";
import {
  cardIdOnlyView,
  courseIdOnlyView,
  questionIdOnlyView,
} from "../../db/views";
import { ApiError, StudyServiceError, StudyErrorCodes } from "../../errors";
import { getBeijingDateOnlyString } from "../../utils/timezone";
import {
  getCourseByKey,
  getCheatSheets,
  getCheatSheetById,
  createFeedback,
  getUserFeedbacks,
  starItem,
  unstarItem,
  getStarredItems,
  upsertStudyReminderSubscription,
  getStudyReminderStatus,
  getStreakInfo,
  getWeeklyLeaderboard,
  getUserRank,
  getActivityHistory,
  recordDailyStudyDuration,
  parseYmdToDateOnlyUtc,
  importCoursePackage,
  listCourseVersions,
  setCourseStatus,
  type CoursePackage,
  type QuestionDefinition,
} from "../../services/study";
import { resolveCardByContentId, resolveQuestionById } from "./helpers";
import {
  GetCheatSheetsQuerySchema,
  GetCheatSheetsQuery,
  CheatSheetParamsSchema,
  CheatSheetParams,
  CreateFeedbackBodySchema,
  CreateFeedbackBody,
  GetFeedbacksQuerySchema,
  GetFeedbacksQuery,
  StarItemBodySchema,
  StarItemBody,
  StarredItemsQuerySchema,
  StarredItemsQuery,
  ReminderConfigResponseSchema,
  ReminderSubscribeBodySchema,
  ReminderSubscribeBody,
  ReminderSubscribeResponseSchema,
  ReminderStatusQuerySchema,
  ReminderStatusQuery,
  ReminderStatusResponseSchema,
  LeaderboardQuerySchema,
  LeaderboardQuery,
  ActivityPulseBodySchema,
  ActivityPulseBody,
  ActivityPulseResponseSchema,
  ActivityHistoryQuerySchema,
  ActivityHistoryQuery,
  ActivityHistoryResponseSchema,
  ImportCourseBodySchema,
  ImportCourseBody,
  CourseVersionsParamsSchema,
  CourseVersionsParams,
  UpdateCourseStatusParamsSchema,
  UpdateCourseStatusParams,
  UpdateCourseStatusBodySchema,
  UpdateCourseStatusBody,
} from "../studySchemas";

const studyExtrasRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: GetCheatSheetsQuery }>(
    "/api/study/cheatsheets",
    {
      preHandler: [fastify.authenticate],
      schema: {
        querystring: GetCheatSheetsQuerySchema,
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { courseKey, unitId } = request.query;

      const course = await getCourseByKey(prisma, courseKey, { userId });
      if (!course) {
        throw new StudyServiceError(StudyErrorCodes.COURSE_NOT_FOUND, "Course not found");
      }

      const sheets = await getCheatSheets(prisma, course.id, unitId);
      reply.send({ cheatsheets: sheets });
    },
  );

  fastify.get<{ Params: CheatSheetParams }>(
    "/api/study/cheatsheets/:id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: CheatSheetParamsSchema,
      },
    },
    async (request, reply) => {
      const id = parseInt(request.params.id, 10);
      const sheet = await getCheatSheetById(prisma, id);
      if (!sheet) {
        throw new StudyServiceError(StudyErrorCodes.CHEATSHEET_NOT_FOUND, "Cheatsheet not found");
      }
      reply.send({ cheatsheet: sheet });
    },
  );

  fastify.post<{ Body: CreateFeedbackBody }>(
    "/api/study/feedback",
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: CreateFeedbackBodySchema,
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { courseKey, cardId, questionId, reason, message } = request.body;

      const course = await getCourseByKey(prisma, courseKey, { userId });
      if (!course) {
        throw new StudyServiceError(StudyErrorCodes.COURSE_NOT_FOUND, "Course not found");
      }

      if (!cardId && !questionId) {
        throw new StudyServiceError(StudyErrorCodes.FEEDBACK_TARGET_REQUIRED, "Either cardId or questionId is required");
      }

      if (cardId) {
        const card = await prisma.studyCard.findFirst({
          where: { id: cardId, courseId: course.id },
          select: cardIdOnlyView,
        });
        if (!card) {
          throw new StudyServiceError(StudyErrorCodes.CARD_NOT_FOUND, "Card not found");
        }
      }

      if (questionId) {
        const question = await prisma.studyQuestion.findFirst({
          where: { id: questionId, courseId: course.id },
          select: questionIdOnlyView,
        });
        if (!question) {
          throw new StudyServiceError(StudyErrorCodes.QUESTION_NOT_FOUND, "Question not found");
        }
      }

      const feedback = await createFeedback(prisma, {
        userId,
        courseId: course.id,
        cardId,
        questionId,
        reason: reason as FeedbackReasonType,
        message,
      });

      reply.send({
        feedback: {
          ...feedback,
          createdAt: feedback.createdAt.toISOString(),
          resolvedAt: feedback.resolvedAt?.toISOString() || null,
        },
      });
    },
  );

  fastify.get<{ Querystring: GetFeedbacksQuery }>(
    "/api/study/feedback",
    {
      preHandler: [fastify.authenticate],
      schema: {
        querystring: GetFeedbacksQuerySchema,
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { limit, offset } = request.query;

      const result = await getUserFeedbacks(prisma, userId, { limit, offset });

      reply.send({
        items: result.items.map((item) => ({
          ...item,
          createdAt: item.createdAt.toISOString(),
          resolvedAt: item.resolvedAt?.toISOString() || null,
        })),
        total: result.total,
      });
    },
  );

  fastify.post<{ Body: StarItemBody }>(
    "/api/study/star",
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: StarItemBodySchema,
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { type } = request.body;

      if (type === "card") {
        const { contentId, courseKey } = request.body;
        await resolveCardByContentId(userId, contentId, {
          courseKey,
          requireCourseKey: true,
        });
        await starItem(prisma, userId, { type: "card", contentId });
      } else {
        const { questionId, courseKey } = request.body;
        await resolveQuestionById(userId, questionId, {
          courseKey,
          requireCourseKey: true,
        });
        await starItem(prisma, userId, { type: "question", questionId });
      }

      reply.send({ success: true });
    },
  );

  fastify.delete<{ Body: StarItemBody }>(
    "/api/study/star",
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: StarItemBodySchema,
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { type } = request.body;

      if (type === "card") {
        const { contentId, courseKey } = request.body;
        await resolveCardByContentId(userId, contentId, {
          courseKey,
          requireCourseKey: true,
        });
        await unstarItem(prisma, userId, { type: "card", contentId });
      } else {
        const { questionId, courseKey } = request.body;
        await resolveQuestionById(userId, questionId, {
          courseKey,
          requireCourseKey: true,
        });
        await unstarItem(prisma, userId, { type: "question", questionId });
      }

      reply.send({ success: true });
    },
  );

  fastify.get<{ Querystring: StarredItemsQuery }>(
    "/api/study/starred-items",
    {
      preHandler: [fastify.authenticate],
      schema: {
        querystring: StarredItemsQuerySchema,
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { type, courseKey, limit, offset } = request.query;

      let courseId: number | undefined;
      if (courseKey) {
        const course = await getCourseByKey(prisma, courseKey, { userId });
        if (!course) {
          throw new StudyServiceError(StudyErrorCodes.COURSE_NOT_FOUND, "Course not found");
        }
        courseId = course.id;
      }

      const result = await getStarredItems(prisma, userId, {
        type,
        courseId,
        limit,
        offset,
      });

      reply.send({
        items: result.items.map((item) => ({
          type: item.type,
          contentId: item.contentId,
          questionId: item.questionId,
        })),
        total: result.total,
      });
    },
  );

  fastify.get(
    "/api/study/reminders/config",
    {
      preHandler: [fastify.authenticate],
      schema: {
        response: {
          200: ReminderConfigResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      const templateId = config.STUDY_REMINDER_TEMPLATE_ID || null;
      reply.send({ templateId });
    },
  );

  fastify.post<{ Body: ReminderSubscribeBody }>(
    "/api/study/reminders/subscribe",
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: ReminderSubscribeBodySchema,
        response: {
          200: ReminderSubscribeResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { templateId, result, timezone } = request.body;
      const resolvedTemplateId = templateId || config.STUDY_REMINDER_TEMPLATE_ID;
      if (!resolvedTemplateId) {
        throw new ApiError(
          409,
          "Study reminder template is not configured",
          "STUDY_REMINDER_TEMPLATE_NOT_CONFIGURED",
        );
      }

      const subscription = await upsertStudyReminderSubscription(
        prisma,
        userId,
        resolvedTemplateId,
        result,
        timezone,
      );

      reply.send({
        status: subscription.status,
        nextSendAt: subscription.nextSendAt ? subscription.nextSendAt.toISOString() : null,
      });
    },
  );

  fastify.get<{ Querystring: ReminderStatusQuery }>(
    "/api/study/reminders/status",
    {
      preHandler: [fastify.authenticate],
      schema: {
        querystring: ReminderStatusQuerySchema,
        response: {
          200: ReminderStatusResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { templateId } = request.query;

      const resolvedTemplateId =
        templateId || config.STUDY_REMINDER_TEMPLATE_ID || undefined;
      const status = await getStudyReminderStatus(prisma, userId, resolvedTemplateId);

      reply.send({
        status: status.status,
        templateId: status.templateId,
        lastSentAt: status.lastSentAt ? status.lastSentAt.toISOString() : null,
        nextSendAt: status.nextSendAt ? status.nextSendAt.toISOString() : null,
      });
    },
  );

  fastify.get(
    "/api/study/streak",
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const streakInfo = await getStreakInfo(prisma, userId);
      reply.send({
        currentStreak: streakInfo.currentStreak,
        bestStreak: streakInfo.bestStreak,
        weeklyPoints: streakInfo.weeklyPoints,
        lastStudyDate: streakInfo.lastStudyDate
          ? streakInfo.lastStudyDate.toISOString().split("T")[0]
          : null,
        isStudiedToday: streakInfo.isStudiedToday,
      });
    },
  );

  fastify.get<{ Querystring: LeaderboardQuery }>(
    "/api/study/leaderboard",
    {
      preHandler: [fastify.authenticate],
      schema: {
        querystring: LeaderboardQuerySchema,
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { courseKey, limit } = request.query;

      let courseId: number | undefined;
      if (courseKey) {
        const course = await getCourseByKey(prisma, courseKey);
        if (!course) {
          throw new StudyServiceError(StudyErrorCodes.COURSE_NOT_FOUND, "Course not found");
        }
        courseId = course.id;
      }

      const items = await getWeeklyLeaderboard(prisma, courseId, limit);
      const myRank = await getUserRank(prisma, userId);
      const myStreak = await getStreakInfo(prisma, userId);

      reply.send({
        items,
        myRank,
        myStreak: {
          currentStreak: myStreak.currentStreak,
          bestStreak: myStreak.bestStreak,
          weeklyPoints: myStreak.weeklyPoints,
          lastStudyDate: myStreak.lastStudyDate
            ? myStreak.lastStudyDate.toISOString().split("T")[0]
            : null,
          isStudiedToday: myStreak.isStudiedToday,
        },
      });
    },
  );

  fastify.post<{ Body: ActivityPulseBody }>(
    "/api/study/activity/pulse",
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: ActivityPulseBodySchema,
        response: {
          200: ActivityPulseResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { type, activityDate, totalDurationSeconds } = request.body;

      let activityDateOnlyUtc: Date;
      try {
        activityDateOnlyUtc = parseYmdToDateOnlyUtc(activityDate);
      } catch {
        throw new StudyServiceError(StudyErrorCodes.INVALID_ACTIVITY_DATE, "activityDate 无效");
      }

      const todayDateOnlyUtc = parseYmdToDateOnlyUtc(getBeijingDateOnlyString());

      const maxBackfillDays = 7;
      const minDateOnlyUtc = new Date(
        todayDateOnlyUtc.getTime() - (maxBackfillDays - 1) * 24 * 60 * 60 * 1000,
      );

      if (activityDateOnlyUtc.getTime() > todayDateOnlyUtc.getTime()) {
        throw new StudyServiceError(StudyErrorCodes.ACTIVITY_DATE_IN_FUTURE, "activityDate 不能是未来日期");
      }
      if (activityDateOnlyUtc.getTime() < minDateOnlyUtc.getTime()) {
        throw new StudyServiceError(StudyErrorCodes.ACTIVITY_DATE_TOO_OLD, "activityDate 超出允许回填范围");
      }

      await recordDailyStudyDuration(prisma, {
        userId,
        activityDate: activityDateOnlyUtc,
        type,
        totalDurationSeconds,
      });

      reply.send({ ok: true });
    },
  );

  fastify.get<{ Querystring: ActivityHistoryQuery }>(
    "/api/study/activity-history",
    {
      preHandler: [fastify.authenticate],
      schema: {
        querystring: ActivityHistoryQuerySchema,
        response: {
          200: ActivityHistoryResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const days = request.query.days || 35;
      const history = await getActivityHistory(prisma, userId, days);
      reply.send({
        days: history.days,
        totalDays: history.totalDays,
        totalDurationSeconds: history.totalDurationSeconds,
      });
    },
  );

  fastify.post<{ Body: ImportCourseBody }>(
    "/api/study/admin/import",
    {
      preHandler: [fastify.authenticate, fastify.requireRole("STAFF")],
      schema: {
        body: ImportCourseBodySchema,
      },
    },
    async (request, reply) => {
      const { manifest, units, cards, questions, cheatsheets, options } = request.body;

      const cardsMap = new Map<
        string,
        Array<{ contentId: string; front: string; back: string; tags?: string; difficulty?: number }>
      >();
      if (cards) {
        for (const [unitKey, cardList] of Object.entries(cards)) {
          cardsMap.set(unitKey, cardList);
        }
      }

      const questionsMap = new Map<string, QuestionDefinition[]>();
      if (questions) {
        for (const [unitKey, questionList] of Object.entries(questions)) {
          questionsMap.set(
            unitKey,
            questionList.map((q) => ({
              contentId: q.contentId,
              questionType: q.questionType,
              stem: q.stem,
              options: q.options,
              answer: q.answer,
              explanation: q.explanation,
              difficulty: q.difficulty,
            })),
          );
        }
      }

      const pkg: CoursePackage = {
        manifest: {
          courseKey: manifest.courseKey,
          title: manifest.title,
          description: manifest.description,
          contentVersion: manifest.contentVersion,
          locale: manifest.locale,
        },
        units: units.map((u) => ({
          unitKey: u.unitKey,
          title: u.title,
          orderIndex: u.orderIndex,
        })),
        cards: cardsMap,
        questions: questionsMap,
        cheatsheets:
          cheatsheets?.map((cs) => ({
            title: cs.title,
            assetType: cs.assetType,
            url: "url" in cs ? cs.url : undefined,
            content: "content" in cs ? cs.content : undefined,
            contentFormat:
              "contentFormat" in cs && cs.contentFormat ? cs.contentFormat : undefined,
            unitKey: cs.unitKey,
            version: cs.version,
          })) || [],
      };

      const result = await prisma.$transaction(async (tx) => {
        return importCoursePackage(tx, pkg, {
          dryRun: options?.dryRun,
          overwriteContent: options?.overwriteContent,
          publishOnImport: options?.publishOnImport,
        });
      });

      reply.send(result);
    },
  );

  fastify.get<{ Params: CourseVersionsParams }>(
    "/api/study/admin/courses/:courseKey/versions",
    {
      preHandler: [fastify.authenticate, fastify.requireRole("STAFF")],
      schema: {
        params: CourseVersionsParamsSchema,
      },
    },
    async (request, reply) => {
      const { courseKey } = request.params;
      const versions = await listCourseVersions(prisma, courseKey);
      reply.send({
        versions: versions.map((v) => ({
          ...v,
          createdAt: v.createdAt.toISOString(),
        })),
      });
    },
  );

  fastify.patch<{ Params: UpdateCourseStatusParams; Body: UpdateCourseStatusBody }>(
    "/api/study/admin/courses/:id/status",
    {
      preHandler: [fastify.authenticate, fastify.requireRole("STAFF")],
      schema: {
        params: UpdateCourseStatusParamsSchema,
        body: UpdateCourseStatusBodySchema,
      },
    },
    async (request, reply) => {
      const courseId = parseInt(request.params.id, 10);
      const { status } = request.body;

      const course = await prisma.studyCourse.findUnique({
        where: { id: courseId },
        select: courseIdOnlyView,
      });
      if (!course) {
        throw new ApiError(404, "Course not found", "COURSE_NOT_FOUND");
      }

      await setCourseStatus(prisma, courseId, status as CourseStatus);
      reply.send({ success: true, courseId, status });
    },
  );
};

export default studyExtrasRoutes;

