// subpackages/review/pages/flashcard/index.js
// 卡片复习页

const { startSession, submitCardAnswer, starItem, unstarItem, getStarredItems } = require('../../utils/study-api');
const { saveResumeSession, clearResumeSession, setLastSessionType } = require('../../utils/study-session');
const { getValidResumeSession, clampIndex } = require('../../utils/study-resume-helpers');
const { toggleStarWithOptimisticUpdate } = require('../../utils/study-ui-helpers');
const { sanitizeMpHtmlContent } = require('../../utils/mp-html-sanitize');
const { getPageState, clearPageState } = require('../../utils/page-state');
const studyTimer = require('../../utils/study-timer');
const logger = require('../../../../utils/logger');
const haptic = require('../../../../utils/haptic');
const soundManager = require('../../../../utils/sound-manager');
const { track } = require('../../../../utils/track');
const { createFatigueChecker } = require('../../../../utils/fatigue');
const { CARD_SECONDS_PER_ITEM, SWIPE_HINT_COUNT_KEY } = require('../../../../utils/constants');
// Swipe thresholds - kept for reference (actual logic in WXS)
// const T1_RATIO = 0.22;  // Light threshold
// const T2_RATIO = 0.42;  // Heavy threshold

function getFlashcardState(page) {
  return getPageState('review.flashcard', page, () => ({
    cards: [],
    swipeCommitTimer: null,
    swipeSafetyTimer: null,
    pendingAnswer: null,
    undoTimer: null,
  }));
}

const UNDO_WINDOW_MS = 3000;

const RATING_LABELS = {
  FORGOT: '想不起来',
  FUZZY: '有点模糊',
  KNEW: '记住了',
  PERFECT: '完全掌握',
};

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

    // Swipe hint (first-time overlay)
    showSwipeHint: false,
    // Inline swipe tip (shown after flip, count-based)
    showSwipeTip: false,

    // Card transition
    cardTransitionClass: '',
    swipeExitClass: '',
    cardInlineStyle: '',

    // Undo state
    undoVisible: false,
    undoRatingText: '',
    pendingComplete: false,
  },

  onLoad(options) {
    this.startTime = Date.now();
    this.elapsedOffset = 0;
    this.fatigueChecker = createFatigueChecker();
    this.abortTracked = false;
    this.resumeSaveFailed = false;
    this._cardStyleResetSeq = 0;

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

  onShow() {
    studyTimer.start('card');
    studyTimer.onInteraction();
  },

  onUserInteraction() {
    studyTimer.onInteraction();
  },

  tryResumeSession(courseKey) {
    const result = getValidResumeSession({ expectedType: 'flashcard', courseKey, itemsKey: 'cards' });
    if (!result) return false;

    const { session, items } = result;
    const cards = items.map(sanitizeCard);
    const state = getFlashcardState(this);
    state.cards = cards;
    const currentIndex = clampIndex(session.currentIndex || 0, cards.length - 1);
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
        swipeExitClass: '',
        cardInlineStyle: '',
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
        const state = getFlashcardState(this);
        state.cards = [];
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

      const state = getFlashcardState(this);
      state.cards = cards.map(sanitizeCard);
      const firstCard = state.cards[0];

      this.setData({
        sessionId,
        cardsLength: state.cards.length,
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
        swipeExitClass: '',
        cardInlineStyle: '',
      });

      this.updateProgress(0);
      this.saveSnapshot();
      this.showSwipeHintIfNeeded();
      track('session_start', { type: 'flashcard', resume: false, entry: this.entry || 'direct' });
    } catch (err) {
      logger.error('Failed to startSession:', err);
      this.setData({ loading: false, error: true });
    }
  },

  getSwipeHintCount() {
    // Backward compat: old boolean key means graduated (count=3)
    const oldSeen = wx.getStorageSync('review:swipeHintSeen');
    if (oldSeen === true) return 3;
    const count = wx.getStorageSync(SWIPE_HINT_COUNT_KEY);
    return typeof count === 'number' ? count : 0;
  },

  showSwipeHintIfNeeded() {
    if (this.getSwipeHintCount() >= 3) return;
    this.setData({ showSwipeHint: true });
    // 不再自动消失，等用户点"知道了"按钮
  },

  dismissSwipeHint() {
    if (this._swipeHintTimer) {
      clearTimeout(this._swipeHintTimer);
      this._swipeHintTimer = null;
    }
    if (!this.data.showSwipeHint) return;
    this.setData({ showSwipeHint: false });
    const count = this.getSwipeHintCount();
    wx.setStorageSync(SWIPE_HINT_COUNT_KEY, count + 1);
  },

  // --- Interaction: Flip ---
  flipCard() {
    if (this.data.isFlipped) return;

    // 触觉反馈 (Light)
    haptic.trigger('light');

    const showSwipeTip = this.getSwipeHintCount() < 3;
    this.setData({ isFlipped: true, showSwipeTip });
  },

  // --- WXS Swipe Callbacks ---
  /**
   * WXS 滑动提交回调
   * @param {Object} e - 包含 rating, level, dx
   */
  onSwipeCommit(e) {
    if (this.data.submitting || this.data.completed) return;
    
    const payload = normalizeSwipePayload(e);
    const { rating, level } = payload;
    if (!isValidCardRating(rating)) {
      logger.warn('Invalid swipe payload:', payload);
      this.setData({
        swipeExitClass: '',
        cardInlineStyle: buildCardResetInlineStyle(this),
        submitting: false,
      });
      return;
    }
    
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
    
    const direction = payload.dx < 0 ? 'left' : 'right';
    this.setData({
      submitting: true,
      // Exit animation runs on card-stack (JS class), not on swipe-card container style.
      swipeExitClass: direction === 'left' ? 'card-swipe-exit-left' : 'card-swipe-exit-right',
    });
    
    // 延迟提交，让飞出动画完成
    const state = getFlashcardState(this);
    if (state.swipeCommitTimer) {
      clearTimeout(state.swipeCommitTimer);
      state.swipeCommitTimer = null;
    }
    if (state.swipeSafetyTimer) {
      clearTimeout(state.swipeSafetyTimer);
      state.swipeSafetyTimer = null;
    }
    // Safety fallback: if submit chain stalls, force card visible again.
    state.swipeSafetyTimer = setTimeout(() => {
      if (this.data.submitting) {
        this.setData({ cardInlineStyle: buildCardResetInlineStyle(this) });
      }
      state.swipeSafetyTimer = null;
    }, 900);
    state.swipeCommitTimer = setTimeout(() => {
      this.commitAnswer(rating);
      state.swipeCommitTimer = null;
    }, 180);
  },

  /**
   * WXS 滑动取消回调（回弹）
   * @param {Object} e - 包含 dx
   */
  onSwipeCancel() {
    // 可选埋点 - WXS 回弹取消时调用
  },

  // --- Interaction: Feedback Submit (Button fallback) ---
  submitFeedback(e) {
    if (this.data.submitting) return;
    const { rating } = e.currentTarget.dataset;
    haptic.trigger(rating === 'FORGOT' ? 'heavy' : 'light');
    soundManager.play('swipe_light');
    this.commitAnswer(rating);
  },
  
  /**
   * 乐观提交：立即推进卡片，延迟 API 调用，提供撤销窗口
   */
  commitAnswer(rating) {
    const { currentCard, sessionId, currentIndex, courseKey } = this.data;
    const cards = getFlashcardState(this).cards || [];
    if (!currentCard) return;

    // 先 flush 上一张卡片的 pending（如果有）
    this.flushPendingAnswer();

    const state = getFlashcardState(this);
    const nextIndex = currentIndex + 1;
    const isLastCard = nextIndex >= cards.length;

    // 暂存答案，不立即提交 API
    state.pendingAnswer = {
      contentId: currentCard.contentId,
      rating,
      sessionId,
      courseKey,
      cardIndex: currentIndex,
      card: currentCard,
      isStarred: this.data.isStarred,
      isLastCard,
    };

    this.checkFatigue();

    if (isLastCard) {
      // 最后一张：显示 pending 完成态 + undo 条
      this.setData({
        pendingComplete: true,
        undoVisible: true,
        undoRatingText: RATING_LABELS[rating] || rating,
        submitting: false,
        swipeExitClass: '',
        cardInlineStyle: buildCardResetInlineStyle(this),
      });
    } else {
      // 非最后一张：立即推进到下一张
      const nextCard = cards[nextIndex];
      this.setData({
        currentIndex: nextIndex,
        currentCard: nextCard,
        isStarred: this.data.starredItems[nextCard.contentId] || false,
        isFlipped: false,
        showSwipeTip: false,
        progressPercent: Math.round((nextIndex / this.data.cardsLength) * 100),
        swipeExitClass: '',
        cardTransitionClass: 'card-entering',
        cardInlineStyle: buildCardResetInlineStyle(this),
        undoVisible: true,
        undoRatingText: RATING_LABELS[rating] || rating,
        submitting: false,
      });
      this.updateProgress(nextIndex);
      this.saveSnapshot();
      setTimeout(() => {
        this.setData({ cardTransitionClass: '' });
      }, 250);
    }

    // 启动撤销倒计时
    if (state.undoTimer) {
      clearTimeout(state.undoTimer);
    }
    state.undoTimer = setTimeout(() => {
      state.undoTimer = null;
      this.flushPendingAnswer();
    }, UNDO_WINDOW_MS);
  },

  /**
   * 提交暂存答案到 API（后台执行，不阻塞 UI）
   */
  flushPendingAnswer() {
    const state = getFlashcardState(this);
    if (state.undoTimer) {
      clearTimeout(state.undoTimer);
      state.undoTimer = null;
    }
    const pending = state.pendingAnswer;
    if (!pending) {
      this.setData({ undoVisible: false });
      return;
    }
    state.pendingAnswer = null;
    this.setData({ undoVisible: false });

    const { contentId, sessionId, rating, courseKey, isLastCard } = pending;

    submitCardAnswer(contentId, sessionId, rating, courseKey)
      .then((answerResult) => {
        if (rating === 'KNEW' || rating === 'PERFECT') {
          const msg = formatNextDueMessage(answerResult?.nextDueAt);
          if (msg) {
            wx.showToast({ title: msg, icon: 'none', duration: 1500 });
          }
        }
        if (isLastCard) {
          this.completeSession();
        }
      })
      .catch((err) => {
        logger.error('Failed to submit feedback:', err);
        wx.showToast({ title: '同步失败', icon: 'none' });
        if (isLastCard) {
          this.completeSession();
        }
      })
      .finally(() => {
        const s = getFlashcardState(this);
        if (s.swipeSafetyTimer) {
          clearTimeout(s.swipeSafetyTimer);
          s.swipeSafetyTimer = null;
        }
      });
  },

  /**
   * 完成会话：跳转到结算页
   */
  completeSession() {
    const cards = getFlashcardState(this).cards || [];
    haptic.trigger('celebration');
    soundManager.play('celebration');

    const durationSeconds = this.getElapsedSeconds();
    const starredCount = Object.keys(this.data.starredItems).length;

    clearResumeSession();
    setLastSessionType('flashcard');
    track('session_complete', {
      type: 'flashcard',
      count: cards.length,
      durationSeconds,
    });

    const params = [
      `mode=flashcard`,
      `count=${cards.length}`,
      `duration=${durationSeconds}`,
      `starred=${starredCount}`,
      `courseKey=${encodeURIComponent(this.data.courseKey)}`,
    ];
    if (this.data.nextType) {
      params.push(`nextType=${this.data.nextType}`);
    }
    wx.redirectTo({
      url: `/subpackages/review/pages/session-complete/index?${params.join('&')}`,
    });
  },

  /**
   * 撤销上一次滑动
   */
  undoLastSwipe() {
    const state = getFlashcardState(this);
    if (state.undoTimer) {
      clearTimeout(state.undoTimer);
      state.undoTimer = null;
    }
    const pending = state.pendingAnswer;
    if (!pending) return;
    state.pendingAnswer = null;

    haptic.trigger('light');

    this.setData({
      currentIndex: pending.cardIndex,
      currentCard: pending.card,
      isStarred: pending.isStarred,
      isFlipped: true,
      showSwipeTip: false,
      progressPercent: Math.round((pending.cardIndex / this.data.cardsLength) * 100),
      swipeExitClass: '',
      cardTransitionClass: 'card-entering',
      cardInlineStyle: buildCardResetInlineStyle(this),
      undoVisible: false,
      undoRatingText: '',
      pendingComplete: false,
      submitting: false,
    });
    this.updateProgress(pending.cardIndex);
    setTimeout(() => {
      this.setData({ cardTransitionClass: '' });
    }, 250);

    track('flashcard_undo', { rating: pending.rating });
  },
  
  checkFatigue() {
    this.fatigueChecker.check(this.startTime);
  },

  // --- Interaction: Star ---
  async toggleStar() {
    const { isStarred, currentCard } = this.data;
    if (!currentCard) return;
    haptic.trigger('light');
    await toggleStarWithOptimisticUpdate({
      page: this,
      currentValue: isStarred,
      itemId: currentCard.contentId,
      updateRemote: (newVal) => (
        newVal
          ? starItem({ type: 'card', contentId: currentCard.contentId, courseKey: this.data.courseKey })
          : unstarItem({ type: 'card', contentId: currentCard.contentId, courseKey: this.data.courseKey })
      ),
      logger,
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
    this.flushPendingAnswer();
    this.trackAbort('hide');
    studyTimer.flush();
    studyTimer.stop();
  },

  updateProgress(currentIndex) {
    const total = this.data.cardsLength || 0;
    const remaining = Math.max(0, total - currentIndex);
    const remainingMinutes = Math.ceil((remaining * CARD_SECONDS_PER_ITEM) / 60);
    this.setData({
      progressPercent: total > 0 ? Math.round((currentIndex / total) * 100) : 0,
      remainingMinutes,
    });
  },

  saveSnapshot() {
    if (!this.data.sessionId || this.data.completed || this.resumeSaveFailed) return;
    const state = getFlashcardState(this);
    const saved = saveResumeSession({
      type: 'flashcard',
      courseKey: this.data.courseKey,
      unitId: this.data.unitId,
      sessionId: this.data.sessionId,
      cards: state.cards,
      cardsLength: this.data.cardsLength,
      currentIndex: this.data.currentIndex,
      starredItems: this.data.starredItems,
      elapsedSeconds: this.getElapsedSeconds(),
    });
    if (!saved) {
      this.resumeSaveFailed = true;
      logger.warn('[study-session] flashcard snapshot save skipped');
    }
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
    this.flushPendingAnswer();
    this.trackAbort('close');
    studyTimer.flush();
    studyTimer.stop();
    if (this._swipeHintTimer) {
      clearTimeout(this._swipeHintTimer);
      this._swipeHintTimer = null;
    }
    const state = getFlashcardState(this);
    if (state.swipeCommitTimer) {
      clearTimeout(state.swipeCommitTimer);
      state.swipeCommitTimer = null;
    }
    if (state.swipeSafetyTimer) {
      clearTimeout(state.swipeSafetyTimer);
      state.swipeSafetyTimer = null;
    }
    if (state.undoTimer) {
      clearTimeout(state.undoTimer);
      state.undoTimer = null;
    }
    state.cards = [];
    clearPageState('review.flashcard', this);
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

function sanitizeCard(card) {
  if (!card || typeof card !== 'object') return card;
  const front = typeof card.front === 'string'
    ? sanitizeMpHtmlContent(card.front, { convertNewlinesToBr: true })
    : '';
  const back = typeof card.back === 'string'
    ? sanitizeMpHtmlContent(card.back, { convertNewlinesToBr: true })
    : '';
  return { ...card, front, back };
}

function buildCardResetInlineStyle(page) {
  const currentSeq = typeof page._cardStyleResetSeq === 'number' ? page._cardStyleResetSeq : 0;
  const nextSeq = (currentSeq + 1) % 1000000;
  page._cardStyleResetSeq = nextSeq;
  // Keep a unique style string on each card swap so render layer won't skip the reset.
  return `transform: translateX(0) rotate(0deg); opacity: 1; transition: none; z-index: ${1 + (nextSeq % 2)};`;
}

function normalizeSwipePayload(e) {
  if (e && typeof e === 'object' && e.detail && typeof e.detail === 'object') {
    return e.detail;
  }
  if (e && typeof e === 'object') {
    return e;
  }
  return {};
}

function isValidCardRating(rating) {
  return rating === 'FORGOT' || rating === 'FUZZY' || rating === 'KNEW' || rating === 'PERFECT';
}
