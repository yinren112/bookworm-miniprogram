const baseRequest = require('./request');
const tokenUtil = require('./token');
const ui = require('./ui');

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

async function exchangeCodeForToken(code, phoneCode) {
  const requestData = { code };
  // 只有当 phoneCode 存在时才添加到请求中
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
      throw new Error((data && data.message) || '登录失败');
    }
  } catch (error) {
    throw new Error((error && error.message) || '登录请求失败');
  }
}

async function login() {
  const code = await callWxLogin();
  const data = await exchangeCodeForToken(code);
  tokenUtil.setToken(data.token);
  if (data.userId) {
    tokenUtil.setUserId(data.userId);
  }
  return data;
}

async function loginWithPhoneNumber(phoneCode) {
  try {
    const code = await callWxLogin();
    const data = await exchangeCodeForToken(code, phoneCode);
    tokenUtil.setToken(data.token);
    if (data.userId) {
      tokenUtil.setUserId(data.userId);
    }
    return data;
  } catch (error) {
    console.error('Login with authorization failed:', error);
    throw error;
  }
}

async function ensureLoggedIn() {
  const token = tokenUtil.getToken();
  if (token) {
    return { token, userId: tokenUtil.getUserId() };
  }
  try {
    return await login();
  } catch (error) {
    ui.showError(error.message || '登录失败');
    throw error;
  }
}

module.exports = {
  login,
  loginWithPhoneNumber,
  ensureLoggedIn,
};
