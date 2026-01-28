const logManager = typeof wx !== 'undefined' && wx.getLogManager ? wx.getLogManager() : null;
const noop = () => {};
const withTag = (tag, fn) => (...args) => fn(`[${tag}]`, ...args);

const DEBUG = (() => {
  if (typeof wx !== 'undefined' && typeof wx.getAccountInfoSync === 'function') {
    try {
      const accountInfo = wx.getAccountInfoSync();
      const envVersion = accountInfo && accountInfo.miniProgram ? accountInfo.miniProgram.envVersion : '';
      return envVersion && envVersion !== 'release';
    } catch (e) {
      return false;
    }
  }
  return typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production';
})();

module.exports = {
  debug: DEBUG && logManager ? withTag('DEBUG', logManager.debug.bind(logManager)) : noop,
  info:  DEBUG && logManager ? withTag('INFO', logManager.info.bind(logManager)) : noop,
  warn:  DEBUG && logManager ? withTag('WARN', logManager.warn.bind(logManager)) : noop,
  error: logManager ? withTag('ERROR', logManager.error.bind(logManager)) : withTag('ERROR', console.error),
};
