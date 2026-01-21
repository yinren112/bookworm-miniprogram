// miniprogram/utils/study-api.js
// 复习系统 API 封装

const { request } = require('./api');

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

/**
 * 获取课程列表
 * @param {Object} options - 查询选项
 * @param {boolean} [options.enrolled] - 只返回已注册课程
 */
const getCourses = (options = {}) => {
  const queryString = buildQueryString({
    enrolled: options.enrolled ? 'true' : undefined,
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
  return request({
    url: `/study/courses/${encodeURIComponent(courseKey)}`,
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
  return request({
    url: `/study/courses/${encodeURIComponent(courseKey)}/enroll`,
    method: 'POST',
    data: sourceScene ? { sourceScene } : {},
    requireAuth: true,
  });
};

/**
 * 获取今日队列摘要
 * @param {string} courseKey - 课程标识
 */
const getTodayQueue = (courseKey) => {
  return request({
    url: `/study/today?courseKey=${encodeURIComponent(courseKey)}`,
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
  return request({
    url: '/study/start',
    method: 'POST',
    data: {
      courseKey,
      ...options,
    },
    requireAuth: true,
  });
};

/**
 * 提交卡片反馈
 * @param {string} contentId - 卡片内容ID
 * @param {string} sessionId - 会话ID
 * @param {string} rating - 反馈评分: FORGOT | FUZZY | KNEW | PERFECT
 */
const submitCardAnswer = (contentId, sessionId, rating) => {
  return request({
    url: `/study/cards/${encodeURIComponent(contentId)}/answer`,
    method: 'POST',
    data: {
      sessionId,
      rating,
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
  return request({
    url: '/study/quiz/start',
    method: 'POST',
    data: {
      courseKey,
      ...options,
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
  return request({
    url: '/study/quiz/answer',
    method: 'POST',
    data: {
      sessionId,
      questionId,
      answer,
      durationMs,
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
  const queryString = buildQueryString({
    courseKey: options.courseKey,
    limit: options.limit,
    offset: options.offset,
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
  return request({
    url: `/study/wrong-items/${questionId}`,
    method: 'DELETE',
    requireAuth: true,
  });
};

/**
 * 获取刷题统计
 * @param {string} [courseKey] - 课程标识
 */
const getQuizStats = (courseKey) => {
  const params = courseKey ? `?courseKey=${encodeURIComponent(courseKey)}` : '';
  return request({
    url: `/study/quiz/stats${params}`,
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
  const queryString = buildQueryString({
    courseKey: courseKey,
    unitId: unitId,
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
  return request({
    url: `/study/cheatsheets/${id}`,
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
  return request({
    url: '/study/feedback',
    method: 'POST',
    data,
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
  const queryString = buildQueryString({
    courseKey: options.courseKey,
    limit: options.limit,
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
  return request({
    url: '/study/star',
    method: 'POST',
    data,
    requireAuth: true,
  });
};

/**
 * 取消星标
 * @param {Object} data - 取消收藏数据
 */
const unstarItem = (data) => {
  return request({
    url: '/study/star',
    method: 'DELETE',
    data,
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
  const queryString = buildQueryString({
    type: options.type,
    courseKey: options.courseKey,
  });
  return request({
    url: `/study/starred-items${queryString}`,
    method: 'GET',
    requireAuth: true,
  });
};

module.exports = {
  // Phase 2: 课程和卡片
  getCourses,
  getCourseDetail,
  enrollCourse,
  getTodayQueue,
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
};
