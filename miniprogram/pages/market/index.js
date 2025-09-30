// pages/market/index.js
const { request } = require('../../utils/api');
const ui = require('../../utils/ui');
const { extractErrorMessage } = require('../../utils/error');

Page({
  data: {
    state: {
      status: 'loading', // 'loading', 'success', 'error'
      data: [],
      error: null
    },
    searchTerm: '',
    searchPerformed: false, // To show different empty state messages
    pageInfo: null // For pagination metadata
  },

  onLoad() {
    this.hasShownOnce = false;
  },

  onShow() {
    if (this.hasShownOnce) {
      this.fetchAvailableBooks({ preserveData: true });
    } else {
      this.hasShownOnce = true;
      this.fetchAvailableBooks();
    }
  },

  async fetchAvailableBooks({ preserveData = false } = {}) {
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
    let url = `/inventory/available`;
    if (this.data.searchTerm) {
      url += `?search=${encodeURIComponent(this.data.searchTerm)}`;
    }

    try {
      const data = await request({
        url: url,
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
      console.error('API request failed', error);
      const errorMsg = extractErrorMessage(error, '加载失败');
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
    await this.fetchAvailableBooks({ preserveData: true });
    wx.stopPullDownRefresh();
  }
});
