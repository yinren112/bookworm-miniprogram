// subpackages/review/pages/flashcard/index.js
// 卡片复习页

const { startSession, submitCardAnswer, starItem, unstarItem, getStarredItems } = require('../../utils/study-api');
const logger = require('../../../../utils/logger');

// Swipe constants
const SWIPE_THRESHOLD = 80; // px to trigger
const ROTATE_FACTOR = 0.1; // degrees per px

Page({
  data: {
    loading: true,
    submitting: false, // 防重复提交
    courseKey: '',
    unitId: null,
    sessionId: '',
    cards: [],
    currentIndex: 0,
    currentCard: null,
    isFlipped: false,
    completed: false,
    progressPercent: 0,
    showReportModal: false,
    
    // Swipe & Interaction Data
    startX: 0,
    startY: 0,
    cardStyle: '', // transform style
    swipeClass: '', // animation class
    swipeOpacityForgot: 0,
    swipeOpacityKnew: 0,
    isStarred: false, // Local state for current card
    starredItems: {}, // Local cache of starred items
  },

  onLoad(options) {
    this.startTime = Date.now(); // Session Timer
    this.fatigueWarned = false;
    
    const { courseKey, unitId } = options;
    if (courseKey) {
      this.setData({
        courseKey: decodeURIComponent(courseKey),
        unitId: unitId ? parseInt(unitId, 10) : null,
      });
      this.loadSession();
    } else {
      this.setData({ loading: false });
      wx.showToast({
        title: '缺少课程参数',
        icon: 'none',
      });
    }
  },

  async loadSession() {
    this.setData({ loading: true });

    try {
      const options = {};
      if (this.data.unitId) {
        options.unitId = this.data.unitId;
      }

      const res = await startSession(this.data.courseKey, options);
      const { sessionId, cards } = res;

      if (!cards || cards.length === 0) {
        this.setData({
          loading: false,
          cards: [],
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

      const firstCard = cards[0];
      this.setData({
        sessionId,
        cards,
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
    } catch (err) {
      logger.error('Failed to startSession:', err);
      this.setData({ loading: false });
      wx.showToast({
        title: '加载失败',
        icon: 'none',
      });
    }
  },

  // --- Interaction: Flip ---
  flipCard() {
    if (this.data.isFlipped) return;

    // 触觉反馈 (Light)
    this.triggerHaptic('light');

    this.setData({ isFlipped: true });
  },

  // --- Interaction: Swipe ---
  touchStart(e) {
    if (this.data.submitting || this.data.completed ||  !this.data.currentCard) return;
    
    // Tinder style: always allow swipe
    const touch = e.touches[0];
    this.setData({
      startX: touch.clientX,
      startY: touch.clientY,
      swipeClass: '' 
    });
  },

  touchMove(e) {
    if (this.data.submitting || this.data.completed || !this.data.currentCard) return;
    
    const touch = e.touches[0];
    const deltaX = touch.clientX - this.data.startX;

    // Rotation
    const rotate = deltaX * ROTATE_FACTOR;
    
    // Indicators
    let opacityForgot = 0;
    let opacityKnew = 0;
    
    if (deltaX < 0) {
        opacityForgot = Math.min(Math.abs(deltaX) / (SWIPE_THRESHOLD * 1.5), 1);
    } else {
        opacityKnew = Math.min(Math.abs(deltaX) / (SWIPE_THRESHOLD * 1.5), 1);
    }

    // Apply transform 
    let baseTransform = this.data.isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)';
    
    this.setData({
        cardStyle: `transform: ${baseTransform} translateX(${deltaX}px) rotate(${rotate}deg);`,
        swipeOpacityForgot: opacityForgot,
        swipeOpacityKnew: opacityKnew
    });
  },

  touchEnd(e) {
    if (this.data.submitting || this.data.completed) return;
    
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - this.data.startX;
    
    if (deltaX > SWIPE_THRESHOLD) {
        this.completeSwipe('KNEW');
    } else if (deltaX < -SWIPE_THRESHOLD) {
        this.completeSwipe('FORGOT');
    } else {
        this.resetSwipe();
    }
  },
  
  resetSwipe() {
    this.setData({
        swipeClass: 'reset-anim', 
        cardStyle: '', 
        swipeOpacityForgot: 0,
        swipeOpacityKnew: 0
    });
  },
  
  completeSwipe(rating) {
     const isRight = rating === 'KNEW' || rating === 'PERFECT';
     const screenWidth = wx.getSystemInfoSync().windowWidth;
     const endX = isRight ? screenWidth + 100 : -screenWidth - 100;
     const rotate = isRight ? 20 : -20;
     
     let baseTransform = this.data.isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)';
     
     // Animate off screen
     this.setData({
         swipeClass: 'swipe-anim',
         cardStyle: `transform: ${baseTransform} translateX(${endX}px) rotate(${rotate}deg); opacity: 0;`,
         submitting: true 
     });
     
     this.triggerHaptic(rating === 'FORGOT' ? 'heavy' : 'success');
     
     setTimeout(() => {
         this.submitRating(rating);
     }, 300);
  },

  // --- Interaction: Feedback Submit ---
  async submitFeedback(e) {
    if (this.data.submitting) return;
    const { rating } = e.currentTarget.dataset;
    this.triggerHaptic(rating === 'FORGOT' ? 'heavy' : 'light');
    this.submitRating(rating);
  },
  
  async submitRating(rating) {
      const { currentCard, sessionId, currentIndex, cards } = this.data;
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
            this.triggerHaptic('celebration');
            
            // 计算统计数据
            const durationSeconds = Math.floor((Date.now() - this.startTime) / 1000);
            const starredCount = Object.keys(this.data.starredItems).length;
            
            // 跳转到结算页面
            wx.redirectTo({
                url: `/subpackages/review/pages/session-complete/index?count=${cards.length}&duration=${durationSeconds}&starred=${starredCount}&courseKey=${encodeURIComponent(this.data.courseKey)}`
            });
        } else {
            const nextCard = cards[nextIndex];
            // Prepare next card
            this.setData({
                currentIndex: nextIndex,
                currentCard: nextCard,
                isStarred: this.data.starredItems[nextCard.contentId] || false,
                isFlipped: false,
                progressPercent: Math.round((nextIndex / cards.length) * 100),
                // Reset card position
                cardStyle: 'transform: translateX(0) scale(0.9); opacity: 0; transition: none;', 
                swipeOpacityForgot: 0,
                swipeOpacityKnew: 0
            });
            
            // Fade in next card
            setTimeout(() => {
                this.setData({
                    cardStyle: '', // Remove overrides, let CSS handle it
                    swipeClass: 'reset-anim'
                });
            }, 50);
        }
      } catch (err) {
        logger.error('Failed to submit feedback:', err);
        wx.showToast({
            title: '同步失败',
            icon: 'none'
        });
        this.resetSwipe();
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
      
      this.triggerHaptic('light');

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

  // --- Haptics ---
  triggerHaptic(type) {
      if (!wx.vibrateShort) return; 
      
      switch(type) {
          case 'success':
          case 'light':
             wx.vibrateShort({ type: 'light' });
             break;
          case 'medium':
             wx.vibrateShort({ type: 'medium' });
             break;
          case 'heavy':
             wx.vibrateShort({ type: 'heavy' }); 
             break;
          case 'celebration':
             wx.vibrateShort({ type: 'heavy' });
             setTimeout(() => wx.vibrateShort({ type: 'medium' }), 150);
             setTimeout(() => wx.vibrateShort({ type: 'light' }), 300);
             break;
          default:
             wx.vibrateShort();
      }
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

  openReportModal() {
    this.triggerHaptic('light');
    this.setData({ showReportModal: true });
  },

  closeReportModal() {
    this.setData({ showReportModal: false });
  },

  onReportSuccess() {
    // 反馈提交成功后的回调
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
