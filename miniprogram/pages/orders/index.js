// pages/orders/index.js
const { request } = require('../../utils/api');
const { ORDER_STATUS } = require('../../utils/constants');
const tokenUtil = require('../../utils/token');
const ui = require('../../utils/ui');
const { extractErrorMessage } = require('../../utils/error');

Page({
  data: {
    state: {
      status: 'loading', // 'loading', 'success', 'error'
      data: [],
      error: null
    },
    statusMap: ORDER_STATUS,
    pageInfo: null // For pagination metadata
  },
  onShow() { this.fetchUserOrders(); },
  navigateToDetail(event) {
    const orderId = event.currentTarget.dataset.orderId;
    if (orderId) {
      wx.navigateTo({
        url: `/pages/order-detail/index?id=${orderId}`
      });
    }
  },
  async fetchUserOrders({ preserveData = false } = {}) {
    const userId = tokenUtil.getUserId();
    if (!userId) { return; }
    if (!preserveData) {
      this.setData({
        state: {
          status: 'loading',
          data: [],
          error: null,
        },
      });
    } else {
      this.setData({ 'state.error': null });
    }

    try {
      const data = await request({
        url: `/orders/my`,
        method: 'GET'
      });
      this.setData({
        state: {
          status: 'success',
          data: data.data,
          error: null
        },
        pageInfo: data.meta
      });
    } catch (error) {
      const errorMsg = extractErrorMessage(error, '加载订单失败。');
      this.setData({
        state: {
          status: 'error',
          data: [],
          error: errorMsg
        }
      });
      ui.showError(errorMsg);
    }
  },

  // Pull down refresh
  async onPullDownRefresh() {
    await this.fetchUserOrders({ preserveData: true });
    wx.stopPullDownRefresh();
  }
});
