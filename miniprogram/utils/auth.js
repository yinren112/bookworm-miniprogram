const config = require('../config');
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

function exchangeCodeForToken(code, phoneCode) {
  return new Promise((resolve, reject) => {
    const requestData = { code };
    // 只有当 phoneCode 存在时才添加到请求中
    if (phoneCode) {
      requestData.phoneCode = phoneCode;
    }

    wx.request({
      url: config.apiBaseUrl + '/auth/login',
      method: 'POST',
      data: requestData,
      header: {
        'Content-Type': 'application/json',
      },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.data && res.data.token) {
          resolve(res.data);
        } else {
          reject(new Error((res.data && res.data.message) || '登录失败'));
        }
      },
      fail: () => reject(new Error('登录请求失败')),
    });
  });
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
    console.error('Login with phone number failed:', error);
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
