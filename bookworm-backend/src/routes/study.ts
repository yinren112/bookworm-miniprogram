// src/routes/study.ts
// 复习系统路由
import { FastifyPluginAsync } from "fastify";
import { FeedbackRating, FeedbackReasonType } from "@prisma/client";
import prisma from "../db";
import { cardIdOnlyView, courseIdOnlyView } from "../db/views";
import { ApiError } from "../errors";
import { CourseStatus } from "@prisma/client";
import {
  getCourseList,
  getCourseByKey,
  enrollCourse,
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
  // Phase 5: Streak & Leaderboard
  getStreakInfo,
  getWeeklyLeaderboard,
  getUserRank,
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
  TodayQueueQuerySchema,
  TodayQueueQuery,
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
  // Phase 5 schemas
  LeaderboardQuerySchema,
  LeaderboardQuery,
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
      const { enrolled } = request.query;

      let courses;
      if (enrolled) {
        courses = await getUserEnrolledCourses(prisma, userId);
      } else {
        courses = await getCourseList(prisma, {
          publishedOnly: true,
          userId,
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

      const course = await getCourseByKey(prisma, courseKey, userId);

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
      const course = await getCourseByKey(prisma, courseKey);
      if (!course) {
        throw new ApiError(404, "Course not found", "COURSE_NOT_FOUND");
      }

      const summary = await getTodayQueueSummary(prisma, userId, course.id);

      reply.send({ summary });
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
      const course = await getCourseByKey(prisma, courseKey);
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
      const { rating, sessionId } = request.body;

      // 根据 contentId 查找卡片
      const card = await prisma.studyCard.findFirst({
        where: { contentId },
        select: cardIdOnlyView,
      });

      if (!card) {
        throw new ApiError(404, "Card not found", "CARD_NOT_FOUND");
      }

      // 转换 rating 字符串为枚举
      const ratingEnum = rating as FeedbackRating;

      const update = await submitCardFeedback(
        prisma,
        userId,
        card.id,
        sessionId,
        ratingEnum,
      );

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
      const course = await getCourseByKey(prisma, courseKey);
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
        const course = await getCourseByKey(prisma, courseKey);
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
        const course = await getCourseByKey(prisma, courseKey);
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
      const { courseKey, unitId } = request.query;

      // 获取课程 ID
      const course = await getCourseByKey(prisma, courseKey);
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
      const course = await getCourseByKey(prisma, courseKey);
      if (!course) {
        throw new ApiError(404, "Course not found", "COURSE_NOT_FOUND");
      }

      // 验证至少有一个目标
      if (!cardId && !questionId) {
        throw new ApiError(400, "Either cardId or questionId is required", "FEEDBACK_TARGET_REQUIRED");
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
          url: cs.url,
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
