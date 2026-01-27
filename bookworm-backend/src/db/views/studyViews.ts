// src/db/views/studyViews.ts
// Study 模块数据访问视图选择器

import type { Prisma } from "@prisma/client";
import { userIdView } from "./userViews";

// ============================================
// StudyCourse 视图选择器
// ============================================

/**
 * 公开课程信息（列表展示用）
 * Used by: getCourseList, getCourseByKey
 */
export const courseSelectPublic = {
  id: true,
  courseKey: true,
  title: true,
  description: true,
  contentVersion: true,
  locale: true,
  status: true,
  totalCards: true,
  totalQuestions: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.StudyCourseSelect;

/**
 * 课程 ID + 状态（导入检查用）
 * Used by: importCoursePackage
 */
export const courseIdStatusView = {
  id: true,
  status: true,
} as const satisfies Prisma.StudyCourseSelect;

/**
 * 课程 ID + 状态 + 课程 key（注册与权限校验用）
 * Used by: courseService enrollCourse
 */
export const courseIdStatusKeyView = {
  id: true,
  status: true,
  courseKey: true,
} as const satisfies Prisma.StudyCourseSelect;

/**
 * 课程版本信息（版本列表用）
 * Used by: listCourseVersions
 */
export const courseVersionView = {
  id: true,
  courseKey: true,
  contentVersion: true,
  title: true,
  status: true,
  totalCards: true,
  totalQuestions: true,
  createdAt: true,
} as const satisfies Prisma.StudyCourseSelect;

/**
 * 课程 ID + 版本号（版本比较用）
 * Used by: importCoursePackage
 */
export const courseIdVersionView = {
  id: true,
  contentVersion: true,
} as const satisfies Prisma.StudyCourseSelect;

/**
 * 仅课程 ID
 * Used by: study.ts routes
 */
export const courseIdOnlyView = {
  id: true,
} as const satisfies Prisma.StudyCourseSelect;

/**
 * 仅课程 key
 * Used by: importService, courseService
 */
export const courseKeyOnlyView = {
  courseKey: true,
} as const satisfies Prisma.StudyCourseSelect;

// ============================================
// StudyUnit 视图选择器
// ============================================

/**
 * 公开章节信息
 * Used by: courseService
 */
export const unitSelectPublic = {
  id: true,
  unitKey: true,
  title: true,
  orderIndex: true,
} as const satisfies Prisma.StudyUnitSelect;

/**
 * 仅章节 ID
 * Used by: importCoursePackage
 */
export const unitIdOnlyView = {
  id: true,
} as const satisfies Prisma.StudyUnitSelect;

/**
 * 章节基本信息（cheatsheet 用）
 * Used by: cheatsheetService
 */
export const unitBasicView = {
  id: true,
  title: true,
  unitKey: true,
} as const satisfies Prisma.StudyUnitSelect;

export const unitWithCountsView = {
  id: true,
  unitKey: true,
  title: true,
  orderIndex: true,
  _count: {
    select: {
      cards: true,
      questions: true,
    },
  },
} as const satisfies Prisma.StudyUnitSelect;

// ============================================
// StudyCard 视图选择器
// ============================================

/**
 * 公开卡片信息（学习展示用）
 * Used by: cardScheduler, courseService
 */
export const cardSelectPublic = {
  id: true,
  contentId: true,
  front: true,
  back: true,
  tags: true,
  difficulty: true,
  sortOrder: true,
} as const satisfies Prisma.StudyCardSelect;

/**
 * 仅卡片 ID
 * Used by: study.ts routes, importCoursePackage
 */
export const cardIdOnlyView = {
  id: true,
} as const satisfies Prisma.StudyCardSelect;

/**
 * 仅卡片 contentId
 * Used by: starService
 */
export const cardContentIdView = {
  contentId: true,
} as const satisfies Prisma.StudyCardSelect;

/**
 * 卡片课程 ID（关联查询用）
 * Used by: cardScheduler
 */
export const cardCourseIdView = {
  courseId: true,
} as const satisfies Prisma.StudyCardSelect;

// ============================================
// StudyQuestion 视图选择器
// ============================================

/**
 * 公开题目信息（刷题展示用，不含答案）
 * Used by: quizService startQuizSession
 */
export const questionSelectPublic = {
  id: true,
  contentId: true,
  questionType: true,
  stem: true,
  optionsJson: true,
  difficulty: true,
  sortOrder: true,
} as const satisfies Prisma.StudyQuestionSelect;

/**
 * 题目详情（含答案，提交后返回用）
 * Used by: quizService submitQuizAnswer
 */
export const questionSelectWithAnswer = {
  id: true,
  contentId: true,
  questionType: true,
  stem: true,
  optionsJson: true,
  difficulty: true,
  sortOrder: true,
  answerJson: true,
  explanationShort: true,
} as const satisfies Prisma.StudyQuestionSelect;

/**
 * 仅题目 ID
 * Used by: importCoursePackage
 */
export const questionIdOnlyView = {
  id: true,
} as const satisfies Prisma.StudyQuestionSelect;

/**
 * 错题列表用题目信息
 * Used by: quizService getWrongItems
 */
export const questionWrongItemView = {
  id: true,
  contentId: true,
  stem: true,
  questionType: true,
} as const satisfies Prisma.StudyQuestionSelect;

// ============================================
// StudyCheatSheet 视图选择器
// ============================================

/**
 * 急救包公开信息
 * Used by: cheatsheetService
 */
export const cheatsheetSelectPublic = {
  id: true,
  title: true,
  assetType: true,
  url: true,
  contentFormat: true,
  version: true,
  sortOrder: true,
  unitId: true,
} as const satisfies Prisma.StudyCheatSheetSelect;

/**
 * 急救包 ID
 * Used by: importService
 */
export const cheatsheetIdView = {
  id: true,
} as const satisfies Prisma.StudyCheatSheetSelect;

export const cheatsheetSummaryView = {
  ...cheatsheetSelectPublic,
  unit: {
    select: unitBasicView,
  },
} as const satisfies Prisma.StudyCheatSheetSelect;

/**
 * 急救包详情（含课程信息）
 * Used by: cheatsheetService getCheatSheetById
 */
export const cheatsheetCourseView = {
  id: true,
  title: true,
  courseKey: true,
} as const satisfies Prisma.StudyCourseSelect;

export const cheatsheetDetailView = {
  ...cheatsheetSelectPublic,
  content: true,
  unit: {
    select: unitBasicView,
  },
  course: {
    select: cheatsheetCourseView,
  },
} as const satisfies Prisma.StudyCheatSheetSelect;

// ============================================
// UserCourseEnrollment 视图选择器
// ============================================

/**
 * 注册基本信息（列表用）
 * Used by: courseService getCourseList
 */
export const enrollmentLastStudiedView = {
  enrolledAt: true,
  lastStudiedAt: true,
} as const satisfies Prisma.UserCourseEnrollmentSelect;

/**
 * 注册完整信息
 * Used by: courseService
 */
export const enrollmentSelectPublic = {
  enrolledAt: true,
  lastStudiedAt: true,
  completedCards: true,
  examDate: true,
} as const satisfies Prisma.UserCourseEnrollmentSelect;

export const enrollmentCourseIdView = {
  courseId: true,
} as const satisfies Prisma.UserCourseEnrollmentSelect;

export const enrollmentCourseProgressView = {
  courseId: true,
  lastStudiedAt: true,
} as const satisfies Prisma.UserCourseEnrollmentSelect;

export const enrollmentWithCourseView = {
  lastStudiedAt: true,
  course: {
    select: courseSelectPublic,
  },
} as const satisfies Prisma.UserCourseEnrollmentSelect;

export const enrollmentCourseKeyView = {
  lastStudiedAt: true,
  course: {
    select: courseKeyOnlyView,
  },
} as const satisfies Prisma.UserCourseEnrollmentSelect;

// ============================================
// UserCardState 视图选择器
// ============================================

/**
 * 卡片状态 ID 视图
 * Used by: cardScheduler
 */
export const cardStateIdView = {
  cardId: true,
} as const satisfies Prisma.UserCardStateSelect;

/**
 * 卡片排程视图
 * Used by: cardScheduler isCardMaxedOutToday
 */
export const cardStateScheduleView = {
  todayShownCount: true,
  lastAnsweredAt: true,
} as const satisfies Prisma.UserCardStateSelect;

/**
 * 卡片状态（用于 session）
 * Used by: cardScheduler startCardSession
 */
export const cardStateSessionView = {
  cardId: true,
  boxLevel: true,
} as const satisfies Prisma.UserCardStateSelect;

export const cardStateActivityView = {
  lastAnsweredAt: true,
} as const satisfies Prisma.UserCardStateSelect;

export const questionAttemptActivityView = {
  attemptedAt: true,
} as const satisfies Prisma.UserQuestionAttemptSelect;

export const questionAttemptQuestionIdView = {
  questionId: true,
} as const satisfies Prisma.UserQuestionAttemptSelect;

// ============================================
// UserStudyStreak 视图选择器（周榜用）
// ============================================

/**
 * 周榜用户信息
 * Used by: streakService getWeeklyLeaderboard
 */
export const userLeaderboardView = {
  id: true,
  nickname: true,
  avatar_url: true,
} as const satisfies Prisma.UserSelect;

// ============================================
// StudyFeedback 视图选择器
// ============================================

/**
 * 反馈课程标题视图
 * Used by: feedbackService getPendingFeedbacks
 */
export const feedbackCourseTitleView = {
  title: true,
} as const satisfies Prisma.StudyCourseSelect;

// ============================================
// Include 对象（用于嵌套查询）
// ============================================

/**
 * 急救包带章节信息的 include
 * Used by: cheatsheetService
 */
export const cheatsheetWithUnitInclude = {
  unit: {
    select: unitBasicView,
  },
} as const satisfies Prisma.StudyCheatSheetInclude;

/**
 * 急救包带章节和课程信息的 include（详情页用）
 * Used by: cheatsheetService getCheatSheetById
 */
export const cheatsheetDetailInclude = {
  unit: {
    select: unitBasicView,
  },
  course: {
    select: cheatsheetCourseView,
  },
} as const satisfies Prisma.StudyCheatSheetInclude;

/**
 * 错题带题目信息的 include
 * Used by: quizService
 */
export const wrongItemWithQuestionInclude = {
  question: {
    select: questionSelectPublic,
  },
} as const satisfies Prisma.UserWrongItemInclude;

/**
 * 错题列表带题目基本信息的 include
 * Used by: quizService getWrongItems
 */
export const wrongItemListInclude = {
  question: {
    select: questionWrongItemView,
  },
} as const satisfies Prisma.UserWrongItemInclude;

/**
 * 反馈带课程标题的 include
 * Used by: feedbackService getPendingFeedbacks
 */
export const feedbackWithCourseInclude = {
  course: {
    select: feedbackCourseTitleView,
  },
} as const satisfies Prisma.StudyFeedbackInclude;

/**
 * 周榜带用户信息的 include
 * Used by: streakService getWeeklyLeaderboard
 */
export const streakWithUserInclude = {
  user: {
    select: userLeaderboardView,
  },
} as const satisfies Prisma.UserStudyStreakInclude;

/**
 * 卡片状态带卡片信息（用于 session）
 * Used by: cardScheduler startCardSession
 */
export const cardStateWithCardInclude = {
  card: {
    select: cardSelectPublic,
  },
} as const satisfies Prisma.UserCardStateInclude;

export const reminderSubscriptionWithUserInclude = {
  user: {
    select: userIdView,
  },
} as const satisfies Prisma.StudyReminderSubscriptionInclude;

export const dailyStudyActivityHistoryView = {
  date: true,
  cardDurationSeconds: true,
  quizDurationSeconds: true,
  cheatsheetDurationSeconds: true,
} as const satisfies Prisma.DailyStudyActivitySelect;
