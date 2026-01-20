// subpackages/review/pages/flashcard/index.js
// 卡片复习页

const { startSession, submitCardAnswer } = require('../../utils/study-api');

Page({
  data: {
    loading: true,
    submitting: false, // 防重复提交
    courseKey: '',
    unitId: null,
    sessionId: '',
    cards: [],
    currentIndex: 0,
    currentCard: null,
    isFlipped: false,
    completed: false,
    progressPercent: 0,
    showReportModal: false,
  },

  onLoad(options) {
    const { courseKey, unitId } = options;
    if (courseKey) {
      this.setData({
        courseKey: decodeURIComponent(courseKey),
        unitId: unitId ? parseInt(unitId, 10) : null,
      });
      this.loadSession();
    } else {
      this.setData({ loading: false });
      wx.showToast({
        title: '缺少课程参数',
        icon: 'none',
      });
    }
  },

  async loadSession() {
    this.setData({ loading: true });

    try {
      const options = {};
      if (this.data.unitId) {
        options.unitId = this.data.unitId;
      }

      const res = await startSession(this.data.courseKey, options);
      const { sessionId, cards } = res;

      if (!cards || cards.length === 0) {
        this.setData({
          loading: false,
          cards: [],
        });
        return;
      }

      this.setData({
        sessionId,
        cards,
        currentIndex: 0,
        currentCard: cards[0],
        isFlipped: false,
        completed: false,
        loading: false,
        progressPercent: 0,
      });
    } catch (err) {
      console.error('Failed to start session:', err);
      this.setData({ loading: false });
      wx.showToast({
        title: '加载失败',
        icon: 'none',
      });
    }
  },

  flipCard() {
    if (this.data.isFlipped) return;

    // 触觉反馈
    wx.vibrateShort({ type: 'light' });

    this.setData({ isFlipped: true });
  },

  async submitFeedback(e) {
    // 防重复提交
    if (this.data.submitting) return;

    const { rating } = e.currentTarget.dataset;
    const { currentCard, sessionId, currentIndex, cards } = this.data;

    if (!currentCard || !rating) return;

    // 设置提交状态
    this.setData({ submitting: true });

    // 触觉反馈
    wx.vibrateShort({ type: 'medium' });

    try {
      await submitCardAnswer(currentCard.contentId, sessionId, rating);

      const nextIndex = currentIndex + 1;
      const isLastCard = nextIndex >= cards.length;

      if (isLastCard) {
        this.setData({
          completed: true,
          progressPercent: 100,
        });
      } else {
        this.setData({
          currentIndex: nextIndex,
          currentCard: cards[nextIndex],
          isFlipped: false,
          progressPercent: Math.round((nextIndex / cards.length) * 100),
        });
      }
    } catch (err) {
      console.error('Failed to submit feedback:', err);
      // 提示用户提交失败，停留当前卡片
      wx.showToast({
        title: '同步失败，请检查网络',
        icon: 'none',
        duration: 2000,
      });
    } finally {
      this.setData({ submitting: false });
    }
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
    } else {
      wx.switchTab({
        url: '/pages/review/index',
      });
    }
  },

  openReportModal() {
    wx.vibrateShort({ type: 'light' });
    this.setData({ showReportModal: true });
  },

  closeReportModal() {
    this.setData({ showReportModal: false });
  },

  onReportSuccess() {
    // 反馈提交成功后的回调
  },

  onShareAppMessage() {
    return {
      title: '一起来复习吧',
      path: '/pages/review/index',
    };
  },
});
