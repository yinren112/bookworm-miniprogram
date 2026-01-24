// pages/review/index.js
// 复习首页 (Duolingo Style)

const { getDashboard, getCourses } = require('../../utils/study-api');
const { swrFetch } = require('../../utils/cache');
const logger = require('../../utils/logger');
const { getResumeSession, getLastSessionType } = require('../../utils/study-session');
const { REVIEW_DASHBOARD_CACHE_VERSION, REVIEW_COURSES_CACHE_VERSION } = require('../../utils/constants');
const { track } = require('../../utils/track');
const feedback = require('../../utils/ui/feedback');
const soundManager = require('../../utils/sound-manager');

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
    courses: [],
    enrolledCourses: [],
    discoverCourses: [],
    filteredEnrolledCourses: [],
    filteredDiscoverCourses: [],
    showCoursePicker: false,
    courseSearch: '',
    selectedCourseKey: '',
    highlightStart: false,
    noDueTasks: false,
    primaryCtaText: '开始今日挑战', // Updated Tone
  },

  onLoad(options) {
    this.setTodayDate();
    soundManager.preload();
    const selectedCourseKey = wx.getStorageSync('review:selectedCourseKey') || '';
    this.setData({ selectedCourseKey });
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
      const selectedCourseKey = this.data.selectedCourseKey || undefined;
      const dashboard = await swrFetch(
        `review:dashboard:${REVIEW_DASHBOARD_CACHE_VERSION}`,
        () => getDashboard({ courseKey: selectedCourseKey }),
        { ttlMs: 600000, forceRefresh }
      );

      const currentCourse = dashboard?.currentCourse
        ? {
            ...dashboard.currentCourse,
            progressPercent: Math.round((dashboard.currentCourse.progress || 0) * 100),
          }
        : null;
      
      const heatmapData = (dashboard?.activeHeatmap || [])
        .slice(-7) // Limit to last 7 days to prevent overflow
        .map((item) => {
        const dateObj = new Date(item.date);
        const days = ['日', '一', '二', '三', '四', '五', '六'];
        const dayLabel = days[dateObj.getDay()];
        return {
          date: item.date,
          totalDurationSeconds: item.totalDurationSeconds || 0,
          level: item.level || 0,
          dayLabel,
        };
      });

      let courses = [];
      let recommendedCourses = [];
      try {
        const courseRes = await swrFetch(
          `review:courses:${REVIEW_COURSES_CACHE_VERSION}`,
          () => getCourses(),
          { ttlMs: 600000, forceRefresh }
        );
        courses = courseRes.courses || [];
        recommendedCourses = courses.filter((course) => !course.enrolled).slice(0, 3);
      } catch (err) {
        logger.error('Failed to load courses:', err);
      }

      const resumeSession = getResumeSession();
      const dueTotal =
        (dashboard?.dueCardCount || 0) +
        (dashboard?.dueQuizCount || 0) +
        (dashboard?.wrongCount || 0);
      const noDueTasks = !!currentCourse && dueTotal === 0;

      // Engaging Copy (Tone of Voice)
      let ctaText = '开始今日挑战';
      if (!currentCourse) {
        ctaText = '选择课程开始';
      } else if (noDueTasks) {
        ctaText = '今日任务达成！来组巩固？';
      }

      this.setData({
        dashboard,
        currentCourse,
        heatmapData,
        resumeSession,
        recommendedCourses,
        courses,
        noDueTasks,
        primaryCtaText: ctaText,
        loading: false,
      }, () => this.refreshCourseLists());

      track('review_home_view', {
        dueCardCount: dashboard?.dueCardCount || 0,
        etaMinutes: dashboard?.etaMinutes || 0,
      });
    } catch (err) {
      if (err && err.statusCode === 404 && this.data.selectedCourseKey) {
        this.resetSelectedCourse();
        return;
      }
      logger.error('Failed to load dashboard:', err);
      this.setData({ loading: false, error: true });
    }
  },

  onRetry() {
    this.triggerHaptic('light');
    this.loadData({ forceRefresh: true });
  },

  onFeedback() {
    this.triggerHaptic('light');
    wx.navigateTo({
      url: '/pages/customer-service/index',
    });
  },

  // Helper for consistent feedback
  triggerHaptic(type = 'light') {
    feedback.tap(type);
  },

  navigateToCourse(e) {
    this.triggerHaptic('light');
    const { courseKey } = e.currentTarget.dataset;
    if (!courseKey) {
      this.goToFirstRecommended();
      return;
    }
    wx.navigateTo({
      url: `/subpackages/review/pages/course/index?courseKey=${encodeURIComponent(courseKey)}`,
    });
  },

  goToFirstRecommended() {
    this.triggerHaptic('medium'); // Encouraging feedback
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
    this.triggerHaptic('medium'); // Primary Action Feedback
    if (this.data.noDueTasks) {
      this.startPracticeSession();
      return;
    }
    this.startTodayReview();
  },

  startTodayReview() {
    if (!this.data.currentCourse) {
      this.openCoursePicker();
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

  normalizeText(value) {
    return String(value || '').trim().toLowerCase();
  },

  refreshCourseLists() {
    const courses = this.data.courses || [];
    const enrolledCourses = courses.filter((course) => !!course.enrolled);
    const discoverCourses = courses.filter((course) => !course.enrolled).slice(0, 6);
    this.setData({ enrolledCourses, discoverCourses }, () => this.applyCourseSearch());
  },

  applyCourseSearch() {
    const q = this.normalizeText(this.data.courseSearch);
    if (!q) {
      this.setData({
        filteredEnrolledCourses: this.data.enrolledCourses,
        filteredDiscoverCourses: this.data.discoverCourses,
      });
      return;
    }

    const match = (course) => this.normalizeText(course.title).includes(q) || this.normalizeText(course.courseKey).includes(q);
    this.setData({
      filteredEnrolledCourses: (this.data.enrolledCourses || []).filter(match),
      filteredDiscoverCourses: (this.data.discoverCourses || []).filter(match),
    });
  },

  openCoursePicker() {
    this.triggerHaptic('light');
    this.setData({ showCoursePicker: true, courseSearch: '' }, () => this.applyCourseSearch());
    track('review_course_picker_open', { entry: 'review_home' });
  },

  closeCoursePicker() {
    this.setData({ showCoursePicker: false });
  },

  onCourseSearchInput(e) {
    this.setData({ courseSearch: e.detail.value }, () => this.applyCourseSearch());
  },

  selectEnrolledCourse(e) {
    this.triggerHaptic('light');
    const { courseKey } = e.currentTarget.dataset;
    if (!courseKey) return;

    wx.setStorageSync('review:selectedCourseKey', courseKey);
    this.setData({ selectedCourseKey: courseKey, showCoursePicker: false }, () => {
      this.loadData({ forceRefresh: true });
    });
    track('review_course_select', { courseKey, entry: 'review_home_picker' });
  },

  resetSelectedCourse() {
    wx.removeStorageSync('review:selectedCourseKey');
    this.setData({ selectedCourseKey: '' }, () => {
      this.loadData({ forceRefresh: true });
    });
  },

  clearCourseSelection() {
    this.triggerHaptic('light');
    this.resetSelectedCourse();
    this.closeCoursePicker();
    track('review_course_select_auto', { entry: 'review_home_picker' });
  },

  viewCourseDetail(e) {
    this.triggerHaptic('light');
    const { courseKey } = e.currentTarget.dataset;
    if (!courseKey) return;
    this.closeCoursePicker();
    wx.navigateTo({
      url: `/subpackages/review/pages/course/index?courseKey=${encodeURIComponent(courseKey)}`,
    });
    track('review_course_detail_open', { courseKey, entry: 'review_home' });
  },

  noop() {},

  continueSession() {
    this.triggerHaptic('medium');
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

  startWrongReview() {
    this.triggerHaptic('medium');
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
        
        this.triggerHaptic('light');
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
    this.triggerHaptic('light');
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
    this.triggerHaptic('light');
    this.loadData({ forceRefresh: true }).finally(() => {
      wx.stopPullDownRefresh();
    });
  },
});
