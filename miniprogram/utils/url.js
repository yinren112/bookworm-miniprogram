function sanitizeUrlInput(input) {
  if (typeof input !== 'string') return '';
  const cleaned = input
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u3000/g, ' ')
    .replace(/：/g, ':')
    .replace(/／/g, '/')
    .replace(/．/g, '.');
  return cleaned
    .replace(/[`"'“”‘’]/g, '')
    .trim();
}

function normalizeApiBaseUrl(input) {
  if (!input || typeof input !== 'string') return '';
  let url = sanitizeUrlInput(input).trim();
  if (!url) return '';

  if (!/^https?:\/\//i.test(url)) {
    url = `http://${url}`;
  }

  url = url.replace(/\/+$/, '');
  if (!/\/api$/i.test(url)) {
    url = `${url}/api`;
  }
  return url;
}

function enforceApiBaseUrlPolicy(url, options = {}) {
  if (!url || typeof url !== 'string') return '';
  const envVersion = typeof options.envVersion === 'string' ? options.envVersion : '';

  // develop 环境允许 http，便于本地真机联调（例如手机热点 + 电脑本机 IP）。
  const allowHttp = envVersion === 'develop';
  if (allowHttp) {
    return url;
  }

  if (!/^https:\/\//i.test(url)) {
    throw new Error(`API base URL must use https in envVersion=${envVersion || 'unknown'}`);
  }

  return url;
}

function buildFinalApiUrl(baseUrl, path) {
  const finalUrl = `${baseUrl}${path}`;
  const hasIllegalChars = /[：／]/.test(finalUrl) || /[`"'“”‘’]/.test(finalUrl) || /\s/.test(finalUrl);

  if (!/^https?:\/\//i.test(finalUrl) || hasIllegalChars) {
    const error = new Error('请求地址非法，请检查 API 地址配置是否包含全角冒号/反引号/空格');
    error.errorCode = 'INVALID_URL';
    error.url = finalUrl;
    throw error;
  }

  return finalUrl;
}

module.exports = {
  normalizeApiBaseUrl,
  sanitizeUrlInput,
  enforceApiBaseUrlPolicy,
  buildFinalApiUrl,
};
