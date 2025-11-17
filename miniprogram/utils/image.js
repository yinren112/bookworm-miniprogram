const config = require('../config');

const DOUBAN_HOST_REGEX = /^https:\/\/img\d+\.doubanio\.com\//;
const PROXY_ENDPOINT = '/content/proxy-image';

function needsProxy(url) {
  if (typeof url !== 'string' || url.length === 0) {
    return false;
  }
  if (url.includes(PROXY_ENDPOINT)) {
    return false;
  }
  return DOUBAN_HOST_REGEX.test(url);
}

function buildProxyUrl(url) {
  const base = config.apiBaseUrl.replace(/\/$/, '');
  return `${base}${PROXY_ENDPOINT}?url=${encodeURIComponent(url)}`;
}

function normalizeCoverUrl(possibleUrl) {
  if (typeof possibleUrl !== 'string') {
    return possibleUrl;
  }
  if (!needsProxy(possibleUrl)) {
    return possibleUrl;
  }
  return buildProxyUrl(possibleUrl);
}

function applyCoverProxy(target) {
  if (Array.isArray(target)) {
    return target.map((item) => applyCoverProxy(item));
  }

  if (target && typeof target === 'object') {
    Object.keys(target).forEach((key) => {
      const value = target[key];
      if (key === 'cover_image_url' || key === 'coverImageUrl') {
        target[key] = normalizeCoverUrl(value);
        return;
      }
      if (value && typeof value === 'object') {
        applyCoverProxy(value);
      }
    });
  }

  return target;
}

module.exports = {
  applyCoverProxy,
  normalizeCoverUrl,
};
