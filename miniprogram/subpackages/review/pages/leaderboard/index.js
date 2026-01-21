// subpackages/review/pages/leaderboard/index.js
// 周榜页面

const { getLeaderboard } = require('../../utils/study-api');
const logger = require('../../../../utils/logger');

Page({
  data: {
    loading: true,
    items: [],
    myRank: null,
    myStreak: null,
    refreshing: false,
  },

  onLoad() {
    this.loadLeaderboard();
  },

  onShow() {
    // 每次显示页面时刷新数据
    if (!this.data.loading) {
      this.loadLeaderboard();
    }
  },

  async loadLeaderboard() {
    this.setData({ loading: true });

    try {
      const res = await getLeaderboard({ limit: 50 });
      this.setData({
        items: res.items || [],
        myRank: res.myRank,
        myStreak: res.myStreak,
        loading: false,
      });
    } catch (err) {
      logger.error('Failed to load leaderboard:', err);
      this.setData({ loading: false });
      wx.showToast({
        title: '加载失败',
        icon: 'none',
      });
    }
  },

  async onPullDownRefresh() {
    this.setData({ refreshing: true });
    await this.loadLeaderboard();
    this.setData({ refreshing: false });
    wx.stopPullDownRefresh();
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

  onShareAppMessage() {
    const { myRank, myStreak } = this.data;
    let title = '一起来学习，看看谁是学霸';
    if (myRank && myRank <= 10) {
      title = `我在学习周榜第${myRank}名，来挑战我吧`;
    } else if (myStreak && myStreak.currentStreak >= 7) {
      title = `我已连续学习${myStreak.currentStreak}天，一起来打卡`;
    }

    return {
      title,
      path: '/pages/review/index',
    };
  },
});
