// pages/orders/index.js
const auth = require('../../utils/auth');
const config = require('../../config');

Page({
  data: {
    orderList: [],
    isLoading: true,
    error: null,
    // MODIFIED: Simplified status map, styling is now in WXSS
    statusMap: {
      pending_payment: 'Awaiting Payment',
      paid: 'Awaiting Pickup',
      pending_pickup: 'Awaiting Pickup', // Keep this for backward compatibility
      completed: 'Completed',
      cancelled: 'Cancelled'
    }
  },
  onShow() { this.fetchUserOrders(); },
  fetchUserOrders() {
    const userId = auth.getUserId();
    if (!userId) { return; }
    this.setData({ isLoading: true, error: null });
    wx.request({
      url: `${config.apiBaseUrl}/orders/user/${userId}`,
      success: (res) => { this.setData({ orderList: res.data }); },
      fail: (err) => { this.setData({ error: 'Failed to load orders.' }); },
      complete: () => { this.setData({ isLoading: false }); }
    });
  }
});