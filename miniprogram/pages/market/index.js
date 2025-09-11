// pages/market/index.js
const auth = require('../../utils/auth');
const { request } = require('../../utils/api');

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
  async fetchAvailableBooks() {
    this.setData({ isLoading: true, error: null });
    let url = `/inventory/available`;
    if (this.data.searchTerm) {
      url += `?search=${encodeURIComponent(this.data.searchTerm)}`;
    }

    try {
      const data = await request({
        url: url,
        method: 'GET'
      });
      this.setData({ bookList: data });
    } catch (error) {
      console.error('API request failed', error);
      this.setData({ 
        error: error.error || '加载失败', 
        bookList: [] 
      });
      wx.showToast({
        title: error.error || '加载失败',
        icon: 'none'
      });
    } finally {
      this.setData({ isLoading: false });
    }
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

  // Pull down refresh
  async onPullDownRefresh() {
    await this.fetchAvailableBooks();
    wx.stopPullDownRefresh();
  }
});