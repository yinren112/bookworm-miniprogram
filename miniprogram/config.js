const logger = require('./utils/logger');
const { enforceApiBaseUrlPolicy } = require('./utils/url');

function getSystemPlatform() {
  try {
    const systemInfo = wx.getSystemInfoSync ? wx.getSystemInfoSync() : null;
    return systemInfo && systemInfo.platform ? systemInfo.platform : '';
  } catch {
    return '';
  }
}

function isDevtools() {
  try {
    return getSystemPlatform() === 'devtools';
  } catch {
    // ignore
  }
  return getSystemPlatform() === 'devtools';
}

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
      logger.warn('[WARN] Unknown envVersion, fallback to release:', envVersion);
    }

    if (envVersion !== 'develop') {
      const selected = urls[envVersion] || urls.release;
      return enforceApiBaseUrlPolicy(selected, { envVersion, platform: '' });
    }

    const platform = isDevtools() ? 'devtools' : getSystemPlatform();
    if (platform === 'devtools') {
      return enforceApiBaseUrlPolicy(urls.develop, { envVersion, platform });
    }
    logger.warn('[WARN] Device develop build uses trial API (no in-app endpoint switching)');
    return enforceApiBaseUrlPolicy(urls.trial, { envVersion, platform: '' });
  } catch (e) {
    logger.warn('[WARN] Failed to get environment, fallback to release:', e);
    return enforceApiBaseUrlPolicy(urls.release, { envVersion: 'unknown', platform: '' });
  }
}

module.exports = {
  getApiBaseUrl,
  get apiBaseUrl() {
    return getApiBaseUrl();
  },
  isDevtools
};
