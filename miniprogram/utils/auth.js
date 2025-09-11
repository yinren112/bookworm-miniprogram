// utils/auth.js
const { request } = require('./api');
const TOKEN_KEY = 'authToken';
const USER_ID_KEY = 'userId';

const login = () => {
  return new Promise((resolve, reject) => {
    wx.login({
      success: async (res) => {
        if (res.code) {
          try {
            const data = await request({
              url: '/auth/login',
              method: 'POST',
              data: {
                code: res.code
              }
            });
            
            if (data.token) {
              setToken(data.token);
              setUserId(data.userId);
              resolve(data);
            } else {
              reject(new Error('Login failed on server.'));
            }
          } catch (error) {
            reject(new Error(error.error || 'Login failed on server.'));
          }
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