// subpackages/review/pages/session-complete/index.js
// 复习完成结算页面

const { getStreakInfo, getDashboard, subscribeStudyReminder, getStudyReminderStatus } = require('../../../../utils/study-api');
const { STUDY_REMINDER_TEMPLATE_ID } = require('../../../../utils/constants');
const { track } = require('../../../../utils/track');
const logger = require('../../../../utils/logger');

Page({
  data: {
    loading: true,
    // 本次复习统计
    mode: 'flashcard',
    count: 0,
    correctCount: 0,
    wrongCount: 0,
    accuracy: 0,
    durationSeconds: 0,
    durationText: '',
    starredCount: 0,
    // Streak 信息
    currentStreak: 0,
    bestStreak: 0,
    nextDueText: '',
    // 下一步
    courseKey: '',
    nextType: '',
    reminderStatus: 'UNKNOWN',
    nextSendAt: null,
    subscribeLoading: false,
    actionLoading: false,
    actionType: '',
  },

  onLoad(options) {
    const { mode, count, duration, starred, courseKey, correct, wrong, nextType } = options || {};
    const decodedCourseKey = courseKey ? decodeURIComponent(courseKey) : "";
    const parsedCount = parseInt(count, 10) || 0;
    const parsedCorrect = parseInt(correct, 10) || 0;
    const parsedWrong = parseInt(wrong, 10) || Math.max(0, parsedCount - parsedCorrect);
    const parsedDuration = parseInt(duration, 10) || 0;

    this.setData({
      mode: mode || 'flashcard',
      count: parsedCount,
      correctCount: parsedCorrect,
      wrongCount: parsedWrong,
      accuracy: parsedCount > 0 ? Math.round((parsedCorrect / parsedCount) * 100) : 0,
      durationSeconds: parsedDuration,
      durationText: formatDuration(parsedDuration),
      starredCount: parseInt(starred, 10) || 0,
      courseKey: decodedCourseKey,
      nextType: nextType || '',
    });

    this.loadStats();
    this.loadReminderStatus();
  },

  async loadStats() {
    try {
      const streakRes = await getStreakInfo();
      let nextDueText = '暂无到期';
      if (this.data.courseKey) {
        try {
          const dashboard = await getDashboard({ courseKey: this.data.courseKey });
          const dueTotal = (dashboard?.dueCardCount || 0) + (dashboard?.dueQuizCount || 0);
          nextDueText = dueTotal > 0 ? `今日剩余 ${dueTotal} 项` : '暂无到期';
        } catch (err) {
          logger.error('Failed to load dashboard summary:', err);
        }
      }

      this.setData({
        currentStreak: streakRes.currentStreak || 0,
        bestStreak: streakRes.bestStreak || 0,
        nextDueText,
        loading: false,
      });
    } catch (err) {
      this.setData({ loading: false });
    }
  },

  async loadReminderStatus() {
    if (!STUDY_REMINDER_TEMPLATE_ID || STUDY_REMINDER_TEMPLATE_ID === 'TEMPLATE_ID') {
      return;
    }
    try {
      const status = await getStudyReminderStatus({ templateId: STUDY_REMINDER_TEMPLATE_ID });
      this.setData({
        reminderStatus: status.status || 'UNKNOWN',
        nextSendAt: status.nextSendAt || null,
      });
    } catch (err) {
      logger.error('Failed to load reminder status:', err);
    }
  },

  async onSubscribeReminder() {
    if (this.data.subscribeLoading) return;

    if (!STUDY_REMINDER_TEMPLATE_ID || STUDY_REMINDER_TEMPLATE_ID === 'TEMPLATE_ID') {
      wx.showToast({
        title: '订阅模板未配置',
        icon: 'none',
      });
      return;
    }

    this.setData({ subscribeLoading: true });
    track('subscribe_click', { entry: 'settlement' });

    wx.requestSubscribeMessage({
      tmplIds: [STUDY_REMINDER_TEMPLATE_ID],
      success: async (res) => {
        const result = res[STUDY_REMINDER_TEMPLATE_ID];
        const normalized = result === 'accept' ? 'accept' : 'reject';
        track('subscribe_result', { result: normalized });

        try {
          const response = await subscribeStudyReminder({
            templateId: STUDY_REMINDER_TEMPLATE_ID,
            result: normalized,
            timezone: 'Asia/Shanghai',
          });
          this.setData({
            reminderStatus: response.status || 'UNKNOWN',
            nextSendAt: response.nextSendAt || null,
          });
        } catch (err) {
          logger.error('Failed to subscribe reminder:', err);
          wx.showToast({
            title: '订阅失败',
            icon: 'none',
          });
        }
      },
      fail: (err) => {
        logger.error('Subscribe message failed:', err);
        wx.showToast({
          title: '订阅失败',
          icon: 'none',
        });
      },
      complete: () => {
        this.setData({ subscribeLoading: false });
      }
    });
  },

  // 继续复习
  continueReview() {
    if (this.data.actionLoading) return;
    const { courseKey, nextType, mode } = this.data;
    if (!courseKey) {
      this.goHome();
      return;
    }

    this.setActionLoading('continue');
    const targetType = nextType || mode;
    if (targetType === 'quiz') {
      wx.redirectTo({
        url: `/subpackages/review/pages/quiz/index?courseKey=${encodeURIComponent(courseKey)}`,
        fail: () => {
          this.clearActionLoading();
          wx.showToast({
            title: '跳转失败',
            icon: 'none',
          });
        },
      });
      return;
    }

    wx.redirectTo({
      url: `/subpackages/review/pages/flashcard/index?courseKey=${encodeURIComponent(courseKey)}`,
      fail: () => {
        this.clearActionLoading();
        wx.showToast({
          title: '跳转失败',
          icon: 'none',
        });
      },
    });
  },

  startWrongQuiz() {
    const { courseKey } = this.data;
    if (!courseKey) {
      this.goHome();
      return;
    }
    wx.redirectTo({
      url: `/subpackages/review/pages/quiz/index?courseKey=${encodeURIComponent(courseKey)}&wrongItemsOnly=true`,
    });
  },

  // 返回首页
  goHome() {
    if (this.data.actionLoading) return;
    this.setActionLoading('home');
    wx.switchTab({
      url: '/pages/review/index',
      fail: () => {
        this.clearActionLoading();
        wx.showToast({
          title: '跳转失败',
          icon: 'none',
        });
      },
    });
  },

  onShareAppMessage() {
    const title = this.data.mode === 'quiz'
      ? `我刚完成了${this.data.count}道测验题！`
      : `我刚完成了${this.data.count}张卡片的复习！`;
    return {
      title,
      path: '/pages/review/index',
    };
  },

  setActionLoading(type) {
    this.setData({ actionLoading: true, actionType: type });
  },

  clearActionLoading() {
    this.setData({ actionLoading: false, actionType: '' });
  },
});

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0秒';
  if (seconds < 60) return `${seconds}秒`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}分钟`;
}
