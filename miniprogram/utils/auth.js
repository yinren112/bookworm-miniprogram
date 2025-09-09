// utils/auth.js
const config = require('../config');
const TOKEN_KEY = 'authToken';
const USER_ID_KEY = 'userId';

const login = () => {
  return new Promise((resolve, reject) => {
    wx.login({
      success: (res) => {
        if (res.code) {
          wx.request({
            url: `${config.apiBaseUrl}/auth/login`,
            method: 'POST',
            data: {
              code: res.code
            },
            success: (loginRes) => {
              if (loginRes.statusCode === 200 && loginRes.data.token) {
                setToken(loginRes.data.token);
                setUserId(loginRes.data.userId);
                resolve(loginRes.data);
              } else {
                reject(new Error('Login failed on server.'));
              }
            },
            fail: (err) => {
              reject(err);
            }
          });
        } else {
          reject(new Error('wx.login failed, no code returned.'));
        }
      },
      fail: (err) => {
        reject(err);
      }
    });
  });
};

const setToken = (token) => wx.setStorageSync(TOKEN_KEY, token);
const getToken = () => wx.getStorageSync(TOKEN_KEY);
const setUserId = (userId) => wx.setStorageSync(USER_ID_KEY, userId);
const getUserId = () => wx.getStorageSync(USER_ID_KEY);
const logout = () => {
  wx.removeStorageSync(TOKEN_KEY);
  wx.removeStorageSync(USER_ID_KEY);
};

module.exports = {
  login,
  getToken,
  getUserId,
  logout
};