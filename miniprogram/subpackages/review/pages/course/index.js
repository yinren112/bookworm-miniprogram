// subpackages/review/pages/course/index.js
// 课程详情页

const { getCourseDetail, enrollCourse, getTodayQueue } = require('../../utils/study-api');

Page({
  data: {
    loading: true,
    courseKey: '',
    course: null,
    todaySummary: null,
    hasIcons: false,
  },

  onLoad(options) {
    const { courseKey } = options;
    if (courseKey) {
      this.setData({ courseKey: decodeURIComponent(courseKey) });
      this.loadCourse();
    } else {
      this.setData({ loading: false });
      wx.showToast({
        title: '缺少课程参数',
        icon: 'none',
      });
    }
  },

  async loadCourse() {
    this.setData({ loading: true });

    try {
      const res = await getCourseDetail(this.data.courseKey);
      const course = res.course;

      // 设置导航栏标题
      if (course) {
        wx.setNavigationBarTitle({
          title: course.title,
        });
      }

      this.setData({
        course,
        loading: false,
      });

      // 如果已注册，加载今日队列
      if (course && course.enrollment) {
        this.loadTodayQueue();
      }
    } catch (err) {
      console.error('Failed to load course:', err);
      this.setData({ loading: false });
      wx.showToast({
        title: '加载失败',
        icon: 'none',
      });
    }
  },

  async loadTodayQueue() {
    try {
      const res = await getTodayQueue(this.data.courseKey);
      this.setData({
        todaySummary: res.summary,
      });
    } catch (err) {
      console.error('Failed to load today queue:', err);
    }
  },

  async enrollCourse() {
    wx.showLoading({ title: '注册中...' });

    try {
      await enrollCourse(this.data.courseKey);
      wx.hideLoading();
      wx.showToast({
        title: '注册成功',
        icon: 'success',
      });
      // 重新加载课程信息
      this.loadCourse();
    } catch (err) {
      wx.hideLoading();
      console.error('Failed to enroll course:', err);
      wx.showToast({
        title: '注册失败',
        icon: 'none',
      });
    }
  },

  // 开始今日复习（默认背卡）
  startReview() {
    wx.navigateTo({
      url: `/subpackages/review/pages/flashcard/index?courseKey=${encodeURIComponent(this.data.courseKey)}`,
    });
  },

  // 全课程背卡
  startAllFlashcard() {
    wx.navigateTo({
      url: `/subpackages/review/pages/flashcard/index?courseKey=${encodeURIComponent(this.data.courseKey)}`,
    });
  },

  // 全课程刷题
  startAllQuiz() {
    wx.navigateTo({
      url: `/subpackages/review/pages/quiz/index?courseKey=${encodeURIComponent(this.data.courseKey)}`,
    });
  },

  // 进入急救包
  goToCheatsheet() {
    wx.navigateTo({
      url: `/subpackages/review/pages/cheatsheet/index?courseKey=${encodeURIComponent(this.data.courseKey)}`,
    });
  },

    // 章节点击 - 弹出操作菜单
  goToUnit(e) {
    const { unitId } = e.currentTarget.dataset;
    if (!this.data.course.enrollment) {
      wx.showToast({
        title: '请先注册课程',
        icon: 'none'
      });
      return;
    }

    wx.showActionSheet({
      itemList: ['📚 背卡模式', '📝 刷题模式'],
      itemColor: '#2c5f2d',
      success: (res) => {
        if (res.tapIndex === 0) {
          // 背卡
          wx.navigateTo({
            url: `/subpackages/review/pages/flashcard/index?courseKey=${encodeURIComponent(this.data.courseKey)}&unitId=${unitId}`,
          });
        } else if (res.tapIndex === 1) {
          // 刷题
          wx.navigateTo({
            url: `/subpackages/review/pages/quiz/index?courseKey=${encodeURIComponent(this.data.courseKey)}&unitId=${unitId}`,
          });
        }
      }
    });
  },

  // 章节背卡 (Legacy support if called directly)
  startUnitFlashcard(e) {
    const { unitId } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/subpackages/review/pages/flashcard/index?courseKey=${encodeURIComponent(this.data.courseKey)}&unitId=${unitId}`,
    });
  },

  // 章节刷题 (Legacy)
  startUnitQuiz(e) {
    const { unitId } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/subpackages/review/pages/quiz/index?courseKey=${encodeURIComponent(this.data.courseKey)}&unitId=${unitId}`,
    });
  },

  onPullDownRefresh() {
    this.loadCourse().finally(() => {
      wx.stopPullDownRefresh();
    });
  },
});
