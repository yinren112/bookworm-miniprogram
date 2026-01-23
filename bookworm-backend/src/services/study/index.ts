// src/services/study/index.ts
// 复习系统服务层公共导出

// 课程服务
export {
  getCourseList,
  getCourseByKey,
  enrollCourse,
  updateEnrollmentExamDate,
  getUserEnrolledCourses,
  updateCourseTotals,
  courseSelectPublic,
  unitSelectPublic,
  type CourseListItem,
  type CourseDetail,
  type UnitListItem,
} from "./courseService";

// 从视图层重新导出卡片选择器
export { cardSelectPublic } from "../../db/views";

// 卡片排程服务
export {
  LEITNER_INTERVALS,
  MAX_DAILY_ATTEMPTS,
  FORGOT_INTERVAL_HOURS,
  calculateNextSchedule,
  getTodayQueueSummary,
  startCardSession,
  submitCardFeedback,
  isCardMaxedOutToday,
  type TodayQueueSummary,
  type CardSession,
  type CardItem,
  type CardStateUpdate,
} from "./cardScheduler";

// 刷题服务
export {
  startQuizSession,
  submitQuizAnswer,
  getWrongItems,
  clearWrongItem,
  getQuizStats,
  type QuizSession,
  type QuizSessionOptions,
  type SubmitAnswerResult,
} from "./quizService";

// 急救包服务
export {
  getCheatSheets,
  getCheatSheetById,
  type CheatSheet,
} from "./cheatsheetService";

// 反馈服务
export {
  createFeedback,
  getUserFeedbacks,
  getPendingFeedbacks,
  updateFeedbackStatus,
  type CreateFeedbackInput,
  type FeedbackRecord,
} from "./feedbackService";

// 连续学习服务
export {
  recordActivity,
  getStreakInfo,
  getWeeklyLeaderboard,
  getUserRank,
  resetWeeklyPoints,
  type StreakInfo,
  type LeaderboardEntry,
} from "./streakService";

// 星标收藏服务
export {
  starItem,
  unstarItem,
  getStarredItems,
  type StarType,
  type StarredItem,
  type StarItemInput,
} from "./starService";

// 课程包导入服务
export {
  // 解析器
  parseManifest,
  parseUnits,
  parseCardsTsv,
  parseQuestionsGift,
  parseCheatsheets,
  parseCoursePackage,
  // 导入核心
  importCoursePackage,
  listCourseVersions,
  setCourseStatus,
  // 类型
  type CourseManifest,
  type UnitDefinition,
  type CardDefinition,
  type QuestionDefinition,
  type CheatSheetDefinition,
  type ImportOptions,
  type ImportResult,
  type CoursePackage,
  type PackageFiles,
  type CourseVersionInfo,
} from "./importService";

// 学习活动服务（热力图）
export {
  getActivityHistory,
  type DailyActivity,
  type ActivityHistory,
} from "./activityService";
