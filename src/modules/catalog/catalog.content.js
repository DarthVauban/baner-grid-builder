const allowedTags = new Set([
  'a', 'b', 'blockquote', 'br', 'code', 'div', 'em', 'h2', 'h3', 'h4',
  'i', 'img', 'li', 'ol', 'p', 'pre', 'span', 'strong', 'table', 'tbody',
  'td', 'th', 'thead', 'tr', 'u', 'ul'
]);

const voidTags = new Set(['br', 'img']);
const globalAttrs = new Set(['class', 'title']);
const tagAttrs = {
  a: new Set(['href', 'title', 'target', 'rel']),
  img: new Set(['src', 'alt', 'title']),
  td: new Set(['colspan', 'rowspan']),
  th: new Set(['colspan', 'rowspan'])
};

function decodeEntities(value) {
  return String(value || '')
    .replace(/&colon;/gi, ':')
    .replace(/&#58;/g, ':')
    .replace(/&#x3a;/gi, ':')
    .replace(/&tab;/gi, '\t');
}

function escapeAttribute(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function safeUrl(value, { image = false } = {}) {
  const raw = decodeEntities(value).trim();
  if (!raw) return '';
  const normalized = raw.replace(/[\u0000-\u001f\s]+/g, '');
  const lower = normalized.toLowerCase();
  if (lower.startsWith('javascript:') || lower.startsWith('vbscript:') || lower.startsWith('data:text/html')) return '';
  if (image && lower.startsWith('data:image/')) return normalized;
  if (lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('/')) return normalized;
  if (!image && (lower.startsWith('mailto:') || lower.startsWith('tel:') || lower.startsWith('#'))) return normalized;
  return '';
}

function sanitizeCss(css) {
  return String(css || '')
    .replace(/@import[^;]+;/gi, '')
    .replace(/expression\s*\([^)]*\)/gi, '')
    .replace(/url\s*\(\s*(['"]?)\s*javascript:[^)]+\)/gi, '')
    .slice(0, 20000);
}

function extractBlocks(source, tag) {
  const blocks = [];
  const pattern = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  const html = String(source || '').replace(pattern, (_, content) => {
    blocks.push(String(content || ''));
    return '';
  });
  return { html, blocks };
}

function isLikelyCss(value) {
  const text = String(value || '').trim();
  if (!text || !text.includes('{') || !text.includes('}')) return false;
  return /(^|\s)(\.|#|@media\b|@supports\b|@keyframes\b|[a-z][a-z0-9_-]*[\s.#:[>+~,{])/i.test(text);
}

function extractLooseCss(source) {
  const text = String(source || '');
  const firstTagIndex = text.search(/<[a-zA-Z!/]/);
  const prefix = firstTagIndex >= 0 ? text.slice(0, firstTagIndex) : text;
  if (!isLikelyCss(prefix)) return { html: text, blocks: [] };
  return {
    html: firstTagIndex >= 0 ? text.slice(firstTagIndex) : '',
    blocks: [prefix]
  };
}

function sanitizeAttributes(tag, rawAttrs) {
  const allowed = new Set([...(tagAttrs[tag] || []), ...globalAttrs]);
  const attrs = [];
  const attrPattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+)/g;
  let match;
  while ((match = attrPattern.exec(rawAttrs || ''))) {
    const name = match[1].toLowerCase();
    if (name.startsWith('on') || name === 'style' || !allowed.has(name)) continue;
    const unquoted = String(match[2] || '').replace(/^['"]|['"]$/g, '');
    let value = unquoted;
    if (name === 'href') value = safeUrl(unquoted);
    if (name === 'src') value = safeUrl(unquoted, { image: tag === 'img' });
    if (!value) continue;
    if (name === 'target' && !['_blank', '_self'].includes(value)) continue;
    attrs.push(`${name}="${escapeAttribute(value)}"`);
  }
  if (tag === 'a' && attrs.some((attr) => attr.startsWith('href='))) {
    if (!attrs.some((attr) => attr.startsWith('target='))) attrs.push('target="_blank"');
    attrs.push('rel="noopener noreferrer"');
  }
  return attrs.length ? ` ${attrs.join(' ')}` : '';
}

function sanitizeHtml(html) {
  return String(html || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!doctype[\s\S]*?>/gi, '')
    .replace(/<\/?(script|style|iframe|object|embed|svg|math|link|meta|base|form|input|button|textarea|select)\b[\s\S]*?>/gi, '')
    .replace(/<\/?([a-zA-Z0-9-]+)([^>]*)>/g, (full, rawTag, rawAttrs) => {
      const tag = String(rawTag || '').toLowerCase();
      if (!allowedTags.has(tag)) return '';
      const closing = /^<\//.test(full);
      if (closing) return voidTags.has(tag) ? '' : `</${tag}>`;
      return `<${tag}${sanitizeAttributes(tag, rawAttrs)}${voidTags.has(tag) ? ' />' : '>'}`;
    })
    .slice(0, 60000);
}

export function prepareCatalogDescription(source) {
  const styleExtract = extractBlocks(source, 'style');
  const scriptExtract = extractBlocks(styleExtract.html, 'script');
  const looseCssExtract = extractLooseCss(scriptExtract.html);
  const css = sanitizeCss([...styleExtract.blocks, ...looseCssExtract.blocks].join('\n\n'));
  const js = scriptExtract.blocks.join('\n\n').slice(0, 30000);
  return {
    safeHtml: sanitizeHtml(looseCssExtract.html),
    css,
    js,
    hasJs: js.trim().length > 0
  };
}

export function canSaveCatalogSourceJs(user) {
  return user?.role === 'admin' || user?.canManageToolAccess === true;
}
