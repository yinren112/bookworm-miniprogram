/* global globalThis */
// miniprogram/app.js
const privacy = require('./utils/privacy');
const { track, flushQueue } = require('./utils/track');
const logger = require('./utils/logger');
const theme = require('./utils/theme');
const {
  TERMS_STORAGE_KEY,
  TERMS_ACCEPTED_AT_KEY,
  TERMS_VERSION_KEY,
  TERMS_VERSION
} = require('./utils/constants');

const TERMS_PAGE_ROUTE = 'pages/terms/index';
const TERMS_PAGE_URL = `/${TERMS_PAGE_ROUTE}`;

function readTermsAcceptedFromStorage() {
  return wx.getStorageSync(TERMS_STORAGE_KEY) === true;
}

const originalPage = Page;
const patchedPage = function (pageConfig) {
  if (!pageConfig || typeof pageConfig !== 'object') {
    return originalPage(pageConfig);
  }

  const originalOnShow = pageConfig.onShow;
  pageConfig.onShow = function (...args) {
    const currentRoute = this.route || '';
    if (currentRoute !== TERMS_PAGE_ROUTE) {
      const app = getApp();
      const accepted = app && typeof app.isTermsAccepted === 'function'
        ? app.isTermsAccepted()
        : readTermsAcceptedFromStorage();
      if (!accepted) {
        wx.reLaunch({ url: TERMS_PAGE_URL });
        return;
      }
    }

    if (typeof originalOnShow === 'function') {
      return originalOnShow.apply(this, args);
    }
    return undefined;
  };

  return originalPage(pageConfig);
};
const globalRef = typeof globalThis !== 'undefined' ? globalThis : null;
if (globalRef && typeof globalRef.Page === 'function') {
  globalRef.Page = patchedPage;
}

App({
  globalData: {
    termsAccepted: false,
    termsAcceptedAt: '',
    termsVersion: TERMS_VERSION
  },

  onLaunch() {
    theme.applyTheme(theme.getSystemTheme());
    theme.startThemeListener();
    privacy.setupPrivacyAuthorization();
    this.loadTermsAgreement();
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

  loadTermsAgreement() {
    let accepted = readTermsAcceptedFromStorage();
    let acceptedAt = wx.getStorageSync(TERMS_ACCEPTED_AT_KEY) || '';
    let storedVersion = wx.getStorageSync(TERMS_VERSION_KEY) || TERMS_VERSION;

    if (!accepted && wx.getStorageSync('hasAgreedToTerms') === true) {
      accepted = true;
      acceptedAt = new Date().toISOString();
      storedVersion = TERMS_VERSION;
      wx.setStorageSync(TERMS_STORAGE_KEY, true);
      wx.setStorageSync(TERMS_ACCEPTED_AT_KEY, acceptedAt);
      wx.setStorageSync(TERMS_VERSION_KEY, storedVersion);
    }
    this.globalData.termsAccepted = accepted;
    this.globalData.termsAcceptedAt = acceptedAt;
    this.globalData.termsVersion = storedVersion;
  },

  isTermsAccepted() {
    return this.globalData.termsAccepted || readTermsAcceptedFromStorage();
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
