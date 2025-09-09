// pages/book-detail/index.js
const auth = require('../../utils/auth');
const config = require('../../config');

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

  fetchBookDetails(id) {
    this.setData({ isLoading: true, error: null });
    wx.request({
      url: `${config.apiBaseUrl}/inventory/item/${id}`,
      method: 'GET',
      success: (res) => {
        if (res.statusCode === 200) {
          this.setData({ bookDetail: res.data });
        } else {
          this.setData({ error: '无法加载书籍详情' });
        }
      },
      fail: (err) => {
        this.setData({ error: '网络请求失败' });
      },
      complete: () => {
        this.setData({ isLoading: false });
      }
    });
  },

  // MODIFIED: This function now navigates to the confirm page
  handleBuyNow() {
    const bookData = JSON.stringify(this.data.bookDetail);
    wx.navigateTo({
      url: `/pages/order-confirm/index?book=${encodeURIComponent(bookData)}`,
    });
  }
});