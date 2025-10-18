/**
 * 错误码到用户友好消息的映射
 * 所有错误消息都不应包含敏感信息（phone/openid/pickupCode等）
 */
const ERROR_MESSAGES = {
  // 网络相关错误
  NETWORK: '网络繁忙，请稍后再试',
  TIMEOUT: '请求超时，请检查网络连接',
  SERVER_ERROR: '服务器繁忙，请稍后再试',

  // 认证相关错误
  AUTH_FAILED: '登录失败，请重新登录',
  UNAUTHORIZED: '请先登录',
  TOKEN_EXPIRED: '登录已过期，请重新登录',

  // 业务相关错误
  INVALID_REQUEST: '请求参数有误',
  NOT_FOUND: '未找到相关信息',
  FORBIDDEN: '无权访问',
  CONFLICT: '操作冲突，请刷新后重试',

  // 支付相关错误
  PAYMENT_FAILED: '支付失败，请重试',
  PAYMENT_CANCELLED: '支付已取消',

  // 库存相关错误
  INVENTORY_INSUFFICIENT: '库存不足',
  ORDER_EXPIRED: '订单已过期',

  // 默认错误
  UNKNOWN: '操作失败，请稍后再试',
};

/**
 * 显示错误提示（统一错误处理入口）
 * @param {string|Object} error - 错误码字符串或错误对象
 *   - 如果是字符串，将作为错误码从 ERROR_MESSAGES 映射
 *   - 如果是对象，可包含 errorCode、message、requestId 等字段
 * @param {Object} options - 可选配置
 * @param {string} options.fallback - 自定义回退消息（当错误码未映射时使用）
 * @param {number} options.duration - 提示持续时间（毫秒），默认2000
 *
 * @example
 * // 使用错误码
 * showError('NETWORK');
 *
 * // 使用错误对象
 * showError({ errorCode: 'AUTH_FAILED', requestId: 'req_123' });
 *
 * // 自定义回退消息
 * showError('UNKNOWN_CODE', { fallback: '自定义错误提示' });
 */
function showError(error = 'UNKNOWN', options = {}) {
  const { fallback, duration = 2000 } = options;

  let message;

  // 处理不同类型的 error 参数
  if (typeof error === 'string') {
    // 直接传入错误码
    message = ERROR_MESSAGES[error] || fallback || ERROR_MESSAGES.UNKNOWN;
  } else if (error && typeof error === 'object') {
    // 错误对象，优先使用 errorCode
    const errorCode = error.errorCode || error.code;
    if (errorCode && ERROR_MESSAGES[errorCode]) {
      message = ERROR_MESSAGES[errorCode];
    } else if (error.message && !containsSensitiveInfo(error.message)) {
      // 如果有 message 且不包含敏感信息，使用它
      message = error.message;
    } else {
      message = fallback || ERROR_MESSAGES.UNKNOWN;
    }
  } else {
    message = fallback || ERROR_MESSAGES.UNKNOWN;
  }

  wx.showToast({
    title: message,
    icon: 'none',
    duration
  });
}

/**
 * 检查字符串是否包含敏感信息
 * @param {string} str - 要检查的字符串
 * @returns {boolean} - 是否包含敏感信息
 */
function containsSensitiveInfo(str) {
  if (!str || typeof str !== 'string') {
    return false;
  }

  // 敏感字段正则（不区分大小写）
  const sensitivePattern = /\b(phone|openid|pickupCode|code|phoneNumber|phone_number|token|secret)\b/i;
  return sensitivePattern.test(str);
}

/**
 * 显示成功提示
 * @param {string} message - 成功消息
 * @param {number} duration - 持续时间（毫秒），默认1500
 */
function showSuccess(message, duration = 1500) {
  wx.showToast({
    title: message,
    icon: 'success',
    duration
  });
}

/**
 * 安全格式化价格，防止 NaN 显示
 * @param {number|string} value - 价格值
 * @param {number} decimals - 小数位数，默认2位
 * @param {string} fallback - NaN时的回退值，默认'0.00'
 * @returns {string} 格式化后的价格字符串
 *
 * @example
 * formatPrice(123.456) // '123.46'
 * formatPrice('abc') // '0.00'
 * formatPrice(null) // '0.00'
 * formatPrice(NaN, 2, '--') // '--'
 */
function formatPrice(value, decimals = 2, fallback = '0.00') {
  const num = parseFloat(value);
  if (isNaN(num) || !isFinite(num)) {
    return fallback;
  }
  return num.toFixed(decimals);
}

module.exports = {
  showError,
  showSuccess,
  formatPrice,
  ERROR_MESSAGES, // 导出错误消息映射，供其他模块使用
};