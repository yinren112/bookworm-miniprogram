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
  const platform = typeof options.platform === 'string' ? options.platform : '';

  const allowHttp = envVersion === 'develop' && platform === 'devtools';
  if (allowHttp) {
    return url;
  }

  if (!/^https:\/\//i.test(url)) {
    throw new Error(`API base URL must use https in envVersion=${envVersion || 'unknown'}`);
  }

  return url;
}

module.exports = {
  normalizeApiBaseUrl,
  sanitizeUrlInput,
  enforceApiBaseUrlPolicy,
};
