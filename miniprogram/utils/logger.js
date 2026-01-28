// miniprogram/utils/logger.js - Unified logging utility
const config = (() => {
  try {
    return require('../config');
  } catch (e) {
    return {};
  }
})();

const DEBUG = typeof config.DEBUG_MODE === 'boolean'
  ? config.DEBUG_MODE
  : (typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production');

const noop = () => {};
const withTag = (tag, fn) => (...args) => fn(`[${tag}]`, ...args);
const logManager = typeof wx !== 'undefined' && wx.getLogManager ? wx.getLogManager() : null;

module.exports = {
  debug: DEBUG && logManager ? withTag('DEBUG', logManager.debug.bind(logManager)) : noop,
  info:  DEBUG && logManager ? withTag('INFO', logManager.info.bind(logManager)) : noop,
  warn:  DEBUG && logManager ? withTag('WARN', logManager.warn.bind(logManager)) : noop,
  error: logManager ? withTag('ERROR', logManager.error.bind(logManager)) : withTag('ERROR', console.error),
};
