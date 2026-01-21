// miniprogram/config.js
// NOTE: Cannot require('./utils/logger') here to avoid circular dependency
// config.js is loaded by logger.js, so we use inline logging
/* eslint-disable no-console */

/**
 * Dynamically select API base URL based on mini program environment
 * @returns {string} API base URL
 */
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
    return urls[envVersion] || urls.release;
  } catch (e) {
    // Inline warn to avoid circular dependency with logger.js
    console.warn('[WARN] Failed to get environment, fallback to release:', e);
    return urls.release;
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
