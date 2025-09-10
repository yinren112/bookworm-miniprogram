// pages/orders/index.js
const auth = require('../../utils/auth');
const config = require('../../config');
const { ORDER_STATUS } = require('../../utils/constants');

Page({
  data: {
    orderList: [],
    isLoading: true,
    error: null,
    statusMap: ORDER_STATUS,
  },
  onShow() { this.fetchUserOrders(); },
  fetchUserOrders() {
    const userId = auth.getUserId();
    if (!userId) { return; }
    this.setData({ isLoading: true, error: null });
    wx.request({
      url: `${config.apiBaseUrl}/orders/user/${userId}`,
      success: (res) => { this.setData({ orderList: res.data }); },
      fail: (err) => { this.setData({ error: '加载订单失败。' }); },
      complete: () => { this.setData({ isLoading: false }); }
    });
  }
});