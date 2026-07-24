import { access } from 'node:fs/promises';
import dns from 'node:dns/promises';
import net from 'node:net';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { AppError } from '../../lib/app-error.js';
import { normalizePhotoParserImageUrls } from './photo-parser.adapters.js';

const pageTimeoutMs = 35_000;
const imageTimeoutMs = 30_000;
const maxRemoteImageBytes = 15 * 1024 * 1024;
const browserUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + 'KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';

let browserPromise = null;

function isPrivateIpv4(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && (b === 0 || b === 168)) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  return false;
}

function isPrivateIpv6(address) {
  const value = address.toLowerCase().split('%')[0];
  if (value === '::' || value === '::1') return true;
  if (value.startsWith('fc') || value.startsWith('fd')) return true;
  if (/^fe[89ab]/.test(value)) return true;
  if (value.startsWith('ff')) return true;
  if (value.startsWith('2001:db8:')) return true;
  if (value.startsWith('::ffff:')) {
    const mapped = value.slice('::ffff:'.length);
    return net.isIP(mapped) === 4 ? isPrivateIpv4(mapped) : true;
  }
  return false;
}

export function isPrivateNetworkAddress(address) {
  const version = net.isIP(String(address || ''));
  if (version === 4) return isPrivateIpv4(address);
  if (version === 6) return isPrivateIpv6(address);
  return true;
}

export async function assertPublicPhotoParserUrl(value, { cache = new Map(), resolver = dns.lookup } = {}) {
  let parsed;
  try {
    parsed = new URL(String(value || ''));
  } catch {
    throw new AppError(422, 'PHOTO_PARSER_INVALID_URL', 'Вкажіть коректне HTTP-посилання.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new AppError(422, 'PHOTO_PARSER_INVALID_URL', 'Дозволені лише публічні HTTP та HTTPS посилання без облікових даних.');
  }
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new AppError(422, 'PHOTO_PARSER_PRIVATE_URL', 'Локальні та приватні адреси заборонені.');
  }
  if (net.isIP(hostname)) {
    if (isPrivateNetworkAddress(hostname)) {
      throw new AppError(422, 'PHOTO_PARSER_PRIVATE_URL', 'Локальні та приватні адреси заборонені.');
    }
    return parsed;
  }
  if (cache.has(hostname)) {
    if (cache.get(hostname) !== true) {
      throw new AppError(422, 'PHOTO_PARSER_PRIVATE_URL', 'Домен веде на локальну або приватну адресу.');
    }
    return parsed;
  }
  let records;
  try {
    records = await resolver(hostname, { all: true, verbatim: true });
  } catch {
    throw new AppError(422, 'PHOTO_PARSER_HOST_UNAVAILABLE', `Не вдалося визначити адресу домену ${hostname}.`);
  }
  const safe = records.length > 0 && records.every((record) => !isPrivateNetworkAddress(record.address));
  cache.set(hostname, safe);
  if (!safe) throw new AppError(422, 'PHOTO_PARSER_PRIVATE_URL', 'Домен веде на локальну або приватну адресу.');
  return parsed;
}

async function firstExistingExecutable(candidates) {
  for (const candidate of candidates.filter(Boolean)) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next known Chromium installation.
    }
  }
  return '';
}

async function resolveChromiumExecutable() {
  const configured = String(process.env.CHROMIUM_EXECUTABLE_PATH || '').trim();
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const localAppData = process.env.LOCALAPPDATA || '';
  const candidates = process.platform === 'win32'
    ? [
        configured,
        path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        localAppData && path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe')
      ]
    : [
        configured,
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable'
      ];
  const executable = await firstExistingExecutable(candidates);
  if (!executable) {
    throw new AppError(
      503,
      'PHOTO_PARSER_BROWSER_UNAVAILABLE',
      'Браузерний модуль парсера недоступний. Налаштуйте CHROMIUM_EXECUTABLE_PATH.'
    );
  }
  return executable;
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = resolveChromiumExecutable()
      .then((executablePath) => chromium.launch({
        executablePath,
        headless: true,
        args: ['--disable-dev-shm-usage', '--no-sandbox', '--disable-setuid-sandbox']
      }))
      .catch((error) => {
        browserPromise = null;
        throw error;
      });
  }
  const browser = await browserPromise;
  if (!browser.isConnected()) {
    browserPromise = null;
    return getBrowser();
  }
  return browser;
}

export async function closePhotoParserBrowser() {
  if (!browserPromise) return;
  try {
    const browser = await browserPromise;
    await browser.close();
  } catch {
    // Browser shutdown should not block application shutdown.
  } finally {
    browserPromise = null;
  }
}

function collectProductPageData(adapterConfig) {
  const groups = { structured: [], gallery: [], meta: [], content: [] };
  const seen = new Set();
  const absolute = (raw) => {
    if (!raw || typeof raw !== 'string') return null;
    const value = raw.trim().replace(/\\u002[fF]/g, '/').replace(/\\\//g, '/').replace(/&amp;/g, '&');
    if (!value || /^(data|blob|javascript):/i.test(value)) return null;
    try {
      const result = new URL(value, location.href);
      return /^https?:$/.test(result.protocol) ? result.href : null;
    } catch {
      return null;
    }
  };
  const looksUseful = (url) => {
    if (!url) return false;
    return !/(favicon|sprite|logo(?:[_-]|\.)|placeholder|no[-_]?image|payment|rating|avatar|icon(?:[_-]|\.)|\.svg(?:\?|$)|\.gif(?:\?|$))/i.test(url);
  };
  const add = (group, raw) => {
    if (Array.isArray(raw)) {
      raw.forEach((item) => add(group, item));
      return;
    }
    if (raw && typeof raw === 'object') {
      add(group, raw.url || raw.contentUrl || raw.src || raw.image);
      return;
    }
    const url = absolute(raw);
    if (!looksUseful(url)) return;
    const key = url.replace(/#.*$/, '')
      .replace(/([?&])(w|width|h|height|size|resize|quality|q)=\d+/gi, '$1')
      .replace(/[?&]+$/, '');
    const groupKey = `${group}|${key}`;
    if (seen.has(groupKey)) return;
    seen.add(groupKey);
    groups[group].push(url);
  };
  const readImageValue = (value, group = 'structured') => {
    if (typeof value === 'string' || Array.isArray(value)) {
      add(group, value);
      return;
    }
    if (value && typeof value === 'object') {
      add(group, value.url || value.contentUrl || value.src);
      if (value.image) readImageValue(value.image, group);
    }
  };
  let structuredTitle = '';
  const inspectLd = (node, depth = 0) => {
    if (!node || depth > 12) return;
    if (Array.isArray(node)) {
      node.forEach((child) => inspectLd(child, depth + 1));
      return;
    }
    if (typeof node !== 'object') return;
    const rawType = node['@type'];
    const types = Array.isArray(rawType) ? rawType : [rawType];
    if (types.some((type) => String(type || '').toLowerCase() === 'product')) {
      if (!structuredTitle && typeof node.name === 'string') structuredTitle = node.name.trim();
      readImageValue(node.image);
      readImageValue(node.images);
      if (node.offers?.image) readImageValue(node.offers.image);
    }
    Object.values(node).forEach((child) => {
      if (child && typeof child === 'object') inspectLd(child, depth + 1);
    });
  };
  document.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
    try {
      inspectLd(JSON.parse(script.textContent || ''));
    } catch {
      // Ignore invalid structured data.
    }
  });
  const largestSrcset = (srcset) => {
    if (!srcset) return '';
    return srcset.split(',').map((part) => {
      const bits = part.trim().split(/\s+/);
      const descriptor = bits[1] || '1';
      const size = descriptor.endsWith('w') ? Number.parseFloat(descriptor) : Number.parseFloat(descriptor) * 1000;
      return { url: bits[0], size: Number.isFinite(size) ? size : 0 };
    }).sort((left, right) => right.size - left.size)[0]?.url || '';
  };
  const imageUrl = (image) => {
    for (const attribute of ['data-zoom-image', 'data-large-image', 'data-large', 'data-original', 'data-full', 'data-src', 'data-lazy-src', 'data-image']) {
      const value = image.getAttribute(attribute);
      if (looksUseful(absolute(value))) return value;
    }
    return [
      largestSrcset(image.getAttribute('srcset') || image.getAttribute('data-srcset')),
      image.currentSrc,
      image.getAttribute('src'),
      image.src
    ].find((value) => looksUseful(absolute(value))) || '';
  };
  const genericGallerySelector = [
    '[data-testid*="gallery" i] img',
    '[data-testid*="image" i] img',
    '[class*="product" i] [class*="gallery" i] img',
    '[class*="product" i] [class*="slider" i] img',
    '[class*="gallery" i] img',
    '[class*="carousel" i] img',
    '[class*="swiper" i] img',
    '[class*="thumb" i] img',
    '[id*="gallery" i] img',
    '[id*="product" i] img'
  ].join(',');
  let selectorMatches = 0;
  let selectorImages = 0;
  let selectorError = '';
  const collectGallery = (selector, trackMatches = false) => {
    try {
      const roots = Array.from(document.querySelectorAll(selector));
      if (trackMatches) selectorMatches = roots.length;
      roots.forEach((root) => {
        const images = root.matches?.('img') ? [root] : Array.from(root.querySelectorAll?.('img') || []);
        images.forEach((image) => {
          if (image.closest('header, nav, footer')) return;
          const before = groups.gallery.length;
          add('gallery', imageUrl(image));
          if (trackMatches && groups.gallery.length > before) selectorImages += 1;
        });
      });
    } catch (error) {
      if (trackMatches) selectorError = error?.message || 'Некоректний CSS-селектор';
    }
  };
  if (adapterConfig?.gallerySelector) {
    collectGallery(adapterConfig.gallerySelector, true);
    if (groups.gallery.length === 0 && adapterConfig.fallback) collectGallery(genericGallerySelector);
  } else {
    collectGallery(genericGallerySelector);
  }
  add('meta', document.querySelector('meta[property="og:image"]')?.content);
  add('meta', document.querySelector('meta[name="twitter:image"]')?.content);
  document.querySelectorAll('main img, [role="main"] img, article img').forEach((image) => {
    if (image.closest('header, nav, footer')) return;
    const width = image.naturalWidth || Number.parseInt(image.getAttribute('width') || '', 10) || image.getBoundingClientRect().width;
    const height = image.naturalHeight || Number.parseInt(image.getAttribute('height') || '', 10) || image.getBoundingClientRect().height;
    if (width >= 240 && height >= 240) add('content', imageUrl(image));
  });
  const title = (
    structuredTitle
    || document.querySelector('main h1, [role="main"] h1, h1')?.textContent
    || document.querySelector('meta[property="og:title"]')?.content
    || document.querySelector('meta[name="twitter:title"]')?.content
    || document.title
    || ''
  ).replace(/\s+/g, ' ').trim();
  const images = [];
  const append = (items) => items.forEach((url) => {
    if (!images.includes(url)) images.push(url);
  });
  if (adapterConfig?.strict && groups.gallery.length > 0) {
    append(groups.gallery);
  } else if (!(adapterConfig?.strict && !adapterConfig.fallback)) {
    append(groups.structured);
    append(groups.gallery);
    append(groups.meta);
    if (images.length < 2) append(groups.content);
  }
  return {
    title,
    images: images.slice(0, 40),
    diagnostics: {
      structured: groups.structured.length,
      gallery: groups.gallery.length,
      meta: groups.meta.length,
      content: groups.content.length,
      adapterId: adapterConfig?.id || '',
      adapterName: adapterConfig?.name || '',
      selectorMatches,
      selectorImages,
      selectorError
    }
  };
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    const height = Math.min(document.documentElement.scrollHeight, 6000);
    for (let y = 0; y < height; y += 700) {
      window.scrollTo(0, Math.min(y, height));
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    window.scrollTo(0, 0);
    await new Promise((resolve) => setTimeout(resolve, 350));
  }).catch(() => {});
}

async function downloadImage(context, imageUrl, referer, dnsCache) {
  let currentUrl = (await assertPublicPhotoParserUrl(imageUrl, { cache: dnsCache })).href;
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    const response = await context.request.get(currentUrl, {
      headers: {
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'uk-UA,uk;q=0.9,en;q=0.7',
        Referer: referer
      },
      timeout: imageTimeoutMs,
      failOnStatusCode: false,
      maxRedirects: 0
    });
    try {
      const status = response.status();
      if ([301, 302, 303, 307, 308].includes(status)) {
        if (redirects === 5) throw new Error('Забагато перенаправлень під час завантаження фото');
        const location = response.headers().location;
        if (!location) throw new Error(`HTTP ${status} без адреси перенаправлення`);
        currentUrl = (await assertPublicPhotoParserUrl(
          new URL(location, currentUrl).href,
          { cache: dnsCache }
        )).href;
        continue;
      }
      if (!response.ok()) throw new Error(`HTTP ${status}`);
      await assertPublicPhotoParserUrl(response.url(), { cache: dnsCache });
      const headers = response.headers();
      const contentType = String(headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (contentType && !contentType.startsWith('image/')) throw new Error('Сервер повернув не зображення');
      const contentLength = Number(headers['content-length'] || 0);
      if (contentLength > maxRemoteImageBytes) throw new Error('Файл більший за 15 МБ');
      const buffer = await response.body();
      if (!buffer.length) throw new Error('Сервер повернув порожній файл');
      if (buffer.length > maxRemoteImageBytes) throw new Error('Файл більший за 15 МБ');
      return { buffer, contentType, finalUrl: response.url() };
    } finally {
      await response.dispose();
    }
  }
  throw new Error('Не вдалося завантажити фотографію');
}

export async function scrapePhotoParserProduct({
  url,
  adapter = null,
  maxImages = 20,
  onProgress = () => {}
}) {
  const dnsCache = new Map();
  const safeUrl = await assertPublicPhotoParserUrl(url, { cache: dnsCache });
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: browserUserAgent,
    locale: 'uk-UA',
    viewport: { width: 1280, height: 900 },
    serviceWorkers: 'block',
    acceptDownloads: false
  });
  const page = await context.newPage();
  await context.route('**/*', async (route) => {
    const requestUrl = route.request().url();
    if (/^(data:|blob:|about:blank)/i.test(requestUrl)) return route.continue();
    try {
      await assertPublicPhotoParserUrl(requestUrl, { cache: dnsCache });
      return route.continue();
    } catch {
      return route.abort('blockedbyclient');
    }
  });
  try {
    onProgress({ phase: 'page', current: 0, total: 3, message: 'Відкриваємо сторінку товару…' });
    const response = await page.goto(safeUrl.href, {
      waitUntil: 'domcontentloaded',
      timeout: pageTimeoutMs
    });
    if (!response) throw new Error('Сторінка не повернула відповідь');
    if (!response.ok()) throw new Error(`Сторінка повернула HTTP ${response.status()}`);
    await assertPublicPhotoParserUrl(page.url(), { cache: dnsCache });

    onProgress({ phase: 'page', current: 1, total: 3, message: 'Завантажуємо галерею…' });
    const waitSelector = adapter?.gallerySelector || [
      '[data-testid*="gallery" i] img',
      '[class*="product" i] [class*="gallery" i] img',
      '[class*="product" i] [class*="slider" i] img',
      '[class*="gallery" i] img'
    ].join(',');
    await page.waitForFunction((selector) => {
      try {
        return Array.from(document.querySelectorAll(selector)).some((root) => {
          const image = root.matches?.('img') ? root : root.querySelector?.('img');
          return Boolean(image && (
            image.currentSrc
            || image.getAttribute('src')
            || image.getAttribute('data-src')
            || image.getAttribute('data-lazy-src')
          ));
        });
      } catch {
        return true;
      }
    }, waitSelector, { timeout: 6500 }).catch(() => {});
    await autoScroll(page);
    await page.waitForTimeout(500);

    onProgress({ phase: 'page', current: 2, total: 3, message: 'Аналізуємо фотографії…' });
    const pageData = await page.evaluate(collectProductPageData, adapter ? {
      id: adapter.id,
      name: adapter.name,
      gallerySelector: adapter.gallerySelector,
      strict: adapter.strict === true,
      fallback: adapter.fallback === true
    } : null);
    if (pageData.diagnostics.selectorError) {
      throw new AppError(422, 'PHOTO_PARSER_SELECTOR_INVALID', `CSS-селектор некоректний: ${pageData.diagnostics.selectorError}`);
    }
    if (adapter?.strict && !pageData.diagnostics.selectorMatches) {
      throw new AppError(422, 'PHOTO_PARSER_SELECTOR_EMPTY', 'CSS-селектор не знайшов жодного елемента на сторінці.');
    }
    if (adapter?.strict && !pageData.diagnostics.selectorImages) {
      throw new AppError(422, 'PHOTO_PARSER_SELECTOR_WITHOUT_IMAGES', 'У знайденому контейнері немає доступних зображень.');
    }
    const candidates = normalizePhotoParserImageUrls(pageData.images, page.url()).slice(0, Math.max(1, Math.min(maxImages, 40)));
    if (!candidates.length) {
      throw new AppError(
        422,
        'PHOTO_PARSER_IMAGES_NOT_FOUND',
        'На сторінці не знайдено фотографій товару. Сайт міг заблокувати доступ або змінити структуру галереї.'
      );
    }
    onProgress({ phase: 'page', current: 3, total: 3, message: 'Галерею знайдено' });

    const images = [];
    const errors = [];
    let nextIndex = 0;
    const worker = async () => {
      while (nextIndex < candidates.length) {
        const index = nextIndex;
        nextIndex += 1;
        const candidate = candidates[index];
        try {
          const downloaded = await downloadImage(context, candidate, page.url(), dnsCache);
          images[index] = { sourceUrl: candidate, ...downloaded };
        } catch (error) {
          errors.push({
            sourceUrl: candidate,
            stage: 'download',
            message: error?.message || 'Не вдалося завантажити фотографію'
          });
        } finally {
          const complete = images.filter(Boolean).length + errors.length;
          onProgress({
            phase: 'images',
            current: complete,
            total: candidates.length,
            message: `Завантажуємо фото: ${complete} із ${candidates.length}`
          });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, candidates.length) }, () => worker()));
    return {
      title: pageData.title,
      pageUrl: page.url(),
      adapterId: adapter?.id || '',
      diagnostics: {
        ...pageData.diagnostics,
        candidates: candidates.length,
        downloaded: images.filter(Boolean).length
      },
      images: images.filter(Boolean),
      errors
    };
  } finally {
    await context.close();
  }
}
