// utils/api.js - 统一的API请求工具
const config = require('../config');
const auth = require('./auth');

/**
 * 统一的API请求函数
 * @param {Object} options - 请求参数
 * @param {string} options.url - 请求地址（相对路径，会自动拼接baseURL）
 * @param {string} options.method - 请求方法（GET, POST等）
 * @param {Object} options.data - 请求数据
 * @param {Object} options.header - 请求头
 * @returns {Promise} - 返回Promise对象
 */
const request = ({ url, method = 'GET', data = {} }) => new Promise((resolve, reject) => {
    const token = auth.getToken();
    wx.request({
        url: `${config.apiBaseUrl}${url}`,
        method,
        data,
        header: {
            'Content-Type': 'application/json',
            'Authorization': token ? `Bearer ${token}` : ''
        },
        success: (res) => {
            if (res.statusCode >= 200 && res.statusCode < 300) return resolve(res.data);
            if (res.statusCode === 401) {
                // 简单处理：提示并让用户重启
                wx.showToast({ title: '登录过期，请重启小程序', icon: 'none' });
                auth.logout();
            }
            return reject(res.data || { error: `Request failed with status ${res.statusCode}` });
        },
        fail: (err) => reject({ error: '网络请求失败', errorCode: 'NETWORK_ERROR' })
    });
});

module.exports = {
  request
};