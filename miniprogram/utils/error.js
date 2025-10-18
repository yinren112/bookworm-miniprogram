/**
 * @deprecated 此函数已被标记为废弃，推荐直接使用 ui.showError(error, { fallback: '...' })
 *
 * 提取错误消息（带敏感信息过滤）
 * 注意：此函数会检查并过滤敏感信息（phone/openid/pickupCode等）
 *
 * @param {any} error - 错误对象或错误字符串
 * @param {string} fallback - 回退消息
 * @returns {string} - 安全的错误消息
 */
function extractErrorMessage(error, fallback = '发生未知错误') {
  if (!error) {
    return fallback;
  }
  if (typeof error === 'string') {
    // 检查字符串是否包含敏感信息
    return containsSensitiveInfo(error) ? fallback : error;
  }

  const message =
    error.message ||
    (error.data && error.data.message) ||
    error.error ||
    fallback;

  const finalMessage = typeof message === 'string' && message.trim() ? message : fallback;

  // 过滤敏感信息
  return containsSensitiveInfo(finalMessage) ? fallback : finalMessage;
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

module.exports = {
  extractErrorMessage,
};
