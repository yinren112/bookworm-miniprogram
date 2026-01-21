// subpackages/review/pages/session-complete/index.js
// 复习完成结算页面

const { getStreakInfo, getTodayQueue } = require('../../../../utils/study-api');

Page({
  data: {
    loading: true,
    // 本次复习统计
    cardCount: 0,
    durationSeconds: 0,
    starredCount: 0,
    // Streak 信息
    currentStreak: 0,
    bestStreak: 0,
    // 下一步
    remainingCards: 0,
    courseKey: '',
  },

  onLoad(options) {
    const { count, duration, starred, courseKey } = options;
    const decodedCourseKey = courseKey ? decodeURIComponent(courseKey) : "";
    this.setData({
      cardCount: parseInt(count, 10) || 0,
      durationSeconds: parseInt(duration, 10) || 0,
      starredCount: parseInt(starred, 10) || 0,
      courseKey: decodedCourseKey,
    });

    this.loadStats();
  },

  async loadStats() {
    try {
      // 获取 streak 信息
      const streakRes = await getStreakInfo();
      
      // 获取剩余待复习
      let remainingCards = 0;
      if (this.data.courseKey) {
        try {
          const queueRes = await getTodayQueue(this.data.courseKey);
          remainingCards = queueRes.summary?.dueCards || 0;
        } catch (e) {
          // ignore
        }
      }

      this.setData({
        currentStreak: streakRes.currentStreak || 0,
        bestStreak: streakRes.bestStreak || 0,
        remainingCards,
        loading: false,
      });
    } catch (err) {
      this.setData({ loading: false });
    }
  },

  // 继续复习
  continueReview() {
    const { courseKey } = this.data;
    if (courseKey) {
      wx.redirectTo({
        url: `/subpackages/review/pages/flashcard/index?courseKey=${encodeURIComponent(courseKey)}`,
      });
    } else {
      this.goHome();
    }
  },

  // 返回首页
  goHome() {
    wx.switchTab({
      url: '/pages/review/index',
    });
  },

  onShareAppMessage() {
    return {
      title: `我刚完成了${this.data.cardCount}张卡片的复习！`,
      path: '/pages/review/index',
    };
  },
});
