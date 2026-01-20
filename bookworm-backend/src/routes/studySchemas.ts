// src/routes/studySchemas.ts
// 复习系统 TypeBox Schema 定义
import { Type, Static } from "@sinclair/typebox";

// ============================================
// 枚举 Schema
// ============================================

export const FeedbackRatingSchema = Type.Union([
  Type.Literal("FORGOT"),
  Type.Literal("FUZZY"),
  Type.Literal("KNEW"),
  Type.Literal("PERFECT"),
]);

export type FeedbackRatingType = Static<typeof FeedbackRatingSchema>;

// ============================================
// 请求 Schema
// ============================================

// GET /api/study/courses
export const GetCoursesQuerySchema = Type.Object({
  enrolled: Type.Optional(Type.Boolean({ description: "只返回已注册课程" })),
});

// GET /api/study/courses/:courseKey
export const CourseKeyParamsSchema = Type.Object({
  courseKey: Type.String({ minLength: 1, maxLength: 100 }),
});

// POST /api/study/courses/:courseKey/enroll
export const EnrollCourseParamsSchema = Type.Object({
  courseKey: Type.String({ minLength: 1, maxLength: 100 }),
});

export const EnrollCourseBodySchema = Type.Object({
  sourceScene: Type.Optional(Type.String({ maxLength: 32 })),
});

// GET /api/study/today
export const TodayQueueQuerySchema = Type.Object({
  courseKey: Type.String({ minLength: 1, maxLength: 100 }),
});

// POST /api/study/start
export const StartSessionBodySchema = Type.Object({
  courseKey: Type.String({ minLength: 1, maxLength: 100 }),
  unitId: Type.Optional(Type.Integer({ minimum: 1 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50, default: 20 })),
});

// POST /api/study/cards/:contentId/answer
export const CardAnswerParamsSchema = Type.Object({
  contentId: Type.String({ minLength: 1, maxLength: 100 }),
});

export const CardAnswerBodySchema = Type.Object({
  sessionId: Type.String({
    pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    description: "Session UUID v4",
  }),
  rating: FeedbackRatingSchema,
});

// ============================================
// 响应 Schema
// ============================================

export const CourseListItemSchema = Type.Object({
  id: Type.Integer(),
  courseKey: Type.String(),
  title: Type.String(),
  description: Type.Union([Type.String(), Type.Null()]),
  totalCards: Type.Integer(),
  totalQuestions: Type.Integer(),
  status: Type.String(),
  enrolled: Type.Optional(Type.Boolean()),
  lastStudiedAt: Type.Optional(Type.Union([Type.String({ format: "date-time" }), Type.Null()])),
});

export const UnitListItemSchema = Type.Object({
  id: Type.Integer(),
  unitKey: Type.String(),
  title: Type.String(),
  orderIndex: Type.Integer(),
  cardCount: Type.Integer(),
  questionCount: Type.Integer(),
});

export const CourseDetailSchema = Type.Object({
  id: Type.Integer(),
  courseKey: Type.String(),
  title: Type.String(),
  description: Type.Union([Type.String(), Type.Null()]),
  contentVersion: Type.Integer(),
  totalCards: Type.Integer(),
  totalQuestions: Type.Integer(),
  units: Type.Array(UnitListItemSchema),
  enrollment: Type.Optional(Type.Union([
    Type.Object({
      enrolledAt: Type.String({ format: "date-time" }),
      lastStudiedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
      completedCards: Type.Integer(),
    }),
    Type.Null(),
  ])),
});

export const TodayQueueSummarySchema = Type.Object({
  dueCards: Type.Integer(),
  newCards: Type.Integer(),
  reviewedToday: Type.Integer(),
  estimatedMinutes: Type.Integer(),
});

export const CardItemSchema = Type.Object({
  id: Type.Integer(),
  contentId: Type.String(),
  front: Type.String(),
  back: Type.String(),
  tags: Type.Union([Type.String(), Type.Null()]),
  difficulty: Type.Integer(),
  boxLevel: Type.Integer(),
  isNew: Type.Boolean(),
});

export const CardSessionSchema = Type.Object({
  sessionId: Type.String(),
  cards: Type.Array(CardItemSchema),
  totalCount: Type.Integer(),
});

export const CardStateUpdateSchema = Type.Object({
  cardId: Type.Integer(),
  newBoxLevel: Type.Integer(),
  nextDueAt: Type.String({ format: "date-time" }),
  todayShownCount: Type.Integer(),
});

// ============================================
// 刷题 Schema (Phase 3)
// ============================================

export const QuestionTypeSchema = Type.Union([
  Type.Literal("SINGLE_CHOICE"),
  Type.Literal("MULTI_CHOICE"),
  Type.Literal("TRUE_FALSE"),
  Type.Literal("FILL_BLANK"),
]);

export const FeedbackReasonSchema = Type.Union([
  Type.Literal("ANSWER_ERROR"),
  Type.Literal("STEM_AMBIGUOUS"),
  Type.Literal("EXPLANATION_UNCLEAR"),
  Type.Literal("FORMAT_ERROR"),
  Type.Literal("OTHER"),
]);

// POST /api/study/quiz/start
export const StartQuizBodySchema = Type.Object({
  courseKey: Type.String({ minLength: 1, maxLength: 100 }),
  unitId: Type.Optional(Type.Integer({ minimum: 1 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50, default: 10 })),
  wrongItemsOnly: Type.Optional(Type.Boolean({ default: false })),
});

// POST /api/study/quiz/answer
export const SubmitQuizAnswerBodySchema = Type.Object({
  sessionId: Type.String({
    pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
  }),
  questionId: Type.Integer({ minimum: 1 }),
  answer: Type.String({ minLength: 1, maxLength: 500 }),
  durationMs: Type.Optional(Type.Integer({ minimum: 0 })),
});

// GET /api/study/wrong-items
export const GetWrongItemsQuerySchema = Type.Object({
  courseKey: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50, default: 20 })),
  offset: Type.Optional(Type.Integer({ minimum: 0, default: 0 })),
});

// DELETE /api/study/wrong-items/:questionId
export const DeleteWrongItemParamsSchema = Type.Object({
  questionId: Type.String({ pattern: "^\\d+$" }),
});

// GET /api/study/quiz/stats
export const GetQuizStatsQuerySchema = Type.Object({
  courseKey: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
});

// 刷题响应 Schema
export const QuestionItemSchema = Type.Object({
  id: Type.Integer(),
  contentId: Type.String(),
  questionType: QuestionTypeSchema,
  stem: Type.String(),
  options: Type.Unknown(),
  difficulty: Type.Integer(),
});

export const QuizSessionResponseSchema = Type.Object({
  sessionId: Type.String(),
  questions: Type.Array(QuestionItemSchema),
  totalCount: Type.Integer(),
});

export const SubmitAnswerResponseSchema = Type.Object({
  questionId: Type.Integer(),
  isCorrect: Type.Boolean(),
  correctAnswer: Type.String(),
  explanation: Type.Union([Type.String(), Type.Null()]),
  wrongCount: Type.Integer(),
});

export const WrongItemSchema = Type.Object({
  questionId: Type.Integer(),
  contentId: Type.String(),
  stem: Type.String(),
  questionType: QuestionTypeSchema,
  wrongCount: Type.Integer(),
  lastWrongAt: Type.String({ format: "date-time" }),
});

export const QuizStatsSchema = Type.Object({
  totalAttempts: Type.Integer(),
  correctCount: Type.Integer(),
  wrongItemCount: Type.Integer(),
  accuracy: Type.Integer(),
});

// ============================================
// 急救包 Schema (Phase 4)
// ============================================

// GET /api/study/cheatsheets
export const GetCheatSheetsQuerySchema = Type.Object({
  courseKey: Type.String({ minLength: 1, maxLength: 100 }),
  unitId: Type.Optional(Type.Integer({ minimum: 1 })),
});

// GET /api/study/cheatsheets/:id
export const CheatSheetParamsSchema = Type.Object({
  id: Type.String({ pattern: "^\\d+$" }),
});

export const CheatSheetSchema = Type.Object({
  id: Type.Integer(),
  title: Type.String(),
  assetType: Type.String(),
  url: Type.String(),
  version: Type.Integer(),
  sortOrder: Type.Integer(),
  unit: Type.Union([
    Type.Object({
      id: Type.Integer(),
      title: Type.String(),
      unitKey: Type.String(),
    }),
    Type.Null(),
  ]),
});

// ============================================
// 纠错反馈 Schema (Phase 4)
// ============================================

// POST /api/study/feedback
export const CreateFeedbackBodySchema = Type.Object({
  courseKey: Type.String({ minLength: 1, maxLength: 100 }),
  cardId: Type.Optional(Type.Integer({ minimum: 1 })),
  questionId: Type.Optional(Type.Integer({ minimum: 1 })),
  reason: FeedbackReasonSchema,
  message: Type.String({ minLength: 1, maxLength: 1000 }),
});

// GET /api/study/feedback
export const GetFeedbacksQuerySchema = Type.Object({
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50, default: 20 })),
  offset: Type.Optional(Type.Integer({ minimum: 0, default: 0 })),
});

export const FeedbackStatusSchema = Type.Union([
  Type.Literal("PENDING"),
  Type.Literal("REVIEWED"),
  Type.Literal("RESOLVED"),
  Type.Literal("REJECTED"),
]);

export const FeedbackRecordSchema = Type.Object({
  id: Type.Integer(),
  reason: FeedbackReasonSchema,
  message: Type.String(),
  status: FeedbackStatusSchema,
  createdAt: Type.String({ format: "date-time" }),
  resolvedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
  targetType: Type.Union([Type.Literal("card"), Type.Literal("question")]),
  targetId: Type.Union([Type.Integer(), Type.Null()]),
});

// ============================================
// 导出类型
// ============================================

export type GetCoursesQuery = Static<typeof GetCoursesQuerySchema>;
export type CourseKeyParams = Static<typeof CourseKeyParamsSchema>;
export type EnrollCourseParams = Static<typeof EnrollCourseParamsSchema>;
export type EnrollCourseBody = Static<typeof EnrollCourseBodySchema>;
export type TodayQueueQuery = Static<typeof TodayQueueQuerySchema>;
export type StartSessionBody = Static<typeof StartSessionBodySchema>;
export type CardAnswerParams = Static<typeof CardAnswerParamsSchema>;
export type CardAnswerBody = Static<typeof CardAnswerBodySchema>;

// Phase 3 types
export type StartQuizBody = Static<typeof StartQuizBodySchema>;
export type SubmitQuizAnswerBody = Static<typeof SubmitQuizAnswerBodySchema>;
export type GetWrongItemsQuery = Static<typeof GetWrongItemsQuerySchema>;
export type DeleteWrongItemParams = Static<typeof DeleteWrongItemParamsSchema>;
export type GetQuizStatsQuery = Static<typeof GetQuizStatsQuerySchema>;

// Phase 4 types
export type GetCheatSheetsQuery = Static<typeof GetCheatSheetsQuerySchema>;
export type CheatSheetParams = Static<typeof CheatSheetParamsSchema>;
export type CreateFeedbackBody = Static<typeof CreateFeedbackBodySchema>;
export type GetFeedbacksQuery = Static<typeof GetFeedbacksQuerySchema>;

// ============================================
// Streak 与周榜 Schema (Phase 5)
// ============================================

// GET /api/study/streak
export const StreakInfoResponseSchema = Type.Object({
  currentStreak: Type.Integer({ minimum: 0 }),
  bestStreak: Type.Integer({ minimum: 0 }),
  weeklyPoints: Type.Integer({ minimum: 0 }),
  lastStudyDate: Type.Union([Type.String({ format: "date" }), Type.Null()]),
  isStudiedToday: Type.Boolean(),
});

// GET /api/study/leaderboard
export const LeaderboardQuerySchema = Type.Object({
  courseKey: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 50 })),
});

export const LeaderboardEntrySchema = Type.Object({
  rank: Type.Integer({ minimum: 1 }),
  userId: Type.Integer(),
  nickname: Type.String(),
  avatarUrl: Type.Union([Type.String(), Type.Null()]),
  weeklyPoints: Type.Integer({ minimum: 0 }),
  currentStreak: Type.Integer({ minimum: 0 }),
});

export const LeaderboardResponseSchema = Type.Object({
  items: Type.Array(LeaderboardEntrySchema),
  myRank: Type.Union([Type.Integer(), Type.Null()]),
  myStreak: Type.Optional(StreakInfoResponseSchema),
});

// Phase 5 types
export type LeaderboardQuery = Static<typeof LeaderboardQuerySchema>;
export type StreakInfoResponse = Static<typeof StreakInfoResponseSchema>;
export type LeaderboardResponse = Static<typeof LeaderboardResponseSchema>;

// ============================================
// 课程包导入 Schema (Phase 6)
// ============================================

// 课程包 manifest.json 格式
export const CourseManifestSchema = Type.Object({
  courseKey: Type.String({ minLength: 1, maxLength: 100 }),
  title: Type.String({ minLength: 1, maxLength: 255 }),
  description: Type.Optional(Type.String({ maxLength: 2000 })),
  contentVersion: Type.Integer({ minimum: 1 }),
  locale: Type.Optional(Type.String({ default: "zh-CN" })),
});

// 章节定义格式
export const UnitDefinitionSchema = Type.Object({
  unitKey: Type.String({ minLength: 1, maxLength: 100 }),
  title: Type.String({ minLength: 1, maxLength: 255 }),
  orderIndex: Type.Integer({ minimum: 0 }),
});

// POST /api/study/admin/import
export const ImportCourseBodySchema = Type.Object({
  manifest: CourseManifestSchema,
  units: Type.Array(UnitDefinitionSchema, { minItems: 1 }),
  cards: Type.Optional(Type.Record(
    Type.String(), // unitKey
    Type.Array(Type.Object({
      contentId: Type.String({ minLength: 1, maxLength: 100 }),
      front: Type.String({ minLength: 1 }),
      back: Type.String({ minLength: 1 }),
      tags: Type.Optional(Type.String({ maxLength: 255 })),
      difficulty: Type.Optional(Type.Integer({ minimum: 1, maximum: 5 })),
    }))
  )),
  questions: Type.Optional(Type.Record(
    Type.String(), // unitKey
    Type.Array(Type.Object({
      contentId: Type.String({ minLength: 1, maxLength: 100 }),
      questionType: QuestionTypeSchema,
      stem: Type.String({ minLength: 1 }),
      options: Type.Optional(Type.Array(Type.String())),
      answer: Type.String({ minLength: 1 }),
      explanation: Type.Optional(Type.String()),
      difficulty: Type.Optional(Type.Integer({ minimum: 1, maximum: 5 })),
    }))
  )),
  cheatsheets: Type.Optional(Type.Array(Type.Object({
    title: Type.String({ minLength: 1, maxLength: 255 }),
    assetType: Type.Union([Type.Literal("pdf"), Type.Literal("image")]),
    url: Type.String({ minLength: 1, maxLength: 500 }),
    unitKey: Type.Optional(Type.String({ maxLength: 100 })),
    version: Type.Optional(Type.Integer({ minimum: 1 })),
  }))),
  options: Type.Optional(Type.Object({
    dryRun: Type.Optional(Type.Boolean({ default: false })),
    overwriteContent: Type.Optional(Type.Boolean({ default: false })),
    publishOnImport: Type.Optional(Type.Boolean({ default: false })),
  })),
});

// 导入结果响应
export const ImportResultSchema = Type.Object({
  success: Type.Boolean(),
  courseId: Type.Union([Type.Integer(), Type.Null()]),
  stats: Type.Object({
    unitsCreated: Type.Integer(),
    unitsUpdated: Type.Integer(),
    cardsCreated: Type.Integer(),
    cardsUpdated: Type.Integer(),
    questionsCreated: Type.Integer(),
    questionsUpdated: Type.Integer(),
    cheatsheetsCreated: Type.Integer(),
  }),
  errors: Type.Array(Type.String()),
  warnings: Type.Array(Type.String()),
});

// GET /api/study/admin/courses/:courseKey/versions
export const CourseVersionsParamsSchema = Type.Object({
  courseKey: Type.String({ minLength: 1, maxLength: 100 }),
});

export const CourseVersionInfoSchema = Type.Object({
  id: Type.Integer(),
  courseKey: Type.String(),
  contentVersion: Type.Integer(),
  title: Type.String(),
  status: Type.String(),
  totalCards: Type.Integer(),
  totalQuestions: Type.Integer(),
  createdAt: Type.String({ format: "date-time" }),
});

// PATCH /api/study/admin/courses/:id/status
export const UpdateCourseStatusParamsSchema = Type.Object({
  id: Type.String({ pattern: "^\\d+$" }),
});

export const UpdateCourseStatusBodySchema = Type.Object({
  status: Type.Union([
    Type.Literal("DRAFT"),
    Type.Literal("PUBLISHED"),
    Type.Literal("ARCHIVED"),
  ]),
});

// Phase 6 types
export type ImportCourseBody = Static<typeof ImportCourseBodySchema>;
export type CourseVersionsParams = Static<typeof CourseVersionsParamsSchema>;
export type UpdateCourseStatusParams = Static<typeof UpdateCourseStatusParamsSchema>;
export type UpdateCourseStatusBody = Static<typeof UpdateCourseStatusBodySchema>;
