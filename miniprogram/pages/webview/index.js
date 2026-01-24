const { request } = require('../../utils/api');
const { extractErrorMessage } = require('../../utils/error');
const logger = require('../../utils/logger');

Page({
  data: {
    content: null,
    isLoading: true,
    errorMsg: ''
  },

  onRetry() {
    if (this.currentSlug) {
      this.loadContent(this.currentSlug);
    }
  },

  onLoad(options) {
    const { slug } = options;
    this.hasShownOnce = false;
    this.currentSlug = slug || '';

    if (!slug) {
      this.setData({
        isLoading: false,
        errorMsg: '页面参数缺失'
      });
      return;
    }

    this.loadContent(slug);
  },

  onShow() {
    if (!this.currentSlug) {
      return;
    }

    if (this.hasShownOnce) {
      this.loadContent(this.currentSlug, { preserveData: true });
    } else {
      this.hasShownOnce = true;
    }
  },

  async loadContent(slug, { preserveData = false } = {}) {
    if (!preserveData) {
      this.setData({ isLoading: true, errorMsg: '' });
    } else {
      this.setData({ errorMsg: '' });
    }

    try {
      const data = await request({
        url: '/content/' + slug,
        method: 'GET'
      });
      const { title, body } = data;
      wx.setNavigationBarTitle({ title });
      this.setData({
        content: { title, body },
        isLoading: false
      });
    } catch (error) {
      logger.error('Content load failed', error);
      this.setData({
        isLoading: false,
        errorMsg: extractErrorMessage(error, '内容加载失败')
      });
    }
  }
});
