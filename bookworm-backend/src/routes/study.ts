// src/routes/study.ts
// 复习系统路由
import { FastifyPluginAsync } from "fastify";
import { FeedbackRating, FeedbackReasonType } from "@prisma/client";
import prisma from "../db";
import config from "../config";
import { metrics } from "../plugins/metrics";
import {
  cardIdOnlyView,
  courseIdOnlyView,
  questionIdOnlyView,
  enrollmentCourseIdView,
} from "../db/views";
import { ApiError } from "../errors";
import { CourseStatus } from "@prisma/client";
import { getBeijingNow } from "../utils/timezone";
import {
  assertIncludeUnpublishedAllowed,
  shouldIncludeUnpublishedFallback,
} from "../utils/studyCourseVisibility";
import {
  getCourseList,
  getCourseByKey,
  enrollCourse,
  updateEnrollmentExamDate,
  getUserEnrolledCourses,
  getTodayQueueSummary,
  startCardSession,
  submitCardFeedback,
  // Phase 3: Quiz
  startQuizSession,
  submitQuizAnswer,
  getWrongItems,
  clearWrongItem,
  getQuizStats,
  // Phase 4: Cheatsheet & Feedback
  getCheatSheets,
  getCheatSheetById,
  createFeedback,
  getUserFeedbacks,
  starItem,
  unstarItem,
  getStarredItems,
  // Phase 5: Streak & Leaderboard
  getStreakInfo,
  getWeeklyLeaderboard,
  getUserRank,
  // Phase 5.5: Activity History (Heatmap)
  getActivityHistory,
  recordDailyStudyDuration,
  parseYmdToDateOnlyUtc,
  // Phase 5.6: Dashboard & Reminders
  getStudyDashboard,
  upsertStudyReminderSubscription,
  getStudyReminderStatus,
  // Phase 6: Course Import
  importCoursePackage,
  listCourseVersions,
  setCourseStatus,
  type CoursePackage,
  type QuestionDefinition,
} from "../services/study";
import {
  GetCoursesQuerySchema,
  GetCoursesQuery,
  CourseKeyParamsSchema,
  CourseKeyParams,
  EnrollCourseParamsSchema,
  EnrollCourseParams,
  EnrollCourseBodySchema,
  EnrollCourseBody,
  UpdateExamDateBodySchema,
  UpdateExamDateBody,
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
  // Phase 3 schemas
  StartQuizBodySchema,
  StartQuizBody,
  SubmitQuizAnswerBodySchema,
  SubmitQuizAnswerBody,
  GetWrongItemsQuerySchema,
  GetWrongItemsQuery,
  DeleteWrongItemParamsSchema,
  DeleteWrongItemParams,
  GetQuizStatsQuerySchema,
  GetQuizStatsQuery,
  // Phase 4 schemas
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
  ReminderSubscribeBodySchema,
  ReminderSubscribeBody,
  ReminderConfigResponseSchema,
  ReminderSubscribeResponseSchema,
  ReminderStatusQuerySchema,
  ReminderStatusQuery,
  ReminderStatusResponseSchema,
  // Phase 5 schemas
  LeaderboardQuerySchema,
  LeaderboardQuery,
  ActivityHistoryQuerySchema,
  ActivityHistoryQuery,
  ActivityHistoryResponseSchema,
  ActivityPulseBodySchema,
  ActivityPulseBody,
  ActivityPulseResponseSchema,
  // Phase 6 schemas
  ImportCourseBodySchema,
  ImportCourseBody,
  CourseVersionsParamsSchema,
  CourseVersionsParams,
  UpdateCourseStatusParamsSchema,
  UpdateCourseStatusParams,
  UpdateCourseStatusBodySchema,
  UpdateCourseStatusBody,
} from "./studySchemas";

const studyRoutes: FastifyPluginAsync = async function (fastify) {
  const resolveCardByContentId = async (
    userId: number,
    contentId: string,
    options: { courseKey?: string; courseId?: number; requireCourseKey?: boolean } = {},
  ) => {
    const { courseKey, courseId, requireCourseKey = false } = options;
    let courseIds: number[] = [];
    if (courseId) {
      const enrollment = await prisma.userCourseEnrollment.findUnique({
        where: { userId_courseId: { userId, courseId } },
        select: enrollmentCourseIdView,
      });
      if (!enrollment) {
        throw new ApiError(404, "Card not found", "CARD_NOT_FOUND");
      }
      courseIds = [courseId];
    } else if (courseKey) {
      const course = await getCourseByKey(prisma, courseKey, { userId });
      if (!course) {
        throw new ApiError(404, "Course not found", "COURSE_NOT_FOUND");
      }
      courseIds = [course.id];
    } else if (requireCourseKey) {
      metrics.courseScopeRequiredTotal.inc();
      throw new ApiError(400, "Course scope is required", "COURSE_SCOPE_REQUIRED");
    } else {
      const enrollments = await prisma.userCourseEnrollment.findMany({
        where: { userId, isActive: true },
        select: enrollmentCourseIdView,
      });
      courseIds = enrollments.map((enrollment) => enrollment.courseId);
    }

    if (courseIds.length === 0) {
      throw new ApiError(404, "Card not found", "CARD_NOT_FOUND");
    }

    const cards = await prisma.studyCard.findMany({
      where: {
        contentId,
        courseId: { in: courseIds },
      },
      select: cardIdOnlyView,
      take: 2,
    });

    if (cards.length === 0) {
      throw new ApiError(404, "Card not found", "CARD_NOT_FOUND");
    }

    if (cards.length > 1) {
      throw new ApiError(409, "Card contentId is not unique", "CARD_CONTENT_ID_NOT_UNIQUE");
    }

    return cards[0];
  };

  const resolveQuestionById = async (
    userId: number,
    questionId: number,
    options: { courseKey?: string; requireCourseKey?: boolean } = {},
  ) => {
    const { courseKey, requireCourseKey = false } = options;
    let courseIds: number[] = [];
    if (courseKey) {
      const course = await getCourseByKey(prisma, courseKey, { userId });
      if (!course) {
        throw new ApiError(404, "Course not found", "COURSE_NOT_FOUND");
      }
      courseIds = [course.id];
    } else if (requireCourseKey) {
      metrics.courseScopeRequiredTotal.inc();
      throw new ApiError(400, "Course scope is required", "COURSE_SCOPE_REQUIRED");
    } else {
      const enrollments = await prisma.userCourseEnrollment.findMany({
        where: { userId, isActive: true },
        select: enrollmentCourseIdView,
      });
      courseIds = enrollments.map((enrollment) => enrollment.courseId);
    }

    if (courseIds.length === 0) {
      throw new ApiError(404, "Question not found", "QUESTION_NOT_FOUND");
    }

    const question = await prisma.studyQuestion.findFirst({
      where: {
        id: questionId,
        courseId: { in: courseIds },
      },
      select: questionIdOnlyView,
    });

    if (!question) {
      throw new ApiError(404, "Question not found", "QUESTION_NOT_FOUND");
    }

    return question;
  };

  // ============================================
  // 课程端点
  // ============================================

  // GET /api/study/courses - 获取课程列表
  fastify.get<{ Querystring: GetCoursesQuery }>(
    "/api/study/courses",
    {
      preHandler: [fastify.authenticate],
      schema: {
        querystring: GetCoursesQuerySchema,
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { enrolled, includeUnpublished } = request.query;
      const includeUnpublishedFlag = includeUnpublished === true;
      assertIncludeUnpublishedAllowed(includeUnpublishedFlag, config.NODE_ENV);

      let courses;
      if (enrolled) {
        courses = await getUserEnrolledCourses(prisma, userId);
      } else {
        courses = await getCourseList(prisma, {
          publishedOnly: true,
          userId,
          includeUnpublishedFallback: shouldIncludeUnpublishedFallback(
            includeUnpublishedFlag,
            config.NODE_ENV,
          ),
        });
      }

      reply.send({ courses });
    },
  );

  // GET /api/study/courses/:courseKey - 获取课程详情
  fastify.get<{ Params: CourseKeyParams }>(
    "/api/study/courses/:courseKey",
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: CourseKeyParamsSchema,
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { courseKey } = request.params;

      const course = await getCourseByKey(prisma, courseKey, { userId });

      if (!course) {
        throw new ApiError(404, "Course not found", "COURSE_NOT_FOUND");
      }

      reply.send({ course });
    },
  );

  // POST /api/study/courses/:courseKey/enroll - 注册课程
  fastify.post<{ Params: EnrollCourseParams; Body: EnrollCourseBody }>(
    "/api/study/courses/:courseKey/enroll",
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: EnrollCourseParamsSchema,
        body: EnrollCourseBodySchema,
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { courseKey } = request.params;
      const { sourceScene } = request.body;

      // 先获取课程 ID
      const course = await getCourseByKey(prisma, courseKey);
      if (!course) {
        throw new ApiError(404, "Course not found", "COURSE_NOT_FOUND");
      }

      try {
        const result = await enrollCourse(prisma, userId, course.id, sourceScene);
        reply.send(result);
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === "COURSE_NOT_FOUND") {
            throw new ApiError(404, "Course not found", "COURSE_NOT_FOUND");
          }
          if (error.message === "COURSE_NOT_PUBLISHED") {
            throw new ApiError(400, "Course is not published", "COURSE_NOT_PUBLISHED");
          }
        }
        throw error;
      }
    },
  );

  // PATCH /api/study/courses/:courseKey/exam-date - 更新考试日期
  fastify.patch<{ Params: EnrollCourseParams; Body: UpdateExamDateBody }>(
    "/api/study/courses/:courseKey/exam-date",
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: EnrollCourseParamsSchema,
        body: UpdateExamDateBodySchema,
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { courseKey } = request.params;
      const { examDate } = request.body;

      const course = await getCourseByKey(prisma, courseKey, { userId });
      if (!course) {
        throw new ApiError(404, "Course not found", "COURSE_NOT_FOUND");
      }

      if (!course.enrollment) {
        await enrollCourse(prisma, userId, course.id);
      }

      let parsedExamDate: Date | null = null;
      if (examDate !== null) {
        const date = new Date(`${examDate}T00:00:00+08:00`);
        if (Number.isNaN(date.getTime())) {
          throw new ApiError(400, "Invalid exam date", "INVALID_EXAM_DATE");
        }
        parsedExamDate = date;
      }

      const updated = await updateEnrollmentExamDate(
        prisma,
        userId,
        course.id,
        parsedExamDate,
      );

      reply.send({
        examDate: updated ? updated.toISOString() : null,
      });
    },
  );

  // ============================================
  // 卡片学习端点
  // ============================================

  // GET /api/study/today - 获取今日队列摘要
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

      // 获取课程 ID
      const course = await getCourseByKey(prisma, courseKey, { userId });
      if (!course) {
        throw new ApiError(404, "Course not found", "COURSE_NOT_FOUND");
      }

      const summary = await getTodayQueueSummary(prisma, userId, course.id);

      reply.send({ summary });
    },
  );

  // GET /api/study/dashboard - 获取复习首页聚合数据
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
        throw new ApiError(404, "Course not found", "COURSE_NOT_FOUND");
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

  // POST /api/study/start - 开始学习 session
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

      // 获取课程 ID
      const course = await getCourseByKey(prisma, courseKey, { userId });
      if (!course) {
        throw new ApiError(404, "Course not found", "COURSE_NOT_FOUND");
      }

      // 检查用户是否已注册课程，如果没有则自动注册
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

  // POST /api/study/cards/:contentId/answer - 提交卡片反馈
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
      const { rating, sessionId, courseKey, courseId } = request.body;

      const card = await resolveCardByContentId(userId, contentId, {
        courseKey,
        courseId,
        requireCourseKey: true,
      });

      // 转换 rating 字符串为枚举
      const ratingEnum = rating as FeedbackRating;

      let update;
      try {
        update = await submitCardFeedback(
          prisma,
          userId,
          card.id,
          sessionId,
          ratingEnum,
        );
      } catch (error) {
        if (error instanceof Error && error.message === "CARD_DAILY_LIMIT_REACHED") {
          throw new ApiError(429, "Card daily limit reached", "CARD_DAILY_LIMIT_REACHED");
        }
        throw error;
      }

      reply.send({
        cardId: update.cardId,
        newBoxLevel: update.newBoxLevel,
        nextDueAt: update.nextDueAt.toISOString(),
        todayShownCount: update.todayShownCount,
      });
    },
  );

  // ============================================
  // Phase 3: 刷题端点
  // ============================================

  // POST /api/study/quiz/start - 开始刷题 session
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

      // 获取课程 ID
      const course = await getCourseByKey(prisma, courseKey, { userId });
      if (!course) {
        throw new ApiError(404, "Course not found", "COURSE_NOT_FOUND");
      }

      // 检查用户是否已注册课程，如果没有则自动注册
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

  // POST /api/study/quiz/answer - 提交答题
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

      try {
        const result = await submitQuizAnswer(
          prisma,
          userId,
          questionId,
          sessionId,
          answer,
          durationMs,
        );

        reply.send(result);
      } catch (error) {
        if (error instanceof Error && error.message === "QUESTION_NOT_FOUND") {
          throw new ApiError(404, "Question not found", "QUESTION_NOT_FOUND");
        }
        throw error;
      }
    },
  );

  // GET /api/study/wrong-items - 获取错题列表
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
          throw new ApiError(404, "Course not found", "COURSE_NOT_FOUND");
        }
        courseId = course.id;
      }

      const result = await getWrongItems(prisma, userId, courseId, { limit, offset });

      reply.send({
        items: result.items.map((item) => ({
          ...item,
          lastWrongAt: item.lastWrongAt.toISOString(),
        })),
        total: result.total,
      });
    },
  );

  // DELETE /api/study/wrong-items/:questionId - 手动清除错题
  fastify.delete<{ Params: DeleteWrongItemParams }>(
    "/api/study/wrong-items/:questionId",
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: DeleteWrongItemParamsSchema,
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const questionId = parseInt(request.params.questionId, 10);

      const cleared = await clearWrongItem(prisma, userId, questionId);

      if (!cleared) {
        throw new ApiError(404, "Wrong item not found", "WRONG_ITEM_NOT_FOUND");
      }

      reply.send({ success: true });
    },
  );

  // GET /api/study/quiz/stats - 获取刷题统计
  fastify.get<{ Querystring: GetQuizStatsQuery }>(
    "/api/study/quiz/stats",
    {
      preHandler: [fastify.authenticate],
      schema: {
        querystring: GetQuizStatsQuerySchema,
      },
    },
    async (request, reply) => {
      const userId = request.user!.userId;
      const { courseKey } = request.query;

      let courseId: number | undefined;
      if (courseKey) {
        const course = await getCourseByKey(prisma, courseKey, { userId });
        if (!course) {
          throw new ApiError(404, "Course not found", "COURSE_NOT_FOUND");
        }
        courseId = course.id;
      }

      const stats = await getQuizStats(prisma, userId, courseId);

      reply.send({ stats });
    },
  );

  // ============================================
  // Phase 4: 急救包端点
  // ============================================

  // GET /api/study/cheatsheets - 获取急救包列表
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

      // 获取课程 ID
      const course = await getCourseByKey(prisma, courseKey, { userId });
      if (!course) {
        throw new ApiError(404, "Course not found", "COURSE_NOT_FOUND");
      }

      const sheets = await getCheatSheets(prisma, course.id, unitId);

      reply.send({ cheatsheets: sheets });
    },
  );

  // GET /api/study/cheatsheets/:id - 获取急救包详情
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
        throw new ApiError(404, "Cheatsheet not found", "CHEATSHEET_NOT_FOUND");
      }

      reply.send({ cheatsheet: sheet });
    },
  );

  // ============================================
  // Phase 4: 纠错反馈端点
  // ============================================

  // POST /api/study/feedback - 提交纠错反馈
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

      // 获取课程 ID
      const course = await getCourseByKey(prisma, courseKey, { userId });
      if (!course) {
        throw new ApiError(404, "Course not found", "COURSE_NOT_FOUND");
      }

      // 验证至少有一个目标
      if (!cardId && !questionId) {
        throw new ApiError(400, "Either cardId or questionId is required", "FEEDBACK_TARGET_REQUIRED");
      }

      if (cardId) {
        const card = await prisma.studyCard.findFirst({
          where: {
            id: cardId,
            courseId: course.id,
          },
          select: cardIdOnlyView,
        });
        if (!card) {
          throw new ApiError(404, "Card not found", "CARD_NOT_FOUND");
        }
      }

      if (questionId) {
        const question = await prisma.studyQuestion.findFirst({
          where: {
            id: questionId,
            courseId: course.id,
          },
          select: questionIdOnlyView,
        });
        if (!question) {
          throw new ApiError(404, "Question not found", "QUESTION_NOT_FOUND");
        }
      }

      try {
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
      } catch (error) {
        if (error instanceof Error && error.message === "FEEDBACK_TARGET_REQUIRED") {
          throw new ApiError(400, "Either cardId or questionId is required", "FEEDBACK_TARGET_REQUIRED");
        }
        throw error;
      }
    },
  );

  // GET /api/study/feedback - 获取用户的反馈列表
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

  // ============================================
  // Phase 4.5: 星标收藏端点
  // ============================================

  // POST /api/study/star - 星标收藏
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

  // DELETE /api/study/star - 取消星标
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

  // GET /api/study/starred-items - 获取星标列表
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
          throw new ApiError(404, "Course not found", "COURSE_NOT_FOUND");
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

  // ============================================
  // 复习提醒订阅端点
  // ============================================

  // GET /api/study/reminders/config - 获取提醒模板配置
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

  // POST /api/study/reminders/subscribe - 订阅或拒绝提醒
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
        nextSendAt: subscription.nextSendAt
          ? subscription.nextSendAt.toISOString()
          : null,
      });
    },
  );

  // GET /api/study/reminders/status - 获取提醒订阅状态
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

      const resolvedTemplateId = templateId || config.STUDY_REMINDER_TEMPLATE_ID || undefined;
      const status = await getStudyReminderStatus(prisma, userId, resolvedTemplateId);

      reply.send({
        status: status.status,
        templateId: status.templateId,
        lastSentAt: status.lastSentAt ? status.lastSentAt.toISOString() : null,
        nextSendAt: status.nextSendAt ? status.nextSendAt.toISOString() : null,
      });
    },
  );

  // ============================================
  // Phase 5: Streak 与周榜端点
  // ============================================

  // GET /api/study/streak - 获取当前用户连续学习信息
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

  // GET /api/study/leaderboard - 获取周榜
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

      // 如果指定了 courseKey，获取课程 ID (当前未使用，预留)
      let courseId: number | undefined;
      if (courseKey) {
        const course = await getCourseByKey(prisma, courseKey);
        if (!course) {
          throw new ApiError(404, "Course not found", "COURSE_NOT_FOUND");
        }
        courseId = course.id;
      }

      // 获取周榜
      const items = await getWeeklyLeaderboard(prisma, courseId, limit);

      // 获取当前用户排名
      const myRank = await getUserRank(prisma, userId);

      // 获取当前用户的 streak 信息
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

  // ============================================
  // Phase 5.5: 学习活动历史端点（热力图）
  // ============================================

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
        throw new ApiError(400, "activityDate 无效", "INVALID_ACTIVITY_DATE");
      }

      const beijingNow = getBeijingNow();
      const todayDateOnlyUtc = new Date(
        Date.UTC(beijingNow.getFullYear(), beijingNow.getMonth(), beijingNow.getDate()),
      );

      const maxBackfillDays = 7;
      const minDateOnlyUtc = new Date(
        todayDateOnlyUtc.getTime() - (maxBackfillDays - 1) * 24 * 60 * 60 * 1000,
      );

      if (activityDateOnlyUtc.getTime() > todayDateOnlyUtc.getTime()) {
        throw new ApiError(400, "activityDate 不能是未来日期", "ACTIVITY_DATE_IN_FUTURE");
      }
      if (activityDateOnlyUtc.getTime() < minDateOnlyUtc.getTime()) {
        throw new ApiError(400, "activityDate 超出允许回填范围", "ACTIVITY_DATE_TOO_OLD");
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

  // GET /api/study/activity-history - 获取学习活动历史（热力图数据）
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
      const days = request.query.days || 35; // 默认35天（5周）

      const history = await getActivityHistory(prisma, userId, days);

      reply.send({
        days: history.days,
        totalDays: history.totalDays,
        totalDurationSeconds: history.totalDurationSeconds,
      });
    },
  );

  // ============================================
  // Phase 6: 管理员导入端点
  // ============================================

  // POST /api/study/admin/import - 导入课程包 (STAFF only)
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

      // 构建 CoursePackage 对象
      const cardsMap = new Map<string, Array<{ contentId: string; front: string; back: string; tags?: string; difficulty?: number }>>();
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
            }))
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
        cheatsheets: cheatsheets?.map((cs) => ({
          title: cs.title,
          assetType: cs.assetType,
          url: "url" in cs ? cs.url : undefined,
          content: "content" in cs ? cs.content : undefined,
          contentFormat: "contentFormat" in cs && cs.contentFormat ? cs.contentFormat : undefined,
          unitKey: cs.unitKey,
          version: cs.version,
        })) || [],
      };

      // 使用事务执行导入
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

  // GET /api/study/admin/courses/:courseKey/versions - 获取课程版本列表 (STAFF only)
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

  // PATCH /api/study/admin/courses/:id/status - 更新课程状态 (STAFF only)
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

      // 验证课程存在
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

export default studyRoutes;
