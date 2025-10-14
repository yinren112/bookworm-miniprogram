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

/**
 * 检查ISBN是否可收购
 * @param {string} isbn - 书籍ISBN（10或13位）
 * @returns {Promise<Object>} - 返回可收购的SKU列表
 */
const checkAcquisition = (isbn) => {
  return request({
    url: `/acquisitions/check?isbn=${encodeURIComponent(isbn)}`,
    method: 'GET'
  });
};

/**
 * 创建收购记录
 * @param {Object} data - 收购数据
 * @param {number} data.customerUserId - 客户用户ID（可选）
 * @param {Array} data.items - 收购书籍列表
 * @param {string} data.settlementType - 结算方式（CASH/VOUCHER）
 * @param {string} data.voucherCode - 代金券码（可选）
 * @param {string} data.notes - 备注（可选）
 * @param {Object} data.customerProfile - 客户画像（可选）
 * @returns {Promise<Object>} - 返回创建的收购记录
 */
const createAcquisition = (data) => {
  return request({
    url: '/acquisitions',
    method: 'POST',
    data
  });
};

/**
 * 获取个性化书籍推荐
 * @returns {Promise<Object>} - 返回推荐书籍列表
 */
const getRecommendations = () => {
  return request({
    url: '/books/recommendations',
    method: 'GET'
  });
};

/**
 * 获取当前用户信息
 * @returns {Promise<Object>} - 返回用户信息（包含role字段）
 */
const getCurrentUser = () => {
  return request({
    url: '/users/me',
    method: 'GET'
  });
};

/**
 * 创建按重量收购订单 (sell order)
 * @param {Object} data - 收购数据
 * @param {string} data.customerPhoneNumber - 客户手机号
 * @param {number} data.totalWeightKg - 总重量（千克）
 * @param {number} data.unitPrice - 单价（分/千克）
 * @param {string} data.settlementType - 结算方式（CASH/VOUCHER）
 * @param {string} data.notes - 备注（可选）
 * @returns {Promise<Object>} - 返回创建的订单信息
 */
const createSellOrder = (data) => {
  return request({
    url: '/sell-orders',
    method: 'POST',
    data
  });
};

module.exports = {
  request,
  checkAcquisition,
  createAcquisition,
  getRecommendations,
  getCurrentUser,
  createSellOrder
};
