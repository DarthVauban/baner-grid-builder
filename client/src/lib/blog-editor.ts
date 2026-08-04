import type {
  BlogCardItem,
  BlogContentBlock,
  BlogPostDocument,
  BlogPostExport,
  BlogPostSection
} from '../types/blog-editor';

export const blogBlockLabels: Record<BlogContentBlock['type'], string> = {
  paragraph: 'Текст',
  subheading: 'Підзаголовок',
  image: 'Зображення',
  list: 'Список',
  table: 'Таблиця',
  cards: 'Картки',
  callout: 'Акцентний блок',
  faq: 'FAQ',
  cta: 'Заклик до дії'
};

export const BLOG_TEMPLATE_CSS = `.mt-blog-post {
  --mt-yellow: #ffe101;
  --mt-black: #000;
  --mt-text: #161616;
  --mt-muted: #5f5f5f;
  --mt-line: rgba(0, 0, 0, .1);
  --mt-soft: #fff8bd;
  --mt-white: #fff;
  --mt-body-font-size: 18px;
  --mt-link-background: #000000;
  --mt-link-text: #ffe101;
  --mt-link-border: #ffe101;
  --mt-link-radius: 8px;
  --mt-link-weight: 800;
  width: 100%;
  max-width: 1120px;
  margin: 0 auto;
  color: var(--mt-text);
  font-family: inherit;
  line-height: 1.65;
  isolation: isolate;
}
.mt-blog-post, .mt-blog-post * { box-sizing: border-box; }
.mt-blog-post :where(p,h1,h2,h3,h4,figure) { margin: 0; padding: 0; }
.mt-blog-post .mt-blog-article {
  overflow: hidden;
  border: 1px solid var(--mt-line);
  border-radius: 28px;
  background: var(--mt-white);
  box-shadow: 0 18px 55px rgba(0, 0, 0, .08);
}
.mt-blog-post .mt-blog-hero {
  padding: clamp(18px, 3.2vw, 36px);
  color: var(--mt-white);
  background: radial-gradient(circle at top right, rgba(255, 225, 1, .3), transparent 34%), var(--mt-black);
}
.mt-blog-post .mt-blog-image, .mt-blog-post .mt-blog-promo-banner {
  width: 100%;
  margin: clamp(18px, 3vw, 34px) 0;
  padding: 0 !important;
  overflow: hidden;
  border: 1px solid rgba(0, 0, 0, .08);
  border-radius: 22px;
  background: linear-gradient(135deg, #f3f3f3, #fff);
}
.mt-blog-post .mt-blog-hero .mt-blog-image { margin-top: 0; border: 2px solid rgba(255, 225, 1, .65); box-shadow: 0 18px 45px rgba(0, 0, 0, .35); }
.mt-blog-post img {
  display: block !important;
  max-width: 100% !important;
  height: auto !important;
  min-height: 0 !important;
  max-height: none !important;
  aspect-ratio: auto !important;
  object-fit: contain !important;
}
.mt-blog-post .mt-blog-image img, .mt-blog-post .mt-blog-promo-banner img { width: 100% !important; margin: 0 !important; border: 0 !important; background: transparent; }
.mt-blog-post .mt-blog-image figcaption, .mt-blog-post .mt-blog-promo-banner figcaption { padding: 10px 14px; color: var(--mt-muted); font-size: 13px; line-height: 1.45; }
.mt-blog-post .mt-blog-kicker {
  display: inline-flex;
  margin: 0 0 14px;
  padding: 7px 12px;
  border-radius: 999px;
  color: var(--mt-black);
  background: var(--mt-yellow);
  font-size: 13px;
  font-weight: 800;
  line-height: 1.2;
}
.mt-blog-post .mt-blog-title { max-width: 930px; margin-bottom: 18px; color: var(--mt-yellow); font-size: clamp(30px, 5vw, 58px); font-weight: 900; line-height: 1.04; letter-spacing: -.04em; }
.mt-blog-post .mt-blog-lead { max-width: 870px; margin-bottom: 16px; color: rgba(255, 255, 255, .92); font-size: clamp(17px, 2vw, 22px); font-weight: 500; line-height: 1.55; }
.mt-blog-post .mt-blog-meta { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 20px; }
.mt-blog-post .mt-blog-meta-item { padding: 8px 12px; border: 1px solid rgba(255, 255, 255, .16); border-radius: 999px; background: rgba(255, 255, 255, .1); font-size: 14px; font-weight: 800; line-height: 1.2; }
.mt-blog-post .mt-blog-section { padding: clamp(22px, 4vw, 46px); border-top: 1px solid var(--mt-line); background: var(--mt-white); }
.mt-blog-post .mt-blog-section--soft { background: linear-gradient(180deg, #fffbe0 0%, #fff 100%); }
.mt-blog-post .mt-blog-section-title { position: relative; margin-bottom: 18px; padding-left: 18px; color: var(--mt-black); font-size: clamp(24px, 3.4vw, 38px); font-weight: 900; line-height: 1.14; letter-spacing: -.03em; }
.mt-blog-post .mt-blog-section-title::before { content: ""; position: absolute; top: .12em; left: 0; width: 6px; height: .95em; border-radius: 99px; background: var(--mt-yellow); box-shadow: 0 0 0 4px rgba(255, 225, 1, .22); }
.mt-blog-post .mt-blog-subtitle { margin: 26px 0 12px; color: var(--mt-black); font-size: clamp(20px, 2.6vw, 28px); font-weight: 900; line-height: 1.22; letter-spacing: -.02em; }
.mt-blog-post .mt-blog-text { margin-bottom: 16px; color: var(--mt-text); font-size: var(--mt-body-font-size); line-height: 1.72; }
.mt-blog-post .mt-blog-rich-content > * + * { margin-top: 14px; }
.mt-blog-post .mt-blog-rich-content :where(p,ul,ol,blockquote,pre) { color: inherit; font: inherit; line-height: inherit; }
.mt-blog-post .mt-blog-rich-content :where(ul,ol) { padding-left: 24px; }
.mt-blog-post .mt-blog-rich-content li + li { margin-top: 7px; }
.mt-blog-post .mt-blog-rich-content :where(h2,h3,h4) { color: var(--mt-black); font-weight: 900; line-height: 1.2; letter-spacing: -.02em; }
.mt-blog-post .mt-blog-rich-content h2 { font-size: clamp(23px, 3vw, 34px); }
.mt-blog-post .mt-blog-rich-content h3 { font-size: clamp(20px, 2.5vw, 28px); }
.mt-blog-post .mt-blog-rich-content h4 { font-size: clamp(18px, 2vw, 23px); }
.mt-blog-post .mt-blog-rich-content blockquote { padding: 14px 18px; border-left: 5px solid var(--mt-yellow); border-radius: 0 12px 12px 0; background: #fffbe3; }
.mt-blog-post .mt-blog-callout .mt-blog-rich-content blockquote, .mt-blog-post .mt-blog-cta .mt-blog-rich-content blockquote { color: var(--mt-text); }
.mt-blog-post .mt-blog-rich-content pre { padding: 16px; overflow-x: auto; border-radius: 12px; color: #f8fafc; background: #111827; font-family: "SFMono-Regular", Consolas, monospace; font-size: .84em; white-space: pre-wrap; overflow-wrap: anywhere; }
.mt-blog-post .mt-blog-rich-content code { padding: .12em .34em; border-radius: 5px; color: #9f1239; background: #fff1f2; font-family: "SFMono-Regular", Consolas, monospace; font-size: .88em; }
.mt-blog-post .mt-blog-rich-content pre code { padding: 0; color: inherit; background: transparent; }
.mt-blog-post .mt-blog-rich-content hr { height: 1px; margin: 24px 0; border: 0; background: var(--mt-line); }
.mt-blog-post .mt-blog-rich-image { width: auto !important; max-width: 100% !important; margin: 18px auto !important; border-radius: 16px; }
.mt-blog-post .mt-blog-label { display: inline; margin: 0 3px; padding: 3px 9px; border: 1px solid var(--mt-link-border); border-radius: var(--mt-link-radius); color: var(--mt-link-text); background: var(--mt-link-background); font-size: .92em; font-weight: var(--mt-link-weight); line-height: 1.55; text-decoration: none; overflow-wrap: anywhere; box-decoration-break: clone; }
.mt-blog-post .mt-blog-list { margin: 0 0 26px; padding-left: 22px; color: #2d2d2d; font-size: 17px; line-height: 1.72; }
.mt-blog-post .mt-blog-list li { margin-bottom: 8px; }
.mt-blog-post .mt-blog-table-wrap { width: 100%; margin-bottom: 30px; overflow-x: auto; border: 1px solid #e5e7eb; border-radius: 12px; background: #fff; }
.mt-blog-post .mt-blog-table { width: 100%; min-width: 680px; border-collapse: collapse; color: #2d2d2d; font-size: 15px; line-height: 1.55; }
.mt-blog-post .mt-blog-table th, .mt-blog-post .mt-blog-table td { padding: 14px 16px; border-bottom: 1px solid #e5e7eb; text-align: left; vertical-align: top; }
.mt-blog-post .mt-blog-table th { color: #171717; background: #f7f8fa; font-weight: 800; }
.mt-blog-post .mt-blog-card-grid { display: grid; grid-template-columns: repeat(var(--mt-card-columns, 3), minmax(0, 1fr)); gap: 16px; margin: 22px 0; }
.mt-blog-post .mt-blog-card { min-width: 0; padding: clamp(16px, 2.4vw, 24px); border: 1px solid rgba(255, 225, 1, .45); border-radius: 20px; background: linear-gradient(180deg, #fff 0%, #fffbe5 100%); box-shadow: 0 10px 24px rgba(0, 0, 0, .05); }
.mt-blog-post .mt-blog-card-title { margin-bottom: 10px; color: var(--mt-black); font-size: clamp(18px, 2.2vw, 23px); font-weight: 900; line-height: 1.2; }
.mt-blog-post .mt-blog-callout { margin: clamp(18px, 3vw, 30px) 0; padding: clamp(18px, 3vw, 28px); border: 1px solid rgba(255, 225, 1, .42); border-radius: 22px; color: var(--mt-white); background: var(--mt-black); box-shadow: 0 16px 35px rgba(0, 0, 0, .16); }
.mt-blog-post .mt-blog-callout .mt-blog-text { color: rgba(255, 255, 255, .92); }
.mt-blog-post .mt-blog-faq { display: grid; gap: 14px; margin-top: 24px; }
.mt-blog-post .mt-blog-faq-item { overflow: hidden; border: 1px solid var(--mt-line); border-radius: 20px; background: #fff; box-shadow: 0 10px 24px rgba(0, 0, 0, .05); }
.mt-blog-post .mt-blog-faq-question { display: flex; width: 100%; justify-content: space-between; gap: 18px; padding: clamp(16px, 2.5vw, 24px); border: 0; color: var(--mt-black); background: transparent; font: inherit; font-size: clamp(17px, 2vw, 22px); font-weight: 900; line-height: 1.25; text-align: left; cursor: pointer; }
.mt-blog-post .mt-blog-faq-question::after { content: "+"; color: #8b7b00; }
.mt-blog-post .mt-blog-faq-item[open] .mt-blog-faq-question::after { content: "−"; }
.mt-blog-post .mt-blog-faq-question::-webkit-details-marker { display: none; }
.mt-blog-post .mt-blog-faq-answer { padding: 0 clamp(16px, 2.5vw, 24px) clamp(16px, 2.5vw, 24px); color: var(--mt-text); font-size: var(--mt-body-font-size); line-height: 1.65; }
.mt-blog-post .mt-blog-cta { margin: 24px 0 0; padding: clamp(24px, 4vw, 40px); border-top: 6px solid var(--mt-yellow); border-radius: 22px; color: var(--mt-white); background: var(--mt-black); }
.mt-blog-post .mt-blog-cta-title { margin-bottom: 12px; color: var(--mt-yellow); font-size: clamp(24px, 3.4vw, 38px); font-weight: 900; line-height: 1.14; }
.mt-blog-post .mt-blog-cta .mt-blog-text { color: rgba(255, 255, 255, .92); }
.mt-blog-post .mt-blog-cta-button { display: inline-flex; margin-top: 8px; padding: 12px 18px; border-radius: 12px; color: var(--mt-black); background: var(--mt-yellow); font-weight: 900; text-decoration: none; }
.mt-blog-post .mt-blog-share-preview { position: absolute; left: -9999px; width: 1px; height: 1px; overflow: hidden; color: transparent; font-size: 1px; }
@media (max-width: 900px) { .mt-blog-post .mt-blog-card-grid { grid-template-columns: 1fr; } }
@media (max-width: 768px) {
  .mt-blog-post .mt-blog-article { border-radius: 20px; }
  .mt-blog-post .mt-blog-hero, .mt-blog-post .mt-blog-section { padding: 18px; }
  .mt-blog-post .mt-blog-image, .mt-blog-post .mt-blog-promo-banner { margin: 14px 0; border-radius: 16px; }
  .mt-blog-post .mt-blog-hero .mt-blog-image { margin-top: 0; }
}`;

const ukrainianTransliteration: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ye', ж: 'zh',
  з: 'z', и: 'y', і: 'i', ї: 'yi', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n',
  о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'yu', я: 'ya'
};

function createId(prefix: string) {
  const random = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  return `${prefix}-${random}`;
}

export function normalizeSlug(value: string) {
  return [...value.trim().toLowerCase()]
    .map((character) => ukrainianTransliteration[character] ?? character)
    .join('')
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/giu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100) || 'blog-post';
}

export function createBlogPostDocument(title = '', description = ''): BlogPostDocument {
  return {
    version: 1,
    slug: normalizeSlug(title),
    sharePreview: description,
    hero: {
      kicker: 'Блог Mobile Trend',
      title: title || 'Назва нової статті',
      lead: description,
      imageUrl: '',
      imageAlt: title,
      meta: []
    },
    sections: [
      {
        id: createId('section'),
        title: 'Вступ',
        tone: 'default',
        blocks: [{ id: createId('paragraph'), type: 'paragraph', text: description || 'Додайте основний текст статті.' }]
      }
    ],
    typography: { bodyFontSize: 18 },
    linkAppearance: {
      backgroundColor: '#000000',
      textColor: '#ffe101',
      borderColor: '#ffe101',
      borderRadius: 8,
      fontWeight: 800
    },
    customCss: '',
    customJs: ''
  };
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function safeHexColor(value: unknown, fallback: string) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/iu.test(value) ? value.toLowerCase() : fallback;
}

export function normalizeBlogPostDocument(input: BlogPostDocument | null | undefined, title = '', description = ''): BlogPostDocument {
  const defaults = createBlogPostDocument(title, description);
  if (!input || typeof input !== 'object') return defaults;
  return {
    ...defaults,
    ...input,
    version: 1,
    hero: { ...defaults.hero, ...input.hero },
    sections: Array.isArray(input.sections) ? input.sections : defaults.sections,
    typography: {
      bodyFontSize: boundedNumber(input.typography?.bodyFontSize, defaults.typography.bodyFontSize, 12, 24)
    },
    linkAppearance: {
      backgroundColor: safeHexColor(input.linkAppearance?.backgroundColor, defaults.linkAppearance.backgroundColor),
      textColor: safeHexColor(input.linkAppearance?.textColor, defaults.linkAppearance.textColor),
      borderColor: safeHexColor(input.linkAppearance?.borderColor, defaults.linkAppearance.borderColor),
      borderRadius: boundedNumber(input.linkAppearance?.borderRadius, defaults.linkAppearance.borderRadius, 0, 999),
      fontWeight: boundedNumber(input.linkAppearance?.fontWeight, defaults.linkAppearance.fontWeight, 400, 900)
    }
  };
}

export function createBlogSection(): BlogPostSection {
  return { id: createId('section'), title: 'Нова секція', tone: 'default', blocks: [] };
}

export function createBlogBlock(type: BlogContentBlock['type']): BlogContentBlock {
  const id = createId(type);
  if (type === 'paragraph') return { id, type, text: 'Текст абзацу' };
  if (type === 'subheading') return { id, type, text: 'Підзаголовок' };
  if (type === 'image') return { id, type, url: '', alt: '', caption: '' };
  if (type === 'list') return { id, type, ordered: false, items: ['Перший пункт', 'Другий пункт'] };
  if (type === 'table') return { id, type, headers: ['Параметр', 'Значення'], rows: [['Приклад', 'Опис']] };
  if (type === 'cards') return { id, type, columns: 3, items: [{ title: 'Картка', text: 'Опис картки', linkLabel: '', linkUrl: '' }] };
  if (type === 'callout') return { id, type, title: 'Важливо', text: 'Акцентний текст' };
  if (type === 'faq') return { id, type, items: [{ question: 'Поширене запитання?', answer: 'Відповідь на запитання.' }] };
  return { id, type: 'cta', title: 'Готові обрати?', text: 'Перейдіть до каталогу Mobile Trend.', buttonLabel: 'Відкрити каталог', buttonUrl: 'https://mobiletrend.com.ua/' };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[character] || character);
}

function safeUrl(value: string) {
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : '';
  } catch {
    return '';
  }
}

const discardedRichTextTags = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'form', 'input', 'button']);

function safeIntegerAttribute(element: HTMLElement, name: string, min: number, max: number) {
  const value = Number(element.getAttribute(name));
  return Number.isInteger(value) && value >= min && value <= max ? ` ${name}="${value}"` : '';
}

function safeTextAlign(element: HTMLElement) {
  const match = (element.getAttribute('style') || '').match(/text-align\s*:\s*(left|center|right|justify)/iu);
  return match ? ` style="text-align:${match[1].toLowerCase()}"` : '';
}

function richTextHasBlocks(value: string) {
  return /<(?:p|h[2-4]|blockquote|pre|ul|ol|table|hr)\b/iu.test(value)
    || /<img\b[^>]*\bsrc=["']https?:\/\//iu.test(value);
}

function sanitizeRichText(value: string, preserveBlocks: boolean) {
  if (!value) return '';
  if (typeof DOMParser === 'undefined') return escapeHtml(value);
  const parsed = new DOMParser().parseFromString(value, 'text/html');

  function serialize(node: ChildNode): string {
    if (node.nodeType === 3) return escapeHtml(node.textContent || '');
    if (node.nodeType !== 1) return '';
    const element = node as HTMLElement;
    const tag = element.tagName.toLowerCase();
    if (discardedRichTextTags.has(tag)) return '';
    if (tag === 'br') return '<br />';
    if (tag === 'hr') return preserveBlocks ? '<hr />' : ' — ';

    const content = [...element.childNodes].map(serialize).join('');
    if (tag === 'strong' || tag === 'b') return `<strong>${content}</strong>`;
    if (tag === 'em' || tag === 'i') return `<em>${content}</em>`;
    if (tag === 'u') return `<u>${content}</u>`;
    if (tag === 's' || tag === 'strike' || tag === 'del') return `<s>${content}</s>`;
    if (tag === 'code') return `<code>${content}</code>`;
    if (tag === 'a') {
      const href = safeUrl(element.getAttribute('href') || '');
      return href ? `<a class="mt-blog-label" href="${escapeHtml(href)}">${content}</a>` : content;
    }
    if (tag === 'span') {
      const style = element.getAttribute('style') || '';
      const sizeMatch = style.match(/font-size\s*:\s*(\d+(?:\.\d+)?)px/iu);
      const weightMatch = style.match(/font-weight\s*:\s*(bold|[6-9]00)/iu);
      const italic = /font-style\s*:\s*italic/iu.test(style);
      let formatted = content;
      if (weightMatch) formatted = `<strong>${formatted}</strong>`;
      if (italic) formatted = `<em>${formatted}</em>`;
      if (sizeMatch) {
        const size = Math.min(48, Math.max(10, Number(sizeMatch[1])));
        formatted = `<span style="font-size:${size}px">${formatted}</span>`;
      }
      return formatted;
    }
    if (tag === 'img') {
      if (!preserveBlocks) return '';
      const src = safeUrl(element.getAttribute('src') || '');
      if (!src) return '';
      const alt = escapeHtml(element.getAttribute('alt') || '');
      const title = element.getAttribute('title');
      return `<img class="mt-blog-rich-image" src="${escapeHtml(src)}" alt="${alt}"${title ? ` title="${escapeHtml(title)}"` : ''} loading="lazy" />`;
    }

    if (!preserveBlocks) {
      if (['p', 'div', 'section', 'article', 'header', 'footer', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre'].includes(tag)) {
        return content ? `${content}<br />` : '';
      }
      return content;
    }

    if (tag === 'p') return `<p${safeTextAlign(element)}>${content || '<br />'}</p>`;
    if (tag === 'h2' || tag === 'h3' || tag === 'h4') return `<${tag}${safeTextAlign(element)}>${content}</${tag}>`;
    if (tag === 'blockquote') return `<blockquote>${content}</blockquote>`;
    if (tag === 'pre') return `<pre>${content}</pre>`;
    if (tag === 'ul' || tag === 'ol') return `<${tag}>${content}</${tag}>`;
    if (tag === 'li') return `<li>${content}</li>`;
    if (tag === 'thead' || tag === 'tbody' || tag === 'tfoot') return `<${tag}>${content}</${tag}>`;
    if (tag === 'tr') return `<tr>${content}</tr>`;
    if (tag === 'th' || tag === 'td') {
      const colspan = safeIntegerAttribute(element, 'colspan', 1, 24);
      const rowspan = safeIntegerAttribute(element, 'rowspan', 1, 100);
      return `<${tag}${colspan}${rowspan}>${content}</${tag}>`;
    }
    if (tag === 'table') return `<div class="mt-blog-table-wrap"><table class="mt-blog-table">${content}</table></div>`;
    if (tag === 'colgroup') return `<colgroup>${content}</colgroup>`;
    if (tag === 'col') return '<col />';
    return content;
  }

  const sanitized = [...parsed.body.childNodes].map(serialize).join('');
  return preserveBlocks
    ? sanitized
    : sanitized.replace(/(?:<br \/>\s*){3,}/giu, '<br /><br />').replace(/(?:<br \/>\s*)+$/iu, '');
}

export function sanitizeRichTextHtml(value: string) {
  return sanitizeRichText(value, true);
}

export function renderInlineText(value: string) {
  if (/<(?:strong|b|em|i|u|s|strike|del|code|a|span|br|p|h[1-6]|blockquote|ul|ol|li)\b/iu.test(value)) return sanitizeRichText(value, false);
  const pattern = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*)/giu;
  let result = '';
  let cursor = 0;
  for (const match of value.matchAll(pattern)) {
    const index = match.index || 0;
    result += escapeHtml(value.slice(cursor, index));
    if (match[2] && match[3]) {
      const href = safeUrl(match[3]);
      result += href
        ? `<a class="mt-blog-label" href="${escapeHtml(href)}">${escapeHtml(match[2])}</a>`
        : escapeHtml(match[0]);
    } else if (match[4]) result += `<strong>${escapeHtml(match[4])}</strong>`;
    else if (match[5]) result += `<em>${escapeHtml(match[5])}</em>`;
    cursor = index + match[0].length;
  }
  result += escapeHtml(value.slice(cursor));
  return result.replace(/\r?\n/g, '<br />');
}

function renderRichText(value: string, className: string) {
  if (richTextHasBlocks(value)) return `<div class="${className} mt-blog-rich-content">${sanitizeRichTextHtml(value)}</div>`;
  return `<p class="${className}">${renderInlineText(value)}</p>`;
}

function renderRichTextContents(value: string) {
  return richTextHasBlocks(value) ? sanitizeRichTextHtml(value) : renderInlineText(value);
}

function renderCard(card: BlogCardItem) {
  const url = safeUrl(card.linkUrl);
  const link = url && card.linkLabel
    ? `<p><a class="mt-blog-label" href="${escapeHtml(url)}">${escapeHtml(card.linkLabel)}</a></p>`
    : '';
  return `<article class="mt-blog-card"><h3 class="mt-blog-card-title">${renderInlineText(card.title)}</h3>${renderRichText(card.text, 'mt-blog-text')}${link}</article>`;
}

function renderBlock(block: BlogContentBlock) {
  if (block.type === 'paragraph') return renderRichText(block.text, 'mt-blog-text');
  if (block.type === 'subheading') return `<h3 class="mt-blog-subtitle">${renderInlineText(block.text)}</h3>`;
  if (block.type === 'image') {
    const url = safeUrl(block.url);
    if (!url) return '';
    const caption = block.caption ? `<figcaption>${renderInlineText(block.caption)}</figcaption>` : '';
    return `<figure class="mt-blog-promo-banner"><img src="${escapeHtml(url)}" alt="${escapeHtml(block.alt)}" loading="lazy" />${caption}</figure>`;
  }
  if (block.type === 'list') {
    const tag = block.ordered ? 'ol' : 'ul';
    return `<${tag} class="mt-blog-list">${block.items.filter(Boolean).map((item) => `<li>${renderInlineText(item)}</li>`).join('')}</${tag}>`;
  }
  if (block.type === 'table') {
    const head = `<thead><tr>${block.headers.map((cell) => `<th>${renderInlineText(cell)}</th>`).join('')}</tr></thead>`;
    const rows = block.rows.map((row) => `<tr>${block.headers.map((_, index) => `<td>${renderInlineText(row[index] || '')}</td>`).join('')}</tr>`).join('');
    return `<div class="mt-blog-table-wrap"><table class="mt-blog-table">${head}<tbody>${rows}</tbody></table></div>`;
  }
  if (block.type === 'cards') return `<div class="mt-blog-card-grid" style="--mt-card-columns:${block.columns}">${block.items.map(renderCard).join('')}</div>`;
  if (block.type === 'callout') return `<aside class="mt-blog-callout"><h3 class="mt-blog-subtitle">${renderInlineText(block.title)}</h3>${renderRichText(block.text, 'mt-blog-text')}</aside>`;
  if (block.type === 'faq') {
    const items = block.items.map((item, index) => `<details class="mt-blog-faq-item"${index === 0 ? ' open' : ''}><summary class="mt-blog-faq-question">${renderInlineText(item.question)}</summary><div class="mt-blog-faq-answer mt-blog-rich-content">${renderRichTextContents(item.answer)}</div></details>`).join('');
    return `<div class="mt-blog-faq">${items}</div>`;
  }
  const url = safeUrl(block.buttonUrl);
  const button = url && block.buttonLabel ? `<a class="mt-blog-cta-button" href="${escapeHtml(url)}">${escapeHtml(block.buttonLabel)}</a>` : '';
  return `<aside class="mt-blog-cta"><h3 class="mt-blog-cta-title">${renderInlineText(block.title)}</h3>${renderRichText(block.text, 'mt-blog-text')}${button}</aside>`;
}

function createTemplateJs(rootId: string) {
  return `(() => {
  const root = document.getElementById(${JSON.stringify(rootId)});
  if (!root) return;
  root.querySelectorAll('a[href^="http"]').forEach((link) => {
    link.setAttribute('rel', 'noopener noreferrer');
  });
  root.dataset.mtInteractive = 'ready';
})();`;
}

export function generateBlogPostExport(document: BlogPostDocument): BlogPostExport {
  const normalized = normalizeBlogPostDocument(document);
  const rootId = `mt-blog-${normalizeSlug(normalized.slug || normalized.hero.title)}`;
  const heroImage = safeUrl(normalized.hero.imageUrl)
    ? `<figure class="mt-blog-image"><img src="${escapeHtml(safeUrl(normalized.hero.imageUrl))}" alt="${escapeHtml(normalized.hero.imageAlt)}" loading="lazy" /></figure>`
    : '';
  const meta = normalized.hero.meta.filter(Boolean).length
    ? `<div class="mt-blog-meta">${normalized.hero.meta.filter(Boolean).map((item) => `<span class="mt-blog-meta-item">${renderInlineText(item)}</span>`).join('')}</div>`
    : '';
  const sections = normalized.sections.map((section) => `<section class="mt-blog-section${section.tone === 'soft' ? ' mt-blog-section--soft' : ''}"><h2 class="mt-blog-section-title">${renderInlineText(section.title)}</h2>${section.blocks.map(renderBlock).join('')}</section>`).join('');
  const html = `<div class="mt-blog-post" id="${rootId}"><article class="mt-blog-article"><p class="mt-blog-share-preview">${escapeHtml(normalized.sharePreview)}</p><header class="mt-blog-hero">${heroImage}<div class="mt-blog-kicker">${renderInlineText(normalized.hero.kicker)}</div><h1 class="mt-blog-title">${renderInlineText(normalized.hero.title)}</h1>${normalized.hero.lead ? renderRichText(normalized.hero.lead, 'mt-blog-lead') : ''}${meta}</header>${sections}</article></div>`;
  const settingsCss = `#${rootId} {\n  --mt-body-font-size: ${normalized.typography.bodyFontSize}px;\n  --mt-link-background: ${normalized.linkAppearance.backgroundColor};\n  --mt-link-text: ${normalized.linkAppearance.textColor};\n  --mt-link-border: ${normalized.linkAppearance.borderColor};\n  --mt-link-radius: ${normalized.linkAppearance.borderRadius}px;\n  --mt-link-weight: ${normalized.linkAppearance.fontWeight};\n}`;
  const css = `${BLOG_TEMPLATE_CSS}\n${settingsCss}${normalized.customCss.trim() ? `\n${normalized.customCss.trim()}` : ''}`;
  const js = `${createTemplateJs(rootId)}${normalized.customJs.trim() ? `\n\n${normalized.customJs.trim()}` : ''}`;
  const combined = `${html}\n<style type="text/css">\n${css}\n</style>\n<script>\n${js.replace(/<\/script/giu, '<\\/script')}\n</script>`;
  const preview = `<!doctype html><html lang="uk"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><style>body{margin:0;padding:24px;background:#eef0f3;font-family:Arial,sans-serif}@media(max-width:480px){body{padding:0}}</style><style>${css}</style></head><body>${html}<script>${js.replace(/<\/script/giu, '<\\/script')}</script></body></html>`;
  return { html, css, js, combined, preview };
}
