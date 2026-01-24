// miniprogram/config.js
// NOTE: Cannot require('./utils/logger') here to avoid circular dependency
// config.js is loaded by logger.js, so we use inline logging
/* eslint-disable no-console */

/**
 * Dynamically select API base URL based on mini program environment
 * @returns {string} API base URL
 */
const { normalizeApiBaseUrl } = require('./utils/url');

function getApiBaseUrl() {
  const urls = {
    'develop': 'http://localhost:8080/api',
    'trial': 'https://api-staging.lailinkeji.com/api',
    'release': 'https://api.lailinkeji.com/api'
  };

  try {
    const accountInfo = wx.getAccountInfoSync();
    const envVersion = accountInfo.miniProgram.envVersion;

    if (!urls[envVersion]) {
      console.warn('[WARN] Unknown envVersion, fallback to release:', envVersion);
    }

    if (envVersion !== 'develop') {
      return urls[envVersion] || urls.release;
    }

    try {
      const systemInfo = wx.getSystemInfoSync ? wx.getSystemInfoSync() : null;
      const platform = systemInfo && systemInfo.platform ? systemInfo.platform : '';
      if (platform === 'devtools') {
        return urls.develop;
      }
    } catch (e) {
      console.warn('[WARN] Failed to get system info:', e);
    }

    try {
      const stored = normalizeApiBaseUrl(wx.getStorageSync('DEV_API_BASE_URL'));
      if (stored) return stored;
    } catch (e) {
      console.warn('[WARN] Failed to read DEV_API_BASE_URL from storage:', e);
    }

    try {
      const launchOptions = wx.getLaunchOptionsSync ? wx.getLaunchOptionsSync() : null;
      const query = launchOptions && launchOptions.query ? launchOptions.query : {};
      const fromQuery =
        normalizeApiBaseUrl(query.devApiBaseUrl) ||
        normalizeApiBaseUrl(query.devHost);

      if (fromQuery) {
        try {
          wx.setStorageSync('DEV_API_BASE_URL', fromQuery);
        } catch (e) {
          console.warn('[WARN] Failed to persist DEV_API_BASE_URL:', e);
        }
        return fromQuery;
      }
    } catch (e) {
      console.warn('[WARN] Failed to read launch query:', e);
    }

    console.warn('[WARN] No DEV_API_BASE_URL for device develop, fallback to trial');
    return urls.trial;
  } catch (e) {
    // Inline warn to avoid circular dependency with logger.js
    console.warn('[WARN] Failed to get environment, fallback to release:', e);
    return urls.release;
  }
}

const APP_CONFIG = {
  REVIEW_ONLY_MODE: true
};

module.exports = {
  getApiBaseUrl,
  get apiBaseUrl() {
    return getApiBaseUrl();
  },
  APP_CONFIG
};
