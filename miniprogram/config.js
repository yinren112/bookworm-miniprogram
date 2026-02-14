const logger = require('./utils/logger');
const { enforceApiBaseUrlPolicy, normalizeApiBaseUrl } = require('./utils/url');

const DEVICE_DEV_API_BASE_URL_KEY = 'DEV_API_BASE_URL';

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

function getDeviceDevelopApiBaseUrlOverride() {
  try {
    if (!wx.getStorageSync) return '';
    const raw = wx.getStorageSync(DEVICE_DEV_API_BASE_URL_KEY);
    if (typeof raw !== 'string' || !raw.trim()) return '';
    const normalized = normalizeApiBaseUrl(raw);
    if (!normalized) return '';
    return normalized;
  } catch (e) {
    logger.warn('[WARN] Failed to read DEV_API_BASE_URL override:', e);
    return '';
  }
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
    const deviceOverride = getDeviceDevelopApiBaseUrlOverride();
    if (deviceOverride) {
      logger.warn('[WARN] Device develop build uses DEV_API_BASE_URL override');
      return enforceApiBaseUrlPolicy(deviceOverride, { envVersion, platform: '' });
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
