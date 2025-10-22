// miniprogram/utils/api.js - 统一的API请求工具
const baseRequest = require('./request');
const tokenUtil = require('./token');
const authGuard = require('./auth-guard');

/**
 * 统一的API请求函数（带业务逻辑层）
 * @param {Object} options - 请求参数
 * @param {string} options.url - 请求地址（相对路径，会自动拼接baseURL）
 * @param {string} options.method - 请求方法（GET, POST等）
 * @param {Object} options.data - 请求数据
 * @param {boolean} options.requireAuth - 是否需要鉴权（默认true）
 * @param {boolean} options.retry - 是否允许401重试（默认true，内部使用）
 * @returns {Promise} - 返回Promise对象
 */
async function request({ url, method = 'GET', data = {}, requireAuth = true, retry = true } = {}) {
  // 前置守卫：如果需要鉴权，先确保已登录
  if (requireAuth) {
    try {
      await authGuard.ensureLoggedIn({ silent: true });
    } catch (error) {
      throw { message: '登录失败，请稍后再试', errorCode: 'AUTH_FAILED' };
    }
  }

  try {
    // 调用底层请求客户端
    const result = await baseRequest.request({
      url,
      method,
      data,
      requireAuth,
    });
    return result;
  } catch (error) {
    // 401 处理：清除 token 并重新登录，然后重试一次
    if (error.statusCode === 401 && requireAuth && retry) {
      tokenUtil.clearToken();
      await authGuard.ensureLoggedIn({ silent: false }); // 弹 toast 提示用户
      // 重试请求（只重试一次，防止无限循环）
      return await request({ url, method, data, requireAuth, retry: false });
    }

    // 其他错误直接抛出
    throw error;
  }
}

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
