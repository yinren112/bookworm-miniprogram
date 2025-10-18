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

module.exports = {
  ORDER_STATUS,
  ORDER_STATUS_COLOR,
  BOOK_CONDITION,
};
