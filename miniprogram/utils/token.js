// miniprogram/utils/token.js
const TOKEN_KEY = 'authToken';
const USER_ID_KEY = 'userId';

const setToken = (token) => wx.setStorageSync(TOKEN_KEY, token);
const getToken = () => wx.getStorageSync(TOKEN_KEY);
const setUserId = (userId) => wx.setStorageSync(USER_ID_KEY, userId);
const getUserId = () => wx.getStorageSync(USER_ID_KEY);
const clearToken = () => {
  wx.removeStorageSync(TOKEN_KEY);
  wx.removeStorageSync(USER_ID_KEY);
};

module.exports = {
  setToken,
  getToken,
  setUserId,
  getUserId,
  clearToken,
};