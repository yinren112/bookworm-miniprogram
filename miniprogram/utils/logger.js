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

module.exports = {
  debug: DEBUG ? withTag('DEBUG', console.log) : noop,
  info:  withTag('INFO', console.log),
  warn:  withTag('WARN', console.warn),
  error: withTag('ERROR', console.error),
};
