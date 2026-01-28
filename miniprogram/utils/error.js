const ui = require('./ui');

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
  return ui.getErrorMessage(error, { fallback });
}

module.exports = {
  extractErrorMessage,
};
