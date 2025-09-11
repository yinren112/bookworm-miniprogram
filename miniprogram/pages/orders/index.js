// pages/orders/index.js
const auth = require('../../utils/auth');
const { request } = require('../../utils/api');
const { ORDER_STATUS } = require('../../utils/constants');

Page({
  data: {
    orderList: [],
    isLoading: true,
    error: null,
    statusMap: ORDER_STATUS,
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
  async fetchUserOrders() {
    const userId = auth.getUserId();
    if (!userId) { return; }
    this.setData({ isLoading: true, error: null });
    
    try {
      const data = await request({
        url: `/orders/user/${userId}`,
        method: 'GET'
      });
      this.setData({ orderList: data });
    } catch (error) {
      this.setData({ error: error.error || '加载订单失败。' });
    } finally {
      this.setData({ isLoading: false });
    }
  },

  // Pull down refresh
  async onPullDownRefresh() {
    await this.fetchUserOrders();
    wx.stopPullDownRefresh();
  }
});