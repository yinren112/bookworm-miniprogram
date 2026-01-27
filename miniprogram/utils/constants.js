// miniprogram/utils/constants.js

// 订单状态文本映射
const ORDER_STATUS = {
  PENDING_PAYMENT: '待支付',
  PENDING_PICKUP: '待取货',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
  RETURNED: '已退货'
};

// 订单状态颜色映射（用于UI样式类）
const ORDER_STATUS_COLOR = {
  PENDING_PAYMENT: 'error',    // 红色 - 待支付
  PENDING_PICKUP: 'warning',   // 橙色 - 待取货
  COMPLETED: 'success',        // 绿色 - 已完成
  CANCELLED: 'secondary',      // 灰色 - 已取消
  RETURNED: 'secondary'        // 灰色 - 已退货
};

// 书况文本映射
const BOOK_CONDITION = {
  NEW: '全新',
  GOOD: '良好',
  ACCEPTABLE: '可用'
};

const REVIEW_DASHBOARD_CACHE_VERSION = 'v1';
const REVIEW_COURSES_CACHE_VERSION = 'v1';
const RESUME_SESSION_STORAGE_KEY = 'study:resumeSession';
const LAST_SESSION_TYPE_KEY = 'study:lastSessionType';
const TERMS_STORAGE_KEY = 'termsAccepted';
const TERMS_ACCEPTED_AT_KEY = 'termsAcceptedAt';
const TERMS_VERSION_KEY = 'termsVersion';
const TERMS_VERSION = 'v1';
const HOME_TAB_URL = '/pages/review/index';

module.exports = {
  ORDER_STATUS,
  ORDER_STATUS_COLOR,
  BOOK_CONDITION,
  REVIEW_DASHBOARD_CACHE_VERSION,
  REVIEW_COURSES_CACHE_VERSION,
  RESUME_SESSION_STORAGE_KEY,
  LAST_SESSION_TYPE_KEY,
  TERMS_STORAGE_KEY,
  TERMS_ACCEPTED_AT_KEY,
  TERMS_VERSION_KEY,
  TERMS_VERSION,
  HOME_TAB_URL,
};
