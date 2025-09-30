// miniprogram/utils/api.js - 统一的API请求工具
const config = require('../config');
const tokenUtil = require('./token');
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
let ongoingLoginPromise = null;

const request = ({ url, method = 'GET', data = {}, retry = true }) => new Promise((resolve, reject) => {
  const token = tokenUtil.getToken();
  wx.request({
    url: `${config.apiBaseUrl}${url}`,
    method,
    data,
    timeout: 10000,
    header: {
      'Content-Type': 'application/json',
      Authorization: token ? `Bearer ${token}` : '',
    },
    success: async (res) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        return resolve(res.data);
      }

      if (res.statusCode === 401 && retry) {
        tokenUtil.clearToken();
        try {
          if (!ongoingLoginPromise) {
            ongoingLoginPromise = auth
              .ensureLoggedIn()
              .finally(() => {
                ongoingLoginPromise = null;
              });
          }
          await ongoingLoginPromise;
          const retryResult = await request({ url, method, data, retry: false });
          return resolve(retryResult);
        } catch (loginError) {
          ongoingLoginPromise = null;
          return reject(loginError);
        }
      }

      const errorPayload = res.data && typeof res.data === 'object' ? res.data : { message: `Request failed with status ${res.statusCode}` };
      return reject(errorPayload);
    },
    fail: () => reject({ message: '网络请求失败', errorCode: 'NETWORK_ERROR' }),
  });
});

module.exports = {
  request
};
