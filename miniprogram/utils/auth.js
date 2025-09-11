// miniprogram/utils/auth.js
const { request } = require('./api');
const tokenUtil = require('./token'); // 引入新的token模块

const login = () => {
  return new Promise((resolve, reject) => {
    wx.login({
      success: async (res) => {
        if (res.code) {
          try {
            const data = await request({
              url: '/auth/login',
              method: 'POST',
              data: { code: res.code }
            });
            
            if (data.token) {
              tokenUtil.setToken(data.token); // 使用新模块
              tokenUtil.setUserId(data.userId); // 使用新模块
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
      fail: (err) => { reject(err); }
    });
  });
};

const logout = () => {
  tokenUtil.clearToken(); // 使用新模块
};

module.exports = {
  login,
  getUserId: tokenUtil.getUserId, // 直接导出
  logout
};