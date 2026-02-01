const logManager = typeof wx !== 'undefined' && wx.getLogManager ? wx.getLogManager() : null;
const noop = () => {};
const SENSITIVE_KEY_RE = /(token|authorization|cookie|openid|phone|session|secret|password|wx_app_id|wx_app_secret|appsecret|api_v3|mchid|cert|private_key)/i;

function sanitizeObject(value, depth) {
  if (!value || typeof value !== 'object') return value;
  if (depth <= 0) return '[Object]';
  if (Array.isArray(value)) {
    return value.slice(0, 10).map((v) => sanitizeObject(v, depth - 1));
  }
  const out = {};
  for (const key of Object.keys(value)) {
    if (SENSITIVE_KEY_RE.test(key)) {
      out[key] = '[REDACTED]';
      continue;
    }
    out[key] = sanitizeObject(value[key], depth - 1);
  }
  return out;
}

function sanitizeArg(arg) {
  if (!arg) return arg;
  if (arg instanceof Error) {
    return {
      name: arg.name,
      message: arg.message,
      stack: DEBUG ? arg.stack : undefined,
    };
  }
  if (typeof arg === 'object') {
    return sanitizeObject(arg, 2);
  }
  return arg;
}

const withTag = (tag, fn) => (...args) => fn(`[${tag}]`, ...args.map(sanitizeArg));
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
