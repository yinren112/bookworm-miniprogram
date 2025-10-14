// pages/market/index.js
const { request, getRecommendations } = require('../../utils/api');
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
    pageInfo: null, // For pagination metadata
    recommendations: [] // Personalized book recommendations
  },

  onLoad() {
    this.hasShownOnce = false;
  },

  onShow() {
    if (this.hasShownOnce) {
      this.fetchAvailableBooks({ preserveData: true });
      this.fetchRecommendations(); // Refresh recommendations on page show
    } else {
      this.hasShownOnce = true;
      this.fetchAvailableBooks();
      this.fetchRecommendations(); // Load recommendations on first show
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
    await this.fetchRecommendations();
    wx.stopPullDownRefresh();
  },

  // Fetch personalized recommendations
  async fetchRecommendations() {
    try {
      const data = await getRecommendations();
      // Only update if we got valid recommendations
      if (data && Array.isArray(data.recommendations)) {
        this.setData({
          recommendations: data.recommendations
        });
      }
    } catch (error) {
      // Silently handle errors - recommendations are optional
      // Don't show error messages to avoid disrupting main page experience
      console.log('Failed to load recommendations (this is optional):', error);
      this.setData({ recommendations: [] });
    }
  },

  // NEW: Handle recommendation card tap
  handleRecommendationTap(e) {
    const isbn = e.currentTarget.dataset.isbn;
    if (isbn) {
      // Navigate to market page with ISBN search
      this.setData({
        searchTerm: isbn,
        searchPerformed: true
      });
      this.fetchAvailableBooks();
    }
  }
});
