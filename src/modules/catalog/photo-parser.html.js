function decodeNumericEntity(value, radix) {
  const codePoint = Number.parseInt(value, radix);
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10FFFF) return '';
  return String.fromCodePoint(codePoint);
}

function decodeHtmlText(value) {
  return String(value || '')
    .replace(/&#(\d+);/g, (_, code) => decodeNumericEntity(code, 10))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => decodeNumericEntity(code, 16))
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
}

function readHtmlAttribute(tag, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(tag || '').match(new RegExp(
    `\\s${escapedName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    'i'
  ));
  return decodeHtmlText(match?.[1] ?? match?.[2] ?? match?.[3] ?? '');
}

function appendImage(images, seen, raw) {
  if (Array.isArray(raw)) {
    raw.forEach((item) => appendImage(images, seen, item));
    return;
  }
  if (raw && typeof raw === 'object') {
    appendImage(images, seen, raw.url || raw.contentUrl || raw.src || raw.image);
    return;
  }
  const value = decodeHtmlText(raw).trim().replace(/\\u002[fF]/g, '/').replace(/\\\//g, '/');
  if (!value || !/^https?:\/\//i.test(value) || seen.has(value)) return;
  seen.add(value);
  images.push(value);
}

function inspectStructuredData(node, state, depth = 0) {
  if (!node || depth > 14) return;
  if (Array.isArray(node)) {
    node.forEach((item) => inspectStructuredData(item, state, depth + 1));
    return;
  }
  if (typeof node !== 'object') return;
  const rawType = node['@type'];
  const types = (Array.isArray(rawType) ? rawType : [rawType])
    .map((type) => String(type || '').toLowerCase());
  if (types.includes('product')) {
    if (!state.title && typeof node.name === 'string') state.title = decodeHtmlText(node.name).trim();
    appendImage(state.structured, state.seen, node.image);
    appendImage(state.structured, state.seen, node.images);
    appendImage(state.structured, state.seen, node.offers?.image);
  }
  Object.values(node).forEach((child) => {
    if (child && typeof child === 'object') inspectStructuredData(child, state, depth + 1);
  });
}

export function extractPhotoParserPageDataFromHtml(html, adapterConfig = null) {
  const source = String(html || '');
  const state = { title: '', structured: [], seen: new Set() };

  for (const match of source.matchAll(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi)) {
    const tagEnd = match[0].indexOf('>');
    const openingTag = match[0].slice(0, tagEnd + 1);
    if (readHtmlAttribute(openingTag, 'type').toLowerCase() !== 'application/ld+json') continue;
    const body = match[0].slice(tagEnd + 1).replace(/<\/script\s*>$/i, '').trim();
    if (!body) continue;
    try {
      inspectStructuredData(JSON.parse(body), state);
    } catch {
      // Invalid structured data must not hide other valid product blocks.
    }
  }

  const metaImages = [];
  const metaSeen = new Set(state.seen);
  let metaTitle = '';
  for (const match of source.matchAll(/<meta\b[^>]*>/gi)) {
    const property = (
      readHtmlAttribute(match[0], 'property')
      || readHtmlAttribute(match[0], 'name')
    ).toLowerCase();
    const content = readHtmlAttribute(match[0], 'content');
    if (property === 'og:image' || property === 'twitter:image') {
      appendImage(metaImages, metaSeen, content);
    }
    if (!metaTitle && (property === 'og:title' || property === 'twitter:title')) {
      metaTitle = content.trim();
    }
  }

  const documentTitle = decodeHtmlText(
    source.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1] || ''
  ).replace(/\s+/g, ' ').trim();
  const images = [...state.structured, ...metaImages];

  return {
    title: state.title || metaTitle || documentTitle,
    images: images.slice(0, 40),
    diagnostics: {
      structured: state.structured.length,
      gallery: 0,
      meta: metaImages.length,
      content: 0,
      adapterId: adapterConfig?.id || '',
      adapterName: adapterConfig?.name || '',
      selectorMatches: 0,
      selectorImages: 0,
      selectorError: '',
      transport: 'html-fallback'
    }
  };
}
