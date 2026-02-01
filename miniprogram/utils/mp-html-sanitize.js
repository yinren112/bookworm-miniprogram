function sanitizeMpHtmlContent(input) {
  if (typeof input !== 'string') return '';
  if (!input) return '';

  let s = input;

  s = s.replace(/<script\b[\s\S]*?<\/script>/gi, '');
  s = s.replace(/<iframe\b[\s\S]*?<\/iframe>/gi, '');
  s = s.replace(/<object\b[\s\S]*?<\/object>/gi, '');
  s = s.replace(/<embed\b[\s\S]*?<\/embed>/gi, '');

  s = s.replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  s = s.replace(/\sstyle\s*=\s*(?:"[^"]*"|'[^']*')/gi, '');

  s = s.replace(/\shref\s*=\s*(["'])\s*javascript:[\s\S]*?\1/gi, ' href="#"');
  s = s.replace(/\ssrc\s*=\s*(["'])\s*javascript:[\s\S]*?\1/gi, ' src=""');

  return s;
}

module.exports = {
  sanitizeMpHtmlContent,
};

