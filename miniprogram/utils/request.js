// miniprogram/utils/request.js - 统一的底层HTTP请求客户端
const config = require('../config');
const tokenUtil = require('./token');

/**
 * 生成简易的请求ID（用于追踪）
 * 格式：timestamp-random（如：1634567890123-a3f9）
 */
function generateRequestId() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 6);
  return `${timestamp}-${random}`;
}

/**
 * 延迟函数
 * @param {number} ms - 延迟毫秒数
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 判断是否应该重试
 * 只有 GET/HEAD 方法在网络错误或 5xx 错误时才重试
 * @param {string} method - HTTP 方法
 * @param {boolean} isNetworkError - 是否是网络错误
 * @param {number} statusCode - HTTP 状态码（如果有）
 */
function shouldRetry(method, isNetworkError, statusCode) {
  const isIdempotent = method === 'GET' || method === 'HEAD';
  if (!isIdempotent) return false;

  if (isNetworkError) return true;
  if (statusCode && statusCode >= 500 && statusCode < 600) return true;

  return false;
}

/**
 * 核心请求函数（内部递归调用）
 * @param {Object} options - 请求配置
 * @param {string} options.url - 请求路径（相对路径，会自动拼接 baseURL）
 * @param {string} options.method - HTTP 方法（默认 GET）
 * @param {Object} options.data - 请求数据
 * @param {boolean} options.requireAuth - 是否需要 Authorization header（默认 false）
 * @param {number} options.timeout - 超时时间（毫秒，默认 8000）
 * @param {number} attempt - 当前重试次数（内部使用）
 * @returns {Promise<any>} - 返回响应数据
 */
function performRequest(options, attempt = 0) {
  const {
    url,
    method = 'GET',
    data = {},
    requireAuth = false,
    timeout = 8000,
  } = options;

  // 指数退避延迟：100ms, 300ms, 900ms
  const RETRY_DELAYS = [100, 300, 900];
  const MAX_RETRIES = RETRY_DELAYS.length;

  const requestId = generateRequestId();
  const token = requireAuth ? tokenUtil.getToken() : null;

  return new Promise((resolve, reject) => {
    const headers = {
      'Content-Type': 'application/json',
      'X-Request-ID': requestId,
    };

    if (requireAuth && token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const finalUrl = `${config.apiBaseUrl}${url}`;
    if (!/^https?:\/\//i.test(finalUrl) || /[：／]/.test(finalUrl) || /[`"'“”‘’]/.test(finalUrl) || /\s/.test(finalUrl)) {
      reject({
        message: '请求地址非法，请检查 DEV_API_BASE_URL 是否包含全角冒号/反引号/空格',
        errorCode: 'INVALID_URL',
        requestId,
        url: finalUrl,
        errMsg: 'net::ERR_INVALID_URL',
      });
      return;
    }

    // eslint-disable-next-line no-restricted-syntax -- utils/request.js 是唯一允许直接调用 wx.request 的文件
    wx.request({
      url: finalUrl,
      method,
      data,
      timeout,
      header: headers,
      success: async (res) => {
        // 成功响应（2xx）
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
          return;
        }

        // 检查是否应该重试（只对 GET/HEAD 且是 5xx 错误）
        if (shouldRetry(method, false, res.statusCode) && attempt < MAX_RETRIES) {
          const delayMs = RETRY_DELAYS[attempt];
          await sleep(delayMs);
          try {
            const retryResult = await performRequest(options, attempt + 1);
            resolve(retryResult);
          } catch (retryError) {
            reject(retryError);
          }
          return;
        }

        // 非重试情况，返回错误
        const errorPayload = res.data && typeof res.data === 'object'
          ? { ...res.data, statusCode: res.statusCode, requestId }
          : {
              message: `请求失败 (${res.statusCode})`,
              statusCode: res.statusCode,
              requestId
            };
        reject(errorPayload);
      },
      fail: async (error) => {
        // 网络错误，检查是否应该重试
        if (shouldRetry(method, true, null) && attempt < MAX_RETRIES) {
          const delayMs = RETRY_DELAYS[attempt];
          await sleep(delayMs);
          try {
            const retryResult = await performRequest(options, attempt + 1);
            resolve(retryResult);
          } catch (retryError) {
            reject(retryError);
          }
          return;
        }

        // 非重试情况或重试次数用尽，返回网络错误
        reject({
          message: '网络请求失败',
          errorCode: 'NETWORK_ERROR',
          requestId,
          url: finalUrl,
          errMsg: error && error.errMsg ? error.errMsg : '',
          detail: error,
        });
      },
    });
  });
}

/**
 * 统一的请求客户端
 * @param {Object} options - 请求配置
 * @param {string} options.url - 请求路径（相对路径）
 * @param {string} options.method - HTTP 方法（默认 GET）
 * @param {Object} options.data - 请求数据
 * @param {boolean} options.requireAuth - 是否需要 Authorization header（默认 false）
 * @param {number} options.timeout - 超时时间（毫秒，默认 8000）
 * @returns {Promise<any>} - 返回响应数据
 */
function request(options) {
  return performRequest(options, 0);
}

module.exports = {
  request,
};
