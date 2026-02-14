function sanitizeMpHtmlContent(input, options) {
  if (typeof input !== 'string') return '';
  if (!input) return '';
  const opts = Object.assign({ convertNewlinesToBr: false }, options || {});

  let s = normalizeEscapedWhitespace(input);
  s = decodeHtmlEntities(s);

  s = s.replace(/<script\b[\s\S]*?<\/script>/gi, '');
  s = s.replace(/<iframe\b[\s\S]*?<\/iframe>/gi, '');
  s = s.replace(/<object\b[\s\S]*?<\/object>/gi, '');
  s = s.replace(/<embed\b[\s\S]*?<\/embed>/gi, '');

  s = s.replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  s = s.replace(/\sstyle\s*=\s*(?:"[^"]*"|'[^']*')/gi, '');

  s = s.replace(/\shref\s*=\s*(["'])\s*javascript:[\s\S]*?\1/gi, ' href="#"');
  s = s.replace(/\ssrc\s*=\s*(["'])\s*javascript:[\s\S]*?\1/gi, ' src=""');

  // Keep line breaks visible in non-markdown mode when explicitly requested.
  if (opts.convertNewlinesToBr) {
    s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '<br/>');
  }

  return s;
}

function normalizeEscapedWhitespace(text) {
  return text
    // Convert escaped line breaks from imported TSV/GIFT payloads.
    .replace(/\\\\r\\\\n/g, '\n')
    .replace(/\\r\\n/g, '\n')
    // Avoid breaking LaTeX commands such as \\neq / \\nabla.
    .replace(/\\\\n(?![A-Za-z])/g, '\n')
    .replace(/\\n(?![A-Za-z])/g, '\n');
}

function decodeHtmlEntities(text) {
  let output = text;
  for (let i = 0; i < 3; i += 1) {
    const next = decodeHtmlEntitiesOnce(output);
    if (next === output) break;
    output = next;
  }
  return output;
}

function decodeHtmlEntitiesOnce(text) {
  const named = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&nbsp;': ' ',
  };
  let s = text.replace(/&(amp|lt|gt|quot|nbsp);|&#39;/gi, (m) => named[m.toLowerCase()] || m);
  s = s.replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(parseInt(code, 10)));
  s = s.replace(/&#x([0-9a-f]+);/gi, (_m, code) => String.fromCharCode(parseInt(code, 16)));
  return s;
}

module.exports = {
  sanitizeMpHtmlContent,
};
