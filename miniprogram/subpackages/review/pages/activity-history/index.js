// subpackages/review/pages/activity-history/index.js
// 学习记录页

const { getActivityHistory } = require('../../utils/study-api');
const logger = require('../../../../utils/logger');

Page({
  data: {
    loading: true,
    error: false,
    empty: false,
    days: [],
    selectedDate: '',
    scrollTargetId: '',
  },

  onLoad(options) {
    const { date } = options || {};
    this.setData({
      selectedDate: date || '',
    });
    this.loadHistory();
  },

  async loadHistory() {
    this.setData({ loading: true, error: false, empty: false });
    try {
      const res = await getActivityHistory({ days: 35 });
      const days = res.days || [];
      this.setData({
        days,
        loading: false,
        empty: days.length === 0,
        scrollTargetId: this.data.selectedDate ? `day-${this.data.selectedDate}` : '',
      });
    } catch (err) {
      logger.error('Failed to load activity history:', err);
      this.setData({ loading: false, error: true });
    }
  },

  onRetry() {
    this.loadHistory();
  },

  onFeedback() {
    wx.navigateTo({
      url: '/pages/customer-service/index',
    });
  },

  goHome() {
    wx.switchTab({
      url: '/pages/review/index',
    });
  },
});
