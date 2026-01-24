// miniprogram/app.js
const privacy = require('./utils/privacy');
const { track, flushQueue } = require('./utils/track');
const logger = require('./utils/logger');
const theme = require('./utils/theme');

App({
  TERMS_COPY: {
    title: '服务协议与隐私政策',
    content: '欢迎使用！为保障您的权益，请在使用前仔细阅读并同意《用户服务协议》和《隐私政策》。您可在“我的-设置”中随时查看。',
    confirmText: '同意',
    cancelText: '拒绝',
    rejectToast: '您需要同意协议才能使用本服务'
  },

  onLaunch() {
    theme.applyTheme(theme.getSystemTheme());
    theme.startThemeListener();
    privacy.setupPrivacyAuthorization();
    this.checkTermsAgreement();
    this.initPerformanceTracking();
  },

  onShow() {
    flushQueue();
  },

  onError(message) {
    const safeMessage = String(message || '').slice(0, 200);
    track('app_error', { message: safeMessage });
    logger.error('[app] error', safeMessage);
  },

  onUnhandledRejection(res) {
    const safeMessage = String(res && res.reason ? res.reason : '').slice(0, 200);
    track('app_unhandled_rejection', { message: safeMessage });
    logger.error('[app] unhandled rejection', safeMessage);
  },

  checkTermsAgreement() {
    const hasAgreed = wx.getStorageSync('hasAgreedToTerms');
    if (!hasAgreed) {
      wx.showModal({
        title: this.TERMS_COPY.title,
        content: this.TERMS_COPY.content,
        confirmText: this.TERMS_COPY.confirmText,
        cancelText: this.TERMS_COPY.cancelText,
        success: (res) => {
          if (res.confirm) {
            wx.setStorageSync('hasAgreedToTerms', true);
          } else if (res.cancel) {
            wx.showToast({
              title: this.TERMS_COPY.rejectToast,
              icon: 'none',
              duration: 3000
            });
          }
        }
      });
    }
  },

  showTerms() {
    wx.navigateTo({
      url: '/pages/webview/index?slug=terms-of-service'
    });
  },

  initPerformanceTracking() {
    if (!wx.getPerformance) return;
    const performance = wx.getPerformance();
    const observer = performance.createObserver((entryList) => {
      const entries = entryList.getEntries();
      entries.forEach((entry) => {
        if (!entry || !entry.entryType) return;
        if (entry.entryType === 'navigation') {
          track('performance_navigation', {
            name: entry.name,
            duration: Math.round(entry.duration || 0),
          });
        }
        if (entry.entryType === 'render') {
          track('performance_render', {
            name: entry.name,
            duration: Math.round(entry.duration || 0),
          });
        }
      });
    });

    observer.observe({ entryTypes: ['navigation', 'render'] });
  }
});
