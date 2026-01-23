// miniprogram/utils/study-session.js
// 复习会话快照管理

const logger = require('./logger');
const {
  RESUME_SESSION_STORAGE_KEY,
  LAST_SESSION_TYPE_KEY
} = require('./constants');

const RESUME_TTL_MS = 24 * 60 * 60 * 1000;

function getResumeSession() {
  try {
    const raw = wx.getStorageSync(RESUME_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session || !session.updatedAt) {
      clearResumeSession();
      return null;
    }
    if (Date.now() - session.updatedAt > RESUME_TTL_MS) {
      clearResumeSession();
      return null;
    }
    return session;
  } catch (error) {
    logger.error('[study-session] get failed', error);
    return null;
  }
}

function saveResumeSession(session) {
  if (!session) return;
  const payload = {
    ...session,
    updatedAt: Date.now(),
  };
  try {
    wx.setStorageSync(RESUME_SESSION_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    logger.error('[study-session] save failed', error);
  }
}

function clearResumeSession() {
  try {
    wx.removeStorageSync(RESUME_SESSION_STORAGE_KEY);
  } catch (error) {
    logger.error('[study-session] clear failed', error);
  }
}

function getLastSessionType() {
  try {
    return wx.getStorageSync(LAST_SESSION_TYPE_KEY) || '';
  } catch (error) {
    logger.error('[study-session] get last type failed', error);
    return '';
  }
}

function setLastSessionType(type) {
  if (!type) return;
  try {
    wx.setStorageSync(LAST_SESSION_TYPE_KEY, type);
  } catch (error) {
    logger.error('[study-session] set last type failed', error);
  }
}

module.exports = {
  getResumeSession,
  saveResumeSession,
  clearResumeSession,
  getLastSessionType,
  setLastSessionType,
};
