// miniprogram/config.js
// NOTE: Cannot require('./utils/logger') here to avoid circular dependency
// config.js is loaded by logger.js, so we use inline logging
/* eslint-disable no-console */

const { enforceApiBaseUrlPolicy } = require('./utils/url');

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

    if (envVersion !== 'develop') {
      const selected = urls[envVersion] || urls.release;
      return enforceApiBaseUrlPolicy(selected, { envVersion, platform: '' });
    }

    try {
      const systemInfo = wx.getSystemInfoSync ? wx.getSystemInfoSync() : null;
      const platform = systemInfo && systemInfo.platform ? systemInfo.platform : '';
      if (platform === 'devtools') {
        return enforceApiBaseUrlPolicy(urls.develop, { envVersion, platform });
      }
    } catch (e) {
      console.warn('[WARN] Failed to get system info:', e);
    }
    console.warn('[WARN] Device develop build uses trial API (no in-app endpoint switching)');
    return enforceApiBaseUrlPolicy(urls.trial, { envVersion, platform: '' });
  } catch (e) {
    // Inline warn to avoid circular dependency with logger.js
    console.warn('[WARN] Failed to get environment, fallback to release:', e);
    return enforceApiBaseUrlPolicy(urls.release, { envVersion: 'unknown', platform: '' });
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
