// pages/review/index.js
// 复习首页

const { getDashboard, getCourses } = require('../../utils/study-api');
const { swrFetch } = require('../../utils/cache');
const logger = require('../../utils/logger');
const { getResumeSession, getLastSessionType } = require('../../utils/study-session');
const { REVIEW_DASHBOARD_CACHE_VERSION, REVIEW_COURSES_CACHE_VERSION } = require('../../utils/constants');
const { track } = require('../../utils/track');

Page({
  data: {
    loading: true,
    error: false,
    todayDate: '',
    dashboard: null,
    currentCourse: null,
    heatmapData: [],
    resumeSession: null,
    recommendedCourses: [],
    highlightStart: false,
    noDueTasks: false,
    primaryCtaText: '一键开始今日复习',
  },

  onLoad(options) {
    this.setTodayDate();
    if (options && options.source === 'reminder') {
      this.setData({ highlightStart: true });
      track('reminder_open', { route: 'pages/review/index' });
    }
  },

  onShow() {
    this.loadData();
  },

  setTodayDate() {
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
    const weekDay = weekDays[now.getDay()];
    this.setData({
      todayDate: `${month}月${day}日 周${weekDay}`,
    });
  },

  async loadData(options = {}) {
    const { forceRefresh = false } = options;
    this.setData({ loading: true, error: false });

    try {
      const dashboard = await swrFetch(
        `review:dashboard:${REVIEW_DASHBOARD_CACHE_VERSION}`,
        () => getDashboard(),
        { ttlMs: 600000, forceRefresh }
      );

      const currentCourse = dashboard?.currentCourse
        ? {
            ...dashboard.currentCourse,
            progressPercent: Math.round((dashboard.currentCourse.progress || 0) * 100),
          }
        : null;
      const heatmapData = (dashboard?.activeHeatmap || []).map((item) => ({
        date: item.date,
        count: item.count,
        level: item.level || 0,
      }));

      let recommendedCourses = [];
      if (!currentCourse) {
        try {
          const recRes = await swrFetch(
            `review:courses:${REVIEW_COURSES_CACHE_VERSION}`,
            () => getCourses(),
            { ttlMs: 600000, forceRefresh }
          );
          recommendedCourses = (recRes.courses || []).slice(0, 3);
        } catch (err) {
          logger.error('Failed to load recommended courses:', err);
        }
      }

      const resumeSession = getResumeSession();
      const dueTotal =
        (dashboard?.dueCardCount || 0) +
        (dashboard?.dueQuizCount || 0) +
        (dashboard?.wrongCount || 0);
      const noDueTasks = !!currentCourse && dueTotal === 0;

      this.setData({
        dashboard,
        currentCourse,
        heatmapData,
        resumeSession,
        recommendedCourses,
        noDueTasks,
        primaryCtaText: noDueTasks ? '今日无到期，来一组巩固' : '一键开始今日复习',
        loading: false,
      });

      track('review_home_view', {
        dueCardCount: dashboard?.dueCardCount || 0,
        etaMinutes: dashboard?.etaMinutes || 0,
      });
    } catch (err) {
      logger.error('Failed to load dashboard:', err);
      this.setData({ loading: false, error: true });
    }
  },

  onRetry() {
    this.loadData({ forceRefresh: true });
  },

  onFeedback() {
    wx.navigateTo({
      url: '/pages/customer-service/index',
    });
  },

  navigateToCourse(e) {
    const { courseKey } = e.currentTarget.dataset;
    if (!courseKey) return;
    wx.navigateTo({
      url: `/subpackages/review/pages/course/index?courseKey=${encodeURIComponent(courseKey)}`,
    });
  },

  goToFirstRecommended() {
    const first = this.data.recommendedCourses[0];
    if (!first || !first.courseKey) {
      wx.showToast({
        title: '暂无推荐课程',
        icon: 'none',
      });
      return;
    }
    wx.navigateTo({
      url: `/subpackages/review/pages/course/index?courseKey=${encodeURIComponent(first.courseKey)}`,
    });
  },

  startPrimaryCta() {
    if (this.data.noDueTasks) {
      this.startPracticeSession();
      return;
    }
    this.startTodayReview();
  },

  startTodayReview() {
    if (!this.data.currentCourse) {
      wx.showToast({
        title: '请先选择课程',
        icon: 'none',
      });
      return;
    }

    const lastSessionType = getLastSessionType();
    const firstType = lastSessionType === 'quiz' ? 'quiz' : 'flashcard';
    const nextType = firstType === 'quiz' ? 'flashcard' : 'quiz';

    track('review_start_click', {
      entry: 'dashboard',
      firstType,
    });

    if (firstType === 'quiz') {
      this.navigateToQuiz({ nextType });
    } else {
      this.navigateToFlashcard({ nextType });
    }
  },

  continueSession() {
    const session = getResumeSession();
    if (!session) {
      wx.showToast({
        title: '没有可继续的会话',
        icon: 'none',
      });
      return;
    }

    track('review_start_click', {
      entry: 'resume',
      firstType: session.type,
    });

    if (session.type === 'quiz') {
      this.navigateToQuiz({ resume: true });
    } else {
      this.navigateToFlashcard({ resume: true });
    }
  },

  startWrongQuiz() {
    if (!this.data.currentCourse) {
      wx.showToast({
        title: '请先选择课程',
        icon: 'none',
      });
      return;
    }

    this.navigateToQuiz({ wrongItemsOnly: true });
  },

  startPracticeSession() {
    if (!this.data.currentCourse) {
      wx.showToast({
        title: '请先选择课程',
        icon: 'none',
      });
      return;
    }

    const choices = [
      { label: '10 张卡片', limit: 10 },
      { label: '20 张卡片', limit: 20 },
      { label: '30 张卡片', limit: 30 },
    ];

    wx.showActionSheet({
      itemList: choices.map((item) => item.label),
      success: (res) => {
        const choice = choices[res.tapIndex];
        if (!choice) return;
        track('review_start_click', {
          entry: 'practice',
          firstType: 'flashcard',
          limit: choice.limit,
        });
        this.navigateToFlashcard({ limit: choice.limit, entry: 'practice' });
      },
    });
  },

  navigateToFlashcard(options = {}) {
    const { currentCourse } = this.data;
    if (!currentCourse) return;

    const params = [
      `courseKey=${encodeURIComponent(currentCourse.courseKey)}`
    ];
    if (options.nextType) params.push(`nextType=${options.nextType}`);
    if (options.resume) params.push('resume=1');
    if (options.entry) params.push(`entry=${options.entry}`);
    if (options.limit) params.push(`limit=${options.limit}`);

    wx.navigateTo({
      url: `/subpackages/review/pages/flashcard/index?${params.join('&')}`,
    });
  },

  navigateToQuiz(options = {}) {
    const { currentCourse } = this.data;
    if (!currentCourse) return;

    const params = [
      `courseKey=${encodeURIComponent(currentCourse.courseKey)}`
    ];
    if (options.nextType) params.push(`nextType=${options.nextType}`);
    if (options.resume) params.push('resume=1');
    if (options.wrongItemsOnly) params.push('wrongItemsOnly=true');

    wx.navigateTo({
      url: `/subpackages/review/pages/quiz/index?${params.join('&')}`,
    });
  },

  onHeatmapTap(e) {
    const { date } = e.currentTarget.dataset;
    if (!date) {
      wx.navigateTo({
        url: '/subpackages/review/pages/leaderboard/index',
      });
      return;
    }
    wx.navigateTo({
      url: `/subpackages/review/pages/activity-history/index?date=${date}`,
    });
  },

  onPullDownRefresh() {
    this.loadData({ forceRefresh: true }).finally(() => {
      wx.stopPullDownRefresh();
    });
  },
});
