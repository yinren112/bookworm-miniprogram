// miniprogram/utils/auth-guard.js - 统一的登录守卫与会话管理
const baseRequest = require('./request');
const tokenUtil = require('./token');
const ui = require('./ui');
const logger = require('./logger');

// 单例 Promise，避免并发登录
let loginInFlight = null;

/**
 * 调用微信登录获取 code
 * @returns {Promise<string>} - 微信登录 code
 */
function callWxLogin() {
  return new Promise((resolve, reject) => {
    wx.login({
      success: (res) => {
        if (res.code) resolve(res.code);
        else reject(new Error('wx.login 未返回 code'));
      },
      fail: reject,
    });
  });
}

/**
 * 用 code 换取后端 token
 * @param {string} code - 微信登录 code
 * @param {string} phoneCode - 手机号授权 code（可选）
 * @returns {Promise<Object>} - 返回 { token, userId }
 */
async function exchangeCodeForToken(code, phoneCode) {
  const requestData = { code };
  if (phoneCode) {
    requestData.phoneCode = phoneCode;
  }

  try {
    const data = await baseRequest.request({
      url: '/auth/login',
      method: 'POST',
      data: requestData,
      requireAuth: false, // 登录请求不需要 token
    });

    if (data && data.token) {
      return data;
    } else {
      throw baseRequest.normalizeError(
        {
          message: (data && data.message) || '登录失败',
          errorCode: data && (data.errorCode || data.code),
        },
        { errorCode: 'AUTH_FAILED', message: '登录失败' },
      );
    }
  } catch (error) {
    throw baseRequest.normalizeError(error, { errorCode: 'AUTH_FAILED', message: '登录请求失败' });
  }
}

/**
 * 检查是否已登录（token 存在）
 * @returns {boolean}
 */
function isLoggedIn() {
  return !!tokenUtil.getToken();
}

/**
 * 获取当前 token
 * @returns {string|null}
 */
function getToken() {
  return tokenUtil.getToken();
}

/**
 * 确保用户已登录，如果未登录则自动登录
 * @param {Object} options - 选项
 * @param {boolean} options.silent - 是否静默登录（不弹 toast），默认 false
 * @returns {Promise<Object>} - 返回 { token, userId }
 */
async function ensureLoggedIn({ silent = false } = {}) {
  // 如果已有 token，直接返回
  if (isLoggedIn()) {
    return { token: getToken(), userId: tokenUtil.getUserId() };
  }

  // 如果已经在登录中，等待完成
  if (loginInFlight) {
    return await loginInFlight;
  }

  // 开始新的登录流程（单例模式）
  loginInFlight = (async () => {
    try {
      const code = await callWxLogin();
      const data = await exchangeCodeForToken(code);
      tokenUtil.setToken(data.token);
      if (data.userId) {
        tokenUtil.setUserId(data.userId);
      }
      return data;
    } catch (error) {
      const normalizedError = baseRequest.normalizeError(error, {
        errorCode: 'AUTH_FAILED',
        message: '登录失败，请稍后再试',
      });
      if (!silent) {
        // 使用统一的错误处理，避免泄露敏感信息
        ui.showError(normalizedError);
      }
      throw normalizedError;
    } finally {
      loginInFlight = null;
    }
  })();

  return await loginInFlight;
}

/**
 * 带手机号授权的登录（用于账号合并）
 * @param {string} phoneCode - 手机号授权 code
 * @returns {Promise<Object>} - 返回 { token, userId }
 */
async function loginWithPhoneNumber(phoneCode) {
  // 清除旧 token，强制重新登录
  tokenUtil.clearToken();

  // 如果有正在进行的登录，等待完成并清除
  if (loginInFlight) {
    await loginInFlight.catch(() => {});
    loginInFlight = null;
  }

  try {
    const code = await callWxLogin();
    const data = await exchangeCodeForToken(code, phoneCode);
    tokenUtil.setToken(data.token);
    if (data.userId) {
      tokenUtil.setUserId(data.userId);
    }
    return data;
  } catch (error) {
    const normalizedError = baseRequest.normalizeError(error, {
      errorCode: 'AUTH_FAILED',
      message: '登录失败，请稍后再试',
    });
    logger.error('Login with authorization failed:', normalizedError);
    throw normalizedError;
  }
}

/**
 * 登出，清除本地 token
 */
function logout() {
  tokenUtil.clearToken();
  loginInFlight = null;
}

module.exports = {
  isLoggedIn,
  getToken,
  ensureLoggedIn,
  loginWithPhoneNumber,
  logout
};
