// miniprogram/utils/track.js
// 统一埋点上报与降级队列

const logger = require('./logger');

const QUEUE_KEY = 'review:track_queue';
const MAX_QUEUE_SIZE = 50;
let deviceCache = null;
let appVersionCache = null;
let networkTypeCache = 'unknown';

function track(eventName, properties = {}) {
  if (!eventName) return;
  const baseProperties = getBaseProperties();
  const payload = {
    event: eventName,
    properties: {
      ...baseProperties,
      ...properties,
    },
    ts: Date.now()
  };

  const reported = tryReportEvent(payload);
  if (!reported) {
    enqueue(payload);
  }
}

function tryReportEvent(payload) {
  if (!wx.reportEvent) return false;
  try {
    wx.reportEvent(payload.event, payload.properties || {});
    return true;
  } catch (error) {
    logger.warn('[track] reportEvent failed', error);
    return false;
  }
}

function enqueue(payload) {
  try {
    const queue = getQueue();
    queue.push(payload);
    const trimmed = queue.slice(-MAX_QUEUE_SIZE);
    wx.setStorageSync(QUEUE_KEY, JSON.stringify(trimmed));
  } catch (error) {
    logger.error('[track] enqueue failed', error);
  }
}

function flushQueue() {
  const queue = getQueue();
  if (queue.length === 0) return;

  const remaining = [];
  queue.forEach((item) => {
    if (!tryReportEvent(item)) {
      remaining.push(item);
    }
  });

  try {
    if (remaining.length === 0) {
      wx.removeStorageSync(QUEUE_KEY);
    } else {
      wx.setStorageSync(QUEUE_KEY, JSON.stringify(remaining));
    }
  } catch (error) {
    logger.error('[track] flush failed', error);
  }
}

function getQueue() {
  try {
    const raw = wx.getStorageSync(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    logger.error('[track] get queue failed', error);
    return [];
  }
}

function getBaseProperties() {
  updateNetworkType();
  const route = getCurrentRoute();
  const device = getDeviceInfo();
  const appVersion = getAppVersion();
  return {
    route,
    device,
    networkType: networkTypeCache,
    appVersion,
  };
}

function getCurrentRoute() {
  try {
    const pages = getCurrentPages();
    if (!pages || pages.length === 0) return '';
    const current = pages[pages.length - 1];
    return current && current.route ? current.route : '';
  } catch (error) {
    logger.warn('[track] get route failed', error);
    return '';
  }
}

function getDeviceInfo() {
  if (deviceCache) return deviceCache;
  try {
    const info = wx.getDeviceInfo ? wx.getDeviceInfo() : wx.getSystemInfoSync();
    deviceCache = info?.model || info?.brand || info?.system || '';
    return deviceCache;
  } catch (error) {
    logger.warn('[track] get device failed', error);
    return '';
  }
}

function getAppVersion() {
  if (appVersionCache !== null) return appVersionCache;
  try {
    const accountInfo = wx.getAccountInfoSync ? wx.getAccountInfoSync() : null;
    appVersionCache = accountInfo?.miniProgram?.version || '';
    return appVersionCache;
  } catch (error) {
    logger.warn('[track] get app version failed', error);
    appVersionCache = '';
    return '';
  }
}

function updateNetworkType() {
  if (!wx.getNetworkType) return;
  wx.getNetworkType({
    success: (res) => {
      if (res && res.networkType) {
        networkTypeCache = res.networkType;
      }
    },
    fail: (error) => {
      logger.warn('[track] get network type failed', error);
    },
  });
}

module.exports = {
  track,
  flushQueue,
};
