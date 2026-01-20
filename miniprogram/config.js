// miniprogram/config.js
// NOTE: Cannot require('./utils/logger') here to avoid circular dependency
// config.js is loaded by logger.js, so we use inline logging
/* eslint-disable no-console */

/**
 * Dynamically select API base URL based on mini program environment
 * @returns {string} API base URL
 */
function getApiBaseUrl() {
  try {
    const accountInfo = wx.getAccountInfoSync();
    const envVersion = accountInfo.miniProgram.envVersion;

    const urls = {
      'develop': 'http://localhost:8080/api',
      'trial': 'https://api-staging.lailinkeji.com/api',
      'release': 'https://api.lailinkeji.com/api'
    };

    return urls[envVersion] || urls.develop;
  } catch (e) {
    // Inline warn to avoid circular dependency with logger.js
    console.warn('[WARN] Failed to get environment, using default:', e);
    return 'http://localhost:8080/api';
  }
}

const config = {
  apiBaseUrl: getApiBaseUrl()
};

const APP_CONFIG = {
  REVIEW_ONLY_MODE: true
};

module.exports = {
  ...config,
  APP_CONFIG
};
