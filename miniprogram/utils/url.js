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

module.exports = {
  normalizeApiBaseUrl,
  sanitizeUrlInput,
};
