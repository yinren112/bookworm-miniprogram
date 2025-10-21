// miniprogram/config.js

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
      'trial': 'https://staging.bookworm.com/api',
      'release': 'https://api.bookworm.com/api'
    };

    return urls[envVersion] || urls.develop;
  } catch (e) {
    console.warn('Failed to get environment, using default:', e);
    return 'http://localhost:8080/api';
  }
}

const config = {
  apiBaseUrl: getApiBaseUrl()
};

module.exports = config;
