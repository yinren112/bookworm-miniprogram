// pages/review/index.js
// 复习首页

const { getCourses, getTodayQueue, getStreakInfo, getActivityHistory } = require('../../utils/study-api');
const { swrFetch } = require('../../utils/cache');
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
      // 并行请求：课程、streak（带缓存）、热力图（带缓存）
      const [coursesRes, streakInfo, activityRes] = await Promise.all([
        getCourses(),
        swrFetch('review:streak', () => getStreakInfo(), { ttlMs: 300000 }).catch(err => {
          logger.error('Failed to get streak info:', err);
          return null;
        }),
        swrFetch('review:activity', () => getActivityHistory({ days: 35 }), { ttlMs: 300000 }).catch(err => {
          logger.error('Failed to get activity history:', err);
          return { days: [] };
        })
      ]);

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

      // 处理热力图数据
      const heatmapData = (activityRes?.days || []).map(d => ({ level: d.level }));

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
