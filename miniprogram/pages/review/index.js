// pages/review/index.js
// 复习首页

const { getCourses, getTodayQueue, getStreakInfo, getActivityHistory } = require('../../utils/study-api');
const logger = require('../../utils/logger');

Page({
  data: {
    loading: true,
    courses: [],
    currentCourse: null,
    todaySummary: null,
    todayDate: '',
    streakInfo: null,
    recommendedCourses: [],
    heatmapData: [],
  },

  onLoad() {
    this.setTodayDate();
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

  async loadData() {
    this.setData({ loading: true });

    try {
      // 加载所有课程
      const coursesRes = await getCourses();
      const courses = coursesRes.courses || [];

      // 找到已注册的课程
      const enrolledCourses = courses.filter(c => c.enrolled);
      const currentCourse = enrolledCourses[0] || null;

      // Empty State: If no enrolled courses, fetch recommendations
      let recommendedCourses = [];
      if (enrolledCourses.length === 0) {
          try {
             const recRes = await getCourses({ limit: 3 }); 
             recommendedCourses = recRes.courses || [];
          } catch (e) { logger.error('Failed to load recommended courses:', e); }
      }

      let todaySummary = null;

      // 如果有已注册课程，获取今日队列
      if (currentCourse) {
        try {
          const queueRes = await getTodayQueue(currentCourse.courseKey);
          todaySummary = queueRes.summary || null;
        } catch (err) {
          logger.error('Failed to get today queue:', err);
        }
      }

      // 获取 streak 信息
      let streakInfo = null;
      try {
        streakInfo = await getStreakInfo();
      } catch (err) {
        logger.error('Failed to get streak info:', err);
      }

      // 获取热力图数据
      let heatmapData = [];
      try {
        const activityRes = await getActivityHistory({ days: 35 });
        heatmapData = (activityRes.days || []).map(d => ({ level: d.level }));
      } catch (err) {
        logger.error('Failed to get activity history:', err);
      }

      this.setData({
        courses: enrolledCourses,
        currentCourse,
        todaySummary,
        streakInfo,
        recommendedCourses,
        heatmapData,
        loading: false,
      });
    } catch (err) {
      logger.error('Failed to load courses:', err);
      this.setData({ loading: false });
      wx.showToast({
        title: '加载失败',
        icon: 'none',
      });
    }
  },

  navigateToCourse(e) {
    const { courseKey } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/subpackages/review/pages/course/index?courseKey=${encodeURIComponent(courseKey)}`,
    });
  },

  async startReview() {
    if (!this.data.currentCourse) {
      wx.showToast({
        title: '请先选择课程',
        icon: 'none',
      });
      return;
    }

    wx.navigateTo({
      url: `/subpackages/review/pages/flashcard/index?courseKey=${encodeURIComponent(this.data.currentCourse.courseKey)}`,
    });
  },

  startQuiz() {
    if (!this.data.currentCourse) {
      wx.showToast({
        title: '请先选择课程',
        icon: 'none',
      });
      return;
    }

    wx.navigateTo({
      url: `/subpackages/review/pages/quiz/index?courseKey=${encodeURIComponent(this.data.currentCourse.courseKey)}`,
    });
  },

  onPullDownRefresh() {
    this.loadData().finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  navigateToLeaderboard() {
    wx.navigateTo({
      url: '/subpackages/review/pages/leaderboard/index',
    });
  },
});
