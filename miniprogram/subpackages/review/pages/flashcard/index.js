// subpackages/review/pages/flashcard/index.js
// 卡片复习页

const { startSession, submitCardAnswer, starItem, unstarItem, getStarredItems } = require('../../utils/study-api');
const { getResumeSession, saveResumeSession, clearResumeSession, setLastSessionType } = require('../../utils/study-session');
const logger = require('../../../../utils/logger');
const haptic = require('../../../../utils/haptic');
const soundManager = require('../../../../utils/sound-manager');
const { track } = require('../../../../utils/track');
// Swipe thresholds - kept for reference (actual logic in WXS)
// const T1_RATIO = 0.22;  // Light threshold
// const T2_RATIO = 0.42;  // Heavy threshold

Page({
  data: {
    loading: true,
    error: false,
    empty: false,
    submitting: false, // 防重复提交
    courseKey: '',
    unitId: null,
    limit: null,
    sessionId: '',
    cardsLength: 0,
    currentIndex: 0,
    currentCard: null,
    isFlipped: false,
    completed: false,
    progressPercent: 0,
    remainingMinutes: 0,
    showReportModal: false,
    nextType: '',

    // Screen width for WXS gesture module
    screenWidth: 375,

    // Starred state
    isStarred: false,
    starredItems: {},
  },

  onLoad(options) {
    this.startTime = Date.now();
    this.elapsedOffset = 0;
    this.fatigueWarned = false;
    this.abortTracked = false;

    const sysInfo = wx.getSystemInfoSync();
    this.setData({ screenWidth: sysInfo.windowWidth });

    const { courseKey, unitId, resume, nextType, entry, limit } = options || {};
    if (courseKey) {
      const decodedCourseKey = decodeURIComponent(courseKey);
      this.entry = entry || '';
      this.setData({
        courseKey: decodedCourseKey,
        unitId: unitId ? parseInt(unitId, 10) : null,
        nextType: nextType || '',
        limit: limit ? parseInt(limit, 10) : null,
      });

      if (resume === '1' && this.tryResumeSession(decodedCourseKey)) {
        return;
      }

      this.loadSession();
    } else {
      this.setData({ loading: false, error: true });
      wx.showToast({
        title: '缺少课程参数',
        icon: 'none',
      });
    }
  },

  tryResumeSession(courseKey) {
    const session = getResumeSession();
    if (!session || session.type !== 'flashcard' || session.courseKey !== courseKey) {
      return false;
    }

    const cards = session.cards || [];
    if (!Array.isArray(cards) || cards.length === 0) {
      return false;
    }

    this._cards = cards;
    const currentIndex = Math.min(session.currentIndex || 0, cards.length - 1);
    const currentCard = cards[currentIndex];

    this.elapsedOffset = session.elapsedSeconds || 0;

    this.setData({
      sessionId: session.sessionId || '',
      cardsLength: session.cardsLength || cards.length,
      currentIndex,
      currentCard,
      starredItems: session.starredItems || {},
      isStarred: (session.starredItems || {})[currentCard.contentId] || false,
      isFlipped: false,
      completed: false,
      loading: false,
      error: false,
      empty: false,
      progressPercent: 0,
    });

    this.updateProgress(currentIndex);
    track('session_start', { type: 'flashcard', resume: true, entry: 'resume' });
    return true;
  },

  async loadSession() {
    this.setData({ loading: true, error: false, empty: false });

    try {
      const options = {};
      if (this.data.unitId) {
        options.unitId = this.data.unitId;
      }
      if (this.data.limit) {
        options.limit = this.data.limit;
      }

      const res = await startSession(this.data.courseKey, options);
      const { sessionId, cards } = res;

      if (!cards || cards.length === 0) {
        this._cards = [];
        clearResumeSession();
        this.setData({
          loading: false,
          cardsLength: 0,
          empty: true,
        });
        return;
      }

      let starredItems = {};
      try {
        const starredRes = await getStarredItems({
          type: 'card',
          courseKey: this.data.courseKey,
        });
        starredItems = buildStarredMap(starredRes?.items || [], 'card');
      } catch (err) {
        logger.error('Failed to load starred items:', err);
      }

      this._cards = cards;
      const firstCard = cards[0];

      this.setData({
        sessionId,
        cardsLength: cards.length,
        currentIndex: 0,
        currentCard: firstCard,
        starredItems,
        isStarred: starredItems[firstCard.contentId] || false,
        isFlipped: false,
        completed: false,
        loading: false,
        progressPercent: 0,
        cardStyle: '',
        swipeOpacityForgot: 0,
        swipeOpacityKnew: 0,
      });

      this.updateProgress(0);
      this.saveSnapshot();
      track('session_start', { type: 'flashcard', resume: false, entry: this.entry || 'direct' });
    } catch (err) {
      logger.error('Failed to startSession:', err);
      this.setData({ loading: false, error: true });
    }
  },

  // --- Interaction: Flip ---
  flipCard() {
    if (this.data.isFlipped) return;

    // 触觉反馈 (Light)
    haptic.trigger('light');

    this.setData({ isFlipped: true });
  },

  // --- WXS Swipe Callbacks ---
  /**
   * WXS 滑动提交回调
   * @param {Object} e - 包含 rating, level, dx
   */
  onSwipeCommit(e) {
    if (this.data.submitting || this.data.completed) return;
    
    const { rating, level } = e;
    
    // 触觉反馈
    if (rating === 'FORGOT') {
      haptic.trigger('heavy');
    } else if (level === 'heavy') {
      haptic.trigger('medium');
    } else {
      haptic.trigger('light');
    }
    
    // 音效反馈
    if (level === 'heavy') {
      soundManager.play('swipe_heavy');
    } else {
      soundManager.play('swipe_light');
    }
    
    this.setData({ submitting: true });
    
    // 延迟提交，让飞出动画完成
    setTimeout(() => {
      this.submitRating(rating);
    }, 300);
  },

  /**
   * WXS 滑动取消回调（回弹）
   * @param {Object} e - 包含 dx
   */
  onSwipeCancel() {
    // 可选埋点 - WXS 回弹取消时调用
  },

  // --- Interaction: Feedback Submit (Button fallback) ---
  async submitFeedback(e) {
    if (this.data.submitting) return;
    const { rating } = e.currentTarget.dataset;
    haptic.trigger(rating === 'FORGOT' ? 'heavy' : 'light');
    soundManager.play('swipe_light');
    this.submitRating(rating);
  },
  
  async submitRating(rating) {
      const { currentCard, sessionId, currentIndex } = this.data;
      const cards = this._cards || [];
      if (!currentCard) return;

      this.setData({ submitting: true });
      
      this.checkFatigue(); // Check fatigue

      try {
        const answerResult = await submitCardAnswer(
          currentCard.contentId,
          sessionId,
          rating,
        );
        
        // SRS Transparency Toast
        if (rating === 'KNEW' || rating === 'PERFECT') {
            const nextDueMessage = formatNextDueMessage(answerResult?.nextDueAt);
            if (nextDueMessage) {
              wx.showToast({
                title: nextDueMessage,
                icon: 'none',
                duration: 1500
              });
            }
        }

        const nextIndex = currentIndex + 1;
        const isLastCard = nextIndex >= cards.length;

        if (isLastCard) {
            haptic.trigger('celebration');
            soundManager.play('celebration');
            
            const durationSeconds = this.getElapsedSeconds();
            const starredCount = Object.keys(this.data.starredItems).length;

            clearResumeSession();
            setLastSessionType('flashcard');
            track('session_complete', {
              type: 'flashcard',
              count: cards.length,
              durationSeconds
            });

            const params = [
              `mode=flashcard`,
              `count=${cards.length}`,
              `duration=${durationSeconds}`,
              `starred=${starredCount}`,
              `courseKey=${encodeURIComponent(this.data.courseKey)}`
            ];
            if (this.data.nextType) {
              params.push(`nextType=${this.data.nextType}`);
            }
            wx.redirectTo({
                url: `/subpackages/review/pages/session-complete/index?${params.join('&')}`
            });
        } else {
            const nextCard = cards[nextIndex];
            // Prepare next card
            this.setData({
                currentIndex: nextIndex,
                currentCard: nextCard,
                isStarred: this.data.starredItems[nextCard.contentId] || false,
                isFlipped: false,
                progressPercent: Math.round((nextIndex / this.data.cardsLength) * 100)
            });
            this.updateProgress(nextIndex);
            this.saveSnapshot();

        }
      } catch (err) {
        logger.error('Failed to submit feedback:', err);
        wx.showToast({
            title: '同步失败',
            icon: 'none'
        });
      } finally {
        this.setData({ submitting: false });
      }
  },
  
  checkFatigue() {
      if (this.fatigueWarned) return;
      
      const elased = Date.now() - this.startTime;
      if (elased > 15 * 60 * 1000) { // 15 mins
          this.fatigueWarned = true;
          wx.showModal({
              title: '休息一下',
              content: '已经学习很久了，休息一下眼睛吧，我会帮你保存进度。',
              showCancel: false,
              confirmText: '我知道了'
          });
      }
  },

  // --- Interaction: Star ---
  toggleStar() {
      const { isStarred, currentCard, starredItems } = this.data;
      if (!currentCard) return;

      const newVal = !isStarred;
      const contentId = currentCard.contentId;
      
      haptic.trigger('light');

      // Optimistic update
      this.setData({ isStarred: newVal });

      const updatePromise = newVal
        ? starItem({ type: 'card', contentId })
        : unstarItem({ type: 'card', contentId });

      updatePromise
        .then(() => {
          starredItems[contentId] = newVal;
          if (!newVal) delete starredItems[contentId];
          this.setData({ starredItems });
        })
        .catch((err) => {
          logger.error('Failed to update star:', err);
          this.setData({ isStarred: !newVal });
          wx.showToast({
            title: '星标同步失败',
            icon: 'none',
          });
        });
  },

  goBack() {
    this.trackAbort('back');
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
    haptic.trigger('light');
    this.setData({ showReportModal: true });
  },

  onFeedback() {
    wx.navigateTo({
      url: '/pages/customer-service/index',
    });
  },

  closeReportModal() {
    this.setData({ showReportModal: false });
  },

  onReportSuccess() {
    // 反馈提交成功后的回调
  },

  onHide() {
    this.trackAbort('hide');
  },

  updateProgress(currentIndex) {
    const total = this.data.cardsLength || 0;
    const remaining = Math.max(0, total - currentIndex);
    const remainingMinutes = Math.ceil((remaining * 8) / 60);
    this.setData({
      progressPercent: total > 0 ? Math.round((currentIndex / total) * 100) : 0,
      remainingMinutes,
    });
  },

  saveSnapshot() {
    if (!this.data.sessionId || this.data.completed) return;
    saveResumeSession({
      type: 'flashcard',
      courseKey: this.data.courseKey,
      unitId: this.data.unitId,
      sessionId: this.data.sessionId,
      cards: this._cards,
      cardsLength: this.data.cardsLength,
      currentIndex: this.data.currentIndex,
      starredItems: this.data.starredItems,
      elapsedSeconds: this.getElapsedSeconds(),
    });
  },

  getElapsedSeconds() {
    return this.elapsedOffset + Math.floor((Date.now() - this.startTime) / 1000);
  },

  trackAbort(reason) {
    if (this.abortTracked || this.data.completed || !this.data.sessionId) return;
    this.abortTracked = true;
    this.saveSnapshot();
    track('session_abort', {
      type: 'flashcard',
      reason,
    });
  },

  onUnload() {
    this.trackAbort('close');
    // 释放音效实例，避免长期资源占用
    soundManager.destroyAll();
  },

  onShareAppMessage() {
    return {
      title: '一起来复习吧',
      path: '/pages/review/index',
    };
  },
});

function formatNextDueMessage(nextDueAt) {
  if (!nextDueAt) return '';
  const nextTime = new Date(nextDueAt);
  if (Number.isNaN(nextTime.getTime())) return '';
  const diffMs = nextTime.getTime() - Date.now();
  if (diffMs <= 0) return '';
  const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));
  if (diffHours < 24) {
    return `下次复习: ${diffHours}小时后`;
  }
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return `下次复习: ${diffDays}天后`;
}

function buildStarredMap(items, type) {
  return items.reduce((acc, item) => {
    if (item && item.type === type && item.contentId) {
      acc[item.contentId] = true;
    }
    return acc;
  }, {});
}
