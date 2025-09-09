// pages/market/index.js
const auth = require('../../utils/auth');
const config = require('../../config');

Page({
  data: {
    bookList: [],
    isLoading: true,
    error: null,
    searchTerm: '',
    searchPerformed: false // To show different empty state messages
  },

  onLoad(options) {
    this.fetchAvailableBooks();
  },

  // MODIFIED: fetchAvailableBooks now takes a search term
  fetchAvailableBooks() {
    this.setData({ isLoading: true, error: null });
    let url = `${config.apiBaseUrl}/inventory/available`;
    if (this.data.searchTerm) {
      url += `?search=${encodeURIComponent(this.data.searchTerm)}`;
    }

    wx.request({
      url: url,
      method: 'GET',
      success: (res) => {
        if (res.statusCode === 200) {
          this.setData({ bookList: res.data });
        } else {
          this.setData({ error: '无法加载书籍列表', bookList: [] });
        }
      },
      fail: (err) => {
        console.error('API request failed', err);
        this.setData({ error: '网络请求失败，请检查后端服务是否开启', bookList: [] });
      },
      complete: () => {
        this.setData({ isLoading: false });
      }
    })
  },

  // NEW: Handle input change
  handleInput(e) {
    this.setData({
      searchTerm: e.detail.value
    });
  },

  // NEW: Handle search button tap or keyboard confirm
  handleSearch() {
    this.setData({ searchPerformed: true });
    this.fetchAvailableBooks();
  },

  // We are moving the "BuyNow" logic to the detail page,
  // so the handleBuyNow function is removed from this page.
});