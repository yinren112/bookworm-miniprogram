const logManager = typeof wx !== 'undefined' && wx.getLogManager ? wx.getLogManager() : null;
const noop = () => {};
const withTag = (tag, fn) => (...args) => fn(`[${tag}]`, ...args);
const bindOr = (obj, method, fallback) => {
  const fn = obj && typeof obj[method] === 'function' ? obj[method].bind(obj) : fallback;
  return fn || noop;
};
const consoleError = typeof console !== 'undefined' && console.error ? console.error.bind(console) : noop;

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
  debug: DEBUG ? withTag('DEBUG', bindOr(logManager, 'debug', noop)) : noop,
  info:  DEBUG ? withTag('INFO', bindOr(logManager, 'info', noop)) : noop,
  warn:  DEBUG ? withTag('WARN', bindOr(logManager, 'warn', noop)) : noop,
  error: withTag('ERROR', bindOr(logManager, 'error', consoleError)),
};
