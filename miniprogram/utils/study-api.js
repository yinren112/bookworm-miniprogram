// miniprogram/utils/study-api.js
// 复习系统 API 封装

const { request } = require('./api');
const config = require('../config');

/**
 * 构建查询字符串（小程序兼容，替代 URLSearchParams）
 * @param {Object} params - 参数对象
 * @returns {string} 查询字符串，如 "?key1=value1&key2=value2" 或空字符串
 */
function buildQueryString(params) {
  const parts = [];
  for (const key in params) {
    if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(params[key]));
    }
  }
  return parts.length > 0 ? '?' + parts.join('&') : '';
}

function rejectParamError(message) {
  return Promise.reject(new Error(message));
}

function ensureNonEmptyString(value, name) {
  void name;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed;
}

function ensureFiniteNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

/**
 * 获取课程列表
 * @param {Object} options - 查询选项
 * @param {boolean} [options.enrolled] - 只返回已注册课程
 * @param {boolean} [options.includeUnpublished] - 是否包含未发布课程（仅开发者工具）
 */
const getCourses = (options = {}) => {
  const includeUnpublished = typeof options.includeUnpublished === 'boolean'
    ? options.includeUnpublished
    : config.isDevtools();
  const queryString = buildQueryString({
    enrolled: options.enrolled ? 'true' : undefined,
    includeUnpublished: includeUnpublished ? 'true' : undefined,
  });
  return request({
    url: `/study/courses${queryString}`,
    method: 'GET',
    requireAuth: true,
  });
};

/**
 * 获取课程详情
 * @param {string} courseKey - 课程标识
 */
const getCourseDetail = (courseKey) => {
  const ck = ensureNonEmptyString(courseKey, 'courseKey');
  if (!ck) return rejectParamError('courseKey is required');
  return request({
    url: `/study/courses/${encodeURIComponent(ck)}`,
    method: 'GET',
    requireAuth: true,
  });
};

/**
 * 注册课程
 * @param {string} courseKey - 课程标识
 * @param {string} [sourceScene] - 来源场景码
 */
const enrollCourse = (courseKey, sourceScene) => {
  const ck = ensureNonEmptyString(courseKey, 'courseKey');
  if (!ck) return rejectParamError('courseKey is required');
  const scene = typeof sourceScene === 'string' ? sourceScene.trim() : '';
  return request({
    url: `/study/courses/${encodeURIComponent(ck)}/enroll`,
    method: 'POST',
    data: scene ? { sourceScene: scene } : {},
    requireAuth: true,
  });
};

/**
 * 更新考试日期
 * @param {string} courseKey - 课程标识
 * @param {string|null} examDate - YYYY-MM-DD 或 null
 */
const updateExamDate = (courseKey, examDate) => {
  const ck = ensureNonEmptyString(courseKey, 'courseKey');
  if (!ck) return rejectParamError('courseKey is required');
  const normalizedExamDate = examDate === null ? null : (typeof examDate === 'string' ? examDate.trim() : null);
  if (examDate !== null && normalizedExamDate === null) return rejectParamError('examDate must be YYYY-MM-DD or null');
  return request({
    url: `/study/courses/${encodeURIComponent(ck)}/exam-date`,
    method: 'PATCH',
    data: { examDate: normalizedExamDate },
    requireAuth: true,
  });
};

/**
 * 获取今日队列摘要
 * @param {string} courseKey - 课程标识
 */
const getTodayQueue = (courseKey) => {
  const ck = ensureNonEmptyString(courseKey, 'courseKey');
  if (!ck) return rejectParamError('courseKey is required');
  return request({
    url: `/study/today?courseKey=${encodeURIComponent(ck)}`,
    method: 'GET',
    requireAuth: true,
  });
};

/**
 * 获取复习首页聚合数据
 * @param {Object} options - 查询选项
 * @param {string} [options.courseKey] - 课程标识
 * @param {boolean} [options.includeUnpublished] - 是否包含未发布课程（仅开发者工具）
 */
const getDashboard = (options = {}) => {
  if (!options || typeof options !== 'object') return rejectParamError('options must be an object');
  const courseKey = options.courseKey === undefined ? undefined : ensureNonEmptyString(options.courseKey, 'courseKey');
  if (options.courseKey !== undefined && !courseKey) return rejectParamError('courseKey must be a non-empty string');
  const queryString = buildQueryString({
    courseKey,
    includeUnpublished: options.includeUnpublished ? 'true' : undefined,
  });
  return request({
    url: `/study/dashboard${queryString}`,
    method: 'GET',
    requireAuth: true,
  });
};

/**
 * 开始学习 session
 * @param {string} courseKey - 课程标识
 * @param {Object} options - 选项
 * @param {number} [options.unitId] - 章节ID
 * @param {number} [options.limit] - 卡片数量限制
 */
const startSession = (courseKey, options = {}) => {
  const ck = ensureNonEmptyString(courseKey, 'courseKey');
  if (!ck) return rejectParamError('courseKey is required');
  const unitId = options.unitId === undefined ? undefined : ensureFiniteNumber(options.unitId);
  if (options.unitId !== undefined && unitId === null) return rejectParamError('unitId must be a number');
  const limit = options.limit === undefined ? undefined : ensureFiniteNumber(options.limit);
  if (options.limit !== undefined && limit === null) return rejectParamError('limit must be a number');
  return request({
    url: '/study/start',
    method: 'POST',
    data: {
      courseKey: ck,
      ...(unitId === undefined ? {} : { unitId }),
      ...(limit === undefined ? {} : { limit }),
    },
    requireAuth: true,
  });
};

/**
 * 提交卡片反馈
 * @param {string} contentId - 卡片内容ID
 * @param {string} sessionId - 会话ID
 * @param {string} rating - 反馈评分: FORGOT | FUZZY | KNEW | PERFECT
 * @param {string} courseKey - 课程标识
 */
const submitCardAnswer = (contentId, sessionId, rating, courseKey) => {
  const cid = ensureNonEmptyString(contentId, 'contentId');
  if (!cid) return rejectParamError('contentId is required');
  const sid = ensureNonEmptyString(sessionId, 'sessionId');
  if (!sid) return rejectParamError('sessionId is required');
  const ck = ensureNonEmptyString(courseKey, 'courseKey');
  if (!ck) return rejectParamError('courseKey is required');
  const r = ensureNonEmptyString(rating, 'rating');
  if (!r) return rejectParamError('rating is required');
  return request({
    url: `/study/cards/${encodeURIComponent(cid)}/answer`,
    method: 'POST',
    data: {
      sessionId: sid,
      rating: r,
      courseKey: ck,
    },
    requireAuth: true,
  });
};

// ============================================
// Phase 3: 刷题 API
// ============================================

/**
 * 开始刷题 session
 * @param {string} courseKey - 课程标识
 * @param {Object} options - 选项
 * @param {number} [options.unitId] - 章节ID
 * @param {number} [options.limit] - 题目数量限制
 * @param {boolean} [options.wrongItemsOnly] - 只做错题
 */
const startQuiz = (courseKey, options = {}) => {
  const ck = ensureNonEmptyString(courseKey, 'courseKey');
  if (!ck) return rejectParamError('courseKey is required');
  const unitId = options.unitId === undefined ? undefined : ensureFiniteNumber(options.unitId);
  if (options.unitId !== undefined && unitId === null) return rejectParamError('unitId must be a number');
  const limit = options.limit === undefined ? undefined : ensureFiniteNumber(options.limit);
  if (options.limit !== undefined && limit === null) return rejectParamError('limit must be a number');
  const wrongItemsOnly = options.wrongItemsOnly === undefined ? undefined : !!options.wrongItemsOnly;
  return request({
    url: '/study/quiz/start',
    method: 'POST',
    data: {
      courseKey: ck,
      ...(unitId === undefined ? {} : { unitId }),
      ...(limit === undefined ? {} : { limit }),
      ...(wrongItemsOnly === undefined ? {} : { wrongItemsOnly }),
    },
    requireAuth: true,
  });
};

/**
 * 提交答题结果
 * @param {string} sessionId - 会话ID
 * @param {number} questionId - 题目ID
 * @param {string} answer - 用户答案
 * @param {number} [durationMs] - 答题耗时(毫秒)
 */
const submitQuizAnswer = (sessionId, questionId, answer, durationMs) => {
  const sid = ensureNonEmptyString(sessionId, 'sessionId');
  if (!sid) return rejectParamError('sessionId is required');
  const qid = ensureFiniteNumber(questionId);
  if (qid === null) return rejectParamError('questionId must be a number');
  const a = ensureNonEmptyString(answer, 'answer');
  if (a === null) return rejectParamError('answer must be a string');
  const dur = durationMs === undefined ? undefined : ensureFiniteNumber(durationMs);
  if (durationMs !== undefined && dur === null) return rejectParamError('durationMs must be a number');
  return request({
    url: '/study/quiz/answer',
    method: 'POST',
    data: {
      sessionId: sid,
      questionId: qid,
      answer: a,
      ...(dur === undefined ? {} : { durationMs: dur }),
    },
    requireAuth: true,
  });
};

/**
 * 获取错题列表
 * @param {Object} options - 查询选项
 * @param {string} [options.courseKey] - 课程标识
 * @param {number} [options.limit] - 分页大小
 * @param {number} [options.offset] - 偏移量
 */
const getWrongItems = (options = {}) => {
  if (!options || typeof options !== 'object') return rejectParamError('options must be an object');
  const courseKey = options.courseKey === undefined ? undefined : ensureNonEmptyString(options.courseKey, 'courseKey');
  if (options.courseKey !== undefined && !courseKey) return rejectParamError('courseKey must be a non-empty string');
  const limit = options.limit === undefined ? undefined : ensureFiniteNumber(options.limit);
  if (options.limit !== undefined && limit === null) return rejectParamError('limit must be a number');
  const offset = options.offset === undefined ? undefined : ensureFiniteNumber(options.offset);
  if (options.offset !== undefined && offset === null) return rejectParamError('offset must be a number');
  const queryString = buildQueryString({
    courseKey,
    limit,
    offset,
  });
  return request({
    url: `/study/wrong-items${queryString}`,
    method: 'GET',
    requireAuth: true,
  });
};

/**
 * 清除错题
 * @param {number} questionId - 题目ID
 */
const clearWrongItem = (questionId) => {
  const qid = ensureFiniteNumber(questionId);
  if (qid === null) return rejectParamError('questionId must be a number');
  return request({
    url: `/study/wrong-items/${qid}`,
    method: 'DELETE',
    requireAuth: true,
  });
};

/**
 * 获取刷题统计
 * @param {string} [courseKey] - 课程标识
 */
const getQuizStats = (courseKey) => {
  if (courseKey !== undefined && courseKey !== null) {
    const ck = ensureNonEmptyString(courseKey, 'courseKey');
    if (!ck) return rejectParamError('courseKey must be a non-empty string');
    return request({
      url: `/study/quiz/stats?courseKey=${encodeURIComponent(ck)}`,
      method: 'GET',
      requireAuth: true,
    });
  }
  return request({
    url: '/study/quiz/stats',
    method: 'GET',
    requireAuth: true,
  });
};

// ============================================
// Phase 4: 急救包 & 纠错 API
// ============================================

/**
 * 获取急救包列表
 * @param {string} courseKey - 课程标识
 * @param {number} [unitId] - 章节ID
 */
const getCheatSheets = (courseKey, unitId) => {
  const ck = ensureNonEmptyString(courseKey, 'courseKey');
  if (!ck) return rejectParamError('courseKey is required');
  const uid = unitId === undefined || unitId === null ? undefined : ensureFiniteNumber(unitId);
  if (unitId !== undefined && unitId !== null && uid === null) return rejectParamError('unitId must be a number');
  const queryString = buildQueryString({
    courseKey: ck,
    unitId: uid,
  });
  return request({
    url: `/study/cheatsheets${queryString}`,
    method: 'GET',
    requireAuth: true,
  });
};

/**
 * 获取急救包详情
 * @param {number} id - 急救包ID
 */
const getCheatSheetDetail = (id) => {
  const cid = ensureFiniteNumber(id);
  if (cid === null) return rejectParamError('id must be a number');
  return request({
    url: `/study/cheatsheets/${cid}`,
    method: 'GET',
    requireAuth: true,
  });
};

/**
 * 提交纠错反馈
 * @param {Object} data - 反馈数据
 * @param {string} data.courseKey - 课程标识
 * @param {number} [data.cardId] - 卡片ID
 * @param {number} [data.questionId] - 题目ID
 * @param {string} data.reason - 原因类型
 * @param {string} data.message - 详细描述
 */
const submitFeedback = (data) => {
  if (!data || typeof data !== 'object') return rejectParamError('data is required');
  const ck = ensureNonEmptyString(data.courseKey, 'courseKey');
  if (!ck) return rejectParamError('courseKey is required');
  const reason = ensureNonEmptyString(data.reason, 'reason');
  if (!reason) return rejectParamError('reason is required');
  const message = ensureNonEmptyString(data.message, 'message');
  if (!message) return rejectParamError('message is required');
  return request({
    url: '/study/feedback',
    method: 'POST',
    data: {
      ...data,
      courseKey: ck,
      reason,
      message,
    },
    requireAuth: true,
  });
};

/**
 * 获取我的反馈列表
 * @param {Object} options - 查询选项
 * @param {number} [options.limit] - 分页大小
 * @param {number} [options.offset] - 偏移量
 */
const getMyFeedbacks = (options = {}) => {
  const queryString = buildQueryString({
    limit: options.limit,
    offset: options.offset,
  });
  return request({
    url: `/study/feedback${queryString}`,
    method: 'GET',
    requireAuth: true,
  });
};

// ============================================
// Phase 5: Streak 与周榜 API
// ============================================

/**
 * 获取当前用户连续学习信息
 */
const getStreakInfo = () => {
  return request({
    url: '/study/streak',
    method: 'GET',
    requireAuth: true,
  });
};

/**
 * 获取周榜
 * @param {Object} options - 查询选项
 * @param {string} [options.courseKey] - 课程标识（可选）
 * @param {number} [options.limit] - 返回数量，默认 50
 */
const getLeaderboard = (options = {}) => {
  if (!options || typeof options !== 'object') return rejectParamError('options must be an object');
  const courseKey = options.courseKey === undefined ? undefined : ensureNonEmptyString(options.courseKey, 'courseKey');
  if (options.courseKey !== undefined && !courseKey) return rejectParamError('courseKey must be a non-empty string');
  const limit = options.limit === undefined ? undefined : ensureFiniteNumber(options.limit);
  if (options.limit !== undefined && limit === null) return rejectParamError('limit must be a number');
  const queryString = buildQueryString({
    courseKey,
    limit,
  });
  return request({
    url: `/study/leaderboard${queryString}`,
    method: 'GET',
    requireAuth: true,
  });
};

// ============================================
// Phase 4.5: 星标收藏 API
// ============================================

/**
 * 星标收藏
 * @param {Object} data - 收藏数据
 * @param {string} data.type - card | question
 * @param {string} [data.contentId] - 卡片 contentId
 * @param {number} [data.questionId] - 题目 ID
 */
const starItem = (data) => {
  if (!data || typeof data !== 'object') return rejectParamError('data is required');
  const type = ensureNonEmptyString(data.type, 'type');
  if (!type) return rejectParamError('type is required');
  const courseKey = data.courseKey === undefined ? undefined : ensureNonEmptyString(data.courseKey, 'courseKey');
  if (data.courseKey !== undefined && !courseKey) return rejectParamError('courseKey must be a non-empty string');
  const contentId = data.contentId === undefined ? undefined : ensureNonEmptyString(data.contentId, 'contentId');
  const questionId = data.questionId === undefined ? undefined : ensureFiniteNumber(data.questionId);
  if (data.contentId !== undefined && !contentId) return rejectParamError('contentId must be a non-empty string');
  if (data.questionId !== undefined && questionId === null) return rejectParamError('questionId must be a number');
  return request({
    url: '/study/star',
    method: 'POST',
    data: {
      ...data,
      type,
      ...(courseKey === undefined ? {} : { courseKey }),
      ...(contentId === undefined ? {} : { contentId }),
      ...(questionId === undefined ? {} : { questionId }),
    },
    requireAuth: true,
  });
};

/**
 * 取消星标
 * @param {Object} data - 取消收藏数据
 */
const unstarItem = (data) => {
  if (!data || typeof data !== 'object') return rejectParamError('data is required');
  const type = ensureNonEmptyString(data.type, 'type');
  if (!type) return rejectParamError('type is required');
  const courseKey = data.courseKey === undefined ? undefined : ensureNonEmptyString(data.courseKey, 'courseKey');
  if (data.courseKey !== undefined && !courseKey) return rejectParamError('courseKey must be a non-empty string');
  const contentId = data.contentId === undefined ? undefined : ensureNonEmptyString(data.contentId, 'contentId');
  const questionId = data.questionId === undefined ? undefined : ensureFiniteNumber(data.questionId);
  if (data.contentId !== undefined && !contentId) return rejectParamError('contentId must be a non-empty string');
  if (data.questionId !== undefined && questionId === null) return rejectParamError('questionId must be a number');
  return request({
    url: '/study/star',
    method: 'DELETE',
    data: {
      ...data,
      type,
      ...(courseKey === undefined ? {} : { courseKey }),
      ...(contentId === undefined ? {} : { contentId }),
      ...(questionId === undefined ? {} : { questionId }),
    },
    requireAuth: true,
  });
};

/**
 * 获取星标列表
 * @param {Object} options - 查询选项
 * @param {string} [options.type] - card | question
 * @param {string} [options.courseKey] - 课程标识
 */
const getStarredItems = (options = {}) => {
  if (!options || typeof options !== 'object') return rejectParamError('options must be an object');
  const type = options.type === undefined ? undefined : ensureNonEmptyString(options.type, 'type');
  if (options.type !== undefined && !type) return rejectParamError('type must be a non-empty string');
  const courseKey = options.courseKey === undefined ? undefined : ensureNonEmptyString(options.courseKey, 'courseKey');
  if (options.courseKey !== undefined && !courseKey) return rejectParamError('courseKey must be a non-empty string');
  const queryString = buildQueryString({
    type,
    courseKey,
  });
  return request({
    url: `/study/starred-items${queryString}`,
    method: 'GET',
    requireAuth: true,
  });
};

/**
 * 获取学习活动历史（热力图数据）
 * @param {Object} options - 查询选项
 * @param {number} [options.days] - 天数，默认35天
 */
const getActivityHistory = (options = {}) => {
  if (!options || typeof options !== 'object') return rejectParamError('options must be an object');
  const days = options.days === undefined ? undefined : ensureFiniteNumber(options.days);
  if (options.days !== undefined && days === null) return rejectParamError('days must be a number');
  const queryString = buildQueryString({
    days,
  });
  return request({
    url: `/study/activity-history${queryString}`,
    method: 'GET',
    requireAuth: true,
  });
};

const getStudyReminderConfig = () => {
  return request({
    url: '/study/reminders/config',
    method: 'GET',
    requireAuth: true,
  });
};

const pulseStudyActivity = (payload) => {
  return request({
    url: '/study/activity/pulse',
    method: 'POST',
    data: payload,
    requireAuth: true,
  });
};

/**
 * 订阅复习提醒
 * @param {Object} payload
 * @param {string} payload.templateId
 * @param {string} payload.result - accept | reject
 * @param {string} [payload.timezone]
 */
const subscribeStudyReminder = (payload) => {
  return request({
    url: '/study/reminders/subscribe',
    method: 'POST',
    data: payload,
    requireAuth: true,
  });
};

/**
 * 获取复习提醒订阅状态
 * @param {Object} options
 * @param {string} [options.templateId]
 */
const getStudyReminderStatus = (options = {}) => {
  const queryString = buildQueryString({
    templateId: options.templateId,
  });
  return request({
    url: `/study/reminders/status${queryString}`,
    method: 'GET',
    requireAuth: true,
  });
};

module.exports = {
  // Phase 2: 课程和卡片
  getCourses,
  getCourseDetail,
  enrollCourse,
  updateExamDate,
  getTodayQueue,
  getDashboard,
  startSession,
  submitCardAnswer,
  // Phase 3: 刷题
  startQuiz,
  submitQuizAnswer,
  getWrongItems,
  clearWrongItem,
  getQuizStats,
  // Phase 4: 急救包和纠错
  getCheatSheets,
  getCheatSheetDetail,
  submitFeedback,
  getMyFeedbacks,
  // Phase 5: Streak 与周榜
  getStreakInfo,
  getLeaderboard,
  starItem,
  unstarItem,
  getStarredItems,
  // Phase 5.5: 热力图
  getActivityHistory,
  pulseStudyActivity,
  getStudyReminderConfig,
  subscribeStudyReminder,
  getStudyReminderStatus,
};
