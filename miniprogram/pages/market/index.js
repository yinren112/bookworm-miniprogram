// pages/market/index.js
const { request, getRecommendations } = require('../../utils/api');
const ui = require('../../utils/ui');
const { extractErrorMessage } = require('../../utils/error');
const { swrFetch } = require('../../utils/cache');
const logger = require('../../utils/logger');
const { applyCoverProxy } = require('../../utils/image');

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
      // 第二次进入：优先返回缓存，后台刷�?
      this.fetchAvailableBooks();
      this.fetchRecommendations();
    } else {
      this.hasShownOnce = true;
      // 首次进入：正常加�?
      this.fetchAvailableBooks();
      this.fetchAvailableBooks();
    }
  },

  // 处理图片加载失败，降级为占位图
  onImageError(e) {
    const { index, type } = e.currentTarget.dataset;
    if (type === 'recommendation') {
      // 处理推荐列表图片错误
      const list = this.data.recommendations;
      if (!list[index] || list[index].coverImageUrl === '/images/placeholder-cover.svg') return;
      const key = `recommendations[${index}].coverImageUrl`;
      this.setData({ [key]: '/images/placeholder-cover.svg' });
    } else {
      // 处理主列表图片错误
      const list = this.data.state.data;
      if (!list[index] || list[index].booksku.cover_image_url === '/images/placeholder-cover.svg') return;
      const key = `state.data[${index}].booksku.cover_image_url`;
      this.setData({ [key]: '/images/placeholder-cover.svg' });
    }
  },

  async fetchAvailableBooks({ forceRefresh = false } = {}) {
    // 构建缓存键（包含搜索词，不同搜索词不同缓存）
    const searchTerm = this.data.searchTerm || '';
    const cacheKey = `market:list:${searchTerm}`;

    // 显示加载状态（首次加载或强制刷新时�?
    if (forceRefresh || this.data.state.data.length === 0) {
      this.setData({ 'state.status': 'loading', 'state.error': null });
    }

    let url = `/inventory/available`;
    if (searchTerm) {
      url += `?search=${encodeURIComponent(searchTerm)}`;
    }

    const fetcher = () => request({ url, method: 'GET' });

    try {
      const data = await swrFetch(cacheKey, fetcher, {
        ttlMs: 30000, // 30 �?TTL
        forceRefresh,
        onBackgroundUpdate: (freshData) => {
          if (!freshData) {
            return;
          }
          applyCoverProxy(freshData);
          this.setData({
            state: {
              status: 'success',
              data: freshData.data,
              error: null
            },
            pageInfo: freshData.meta
          });
        }
      });

      applyCoverProxy(data);

      this.setData({
        state: {
          status: 'success',
          data: data.data,
          error: null
        },
        pageInfo: data.meta
      });
    } catch (error) {
      logger.error('API request failed', error);
      const errorMsg = extractErrorMessage(error, '加载失败');
      // 失败时不清空旧数据（swrFetch 已降级返回缓存）
      this.setData({
        state: {
          status: 'error',
          data: this.data.state.data, // 保留现有数据
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
    // 下拉刷新强制拉取新数�?
    await Promise.all([
      this.fetchAvailableBooks({ forceRefresh: true }),
      this.fetchRecommendations({ forceRefresh: true })
    ]);
    wx.stopPullDownRefresh();
  },

  // Fetch personalized recommendations
  async fetchRecommendations({ forceRefresh = false } = {}) {
    const cacheKey = 'market:recommendations:v1';
    const fetcher = () => getRecommendations();

    try {
      const data = await swrFetch(cacheKey, fetcher, {
        ttlMs: 60000, // 60 �?TTL（推荐更新频率较低）
        forceRefresh,
        onBackgroundUpdate: (freshData) => {
          // 后台刷新成功，静默更�?UI
          if (freshData && Array.isArray(freshData.recommendations)) {
            this.setData({
              recommendations: freshData.recommendations
            });
          }
        }
      });

      // Only update if we got valid recommendations
      if (data && Array.isArray(data.recommendations)) {
        this.setData({
          recommendations: data.recommendations
        });
      }
    } catch (error) {
      // Silently handle errors - recommendations are optional
      // Don't show error messages to avoid disrupting main page experience
      // swrFetch 已经降级返回缓存（如果有），这里无需额外处理
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




