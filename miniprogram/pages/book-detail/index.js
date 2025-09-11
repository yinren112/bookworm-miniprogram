// pages/book-detail/index.js
const auth = require('../../utils/auth');
const { request } = require('../../utils/api');

Page({
  data: {
    bookDetail: null,
    isLoading: true,
    error: null,
  },

  onLoad(options) {
    if (options.id) {
      this.fetchBookDetails(options.id);
    } else {
      this.setData({ error: '无效的书籍ID', isLoading: false });
    }
  },

  async fetchBookDetails(id) {
    this.setData({ isLoading: true, error: null });
    try {
      const data = await request({
        url: `/inventory/item/${id}`,
        method: 'GET'
      });
      this.setData({ bookDetail: data });
    } catch (error) {
      console.error('API request failed', error);
      this.setData({ error: error.error || '加载失败' });
      wx.showToast({
        title: error.error || '加载失败',
        icon: 'none'
      });
    } finally {
      this.setData({ isLoading: false });
    }
  },

  handleBuyNow() {
    const inventoryItemId = this.data.bookDetail.id;
    wx.navigateTo({
      url: `/pages/order-confirm/index?id=${inventoryItemId}`,
    });
  }
});