import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { query } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';

export const builtInPhotoParserAdapters = Object.freeze([
  {
    id: 'builtin-rozetka',
    name: 'Rozetka',
    host: 'rozetka.com.ua',
    storeUrl: 'https://rozetka.com.ua',
    gallerySelector: '[data-testid*="gallery" i] img, [class*="product" i] [class*="gallery" i] img, [class*="product" i] [class*="slider" i] img',
    strict: false,
    fallback: true,
    sortOrder: 10
  },
  {
    id: 'builtin-comfy',
    name: 'COMFY',
    host: 'comfy.ua',
    storeUrl: 'https://comfy.ua',
    gallerySelector: '.gallery__carousel_container .gallery__carousel_item-image img, .gallery__carousel_container img[alt^="Фото -"]',
    strict: true,
    fallback: true,
    sortOrder: 20
  },
  {
    id: 'builtin-allo',
    name: 'ALLO',
    host: 'allo.ua',
    storeUrl: 'https://allo.ua',
    gallerySelector: '.main-gallery.main-media__gallery .snap-slider__slider > .snap-slider__item .main-gallery__image, .main-gallery.main-media__gallery .main-gallery__image, .p-main__media .main-gallery__image, main .main-gallery__image[alt^="Фото -"]',
    strict: true,
    fallback: true,
    sortOrder: 30
  },
  {
    id: 'builtin-foxtrot',
    name: 'Foxtrot',
    host: 'foxtrot.com.ua',
    storeUrl: 'https://www.foxtrot.com.ua',
    gallerySelector: '#mainImagesSlider > picture.pdp-main-img > img, #mainImagesSlider .pdp-main-img img, .pdp-main-slider-img-container .pdp-main-img img',
    strict: true,
    fallback: true,
    sortOrder: 40
  }
]);

export function normalizeHttpUrl(value, fieldName = 'Посилання') {
  let text = String(value || '').trim();
  if (text && !/^https?:\/\//i.test(text)) text = `https://${text}`;
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    throw new AppError(422, 'PHOTO_PARSER_INVALID_URL', `${fieldName} має бути коректною HTTP-адресою.`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new AppError(422, 'PHOTO_PARSER_INVALID_URL', `${fieldName} має починатися з http:// або https://.`);
  }
  parsed.username = '';
  parsed.password = '';
  parsed.hash = '';
  return parsed;
}

export function hostMatches(hostname, adapterHost) {
  const current = String(hostname || '').toLowerCase().replace(/^www\./, '');
  const target = String(adapterHost || '').toLowerCase().replace(/^www\./, '');
  return Boolean(current && target) && (current === target || current.endsWith(`.${target}`));
}

export function sanitizePhotoParserAdapterInput(payload, existing = null) {
  const name = String(payload?.name || '').replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > 80) {
    throw new AppError(422, 'PHOTO_PARSER_ADAPTER_NAME_INVALID', 'Назва магазину повинна містити від 2 до 80 символів.');
  }
  const store = normalizeHttpUrl(payload?.storeUrl, 'Адреса магазину');
  const host = store.hostname.toLowerCase().replace(/^www\./, '');
  const gallerySelector = String(payload?.gallerySelector || '').trim();
  if (!gallerySelector || gallerySelector.length > 1000) {
    throw new AppError(422, 'PHOTO_PARSER_SELECTOR_INVALID', 'CSS-селектор повинен містити від 1 до 1000 символів.');
  }
  if (/[{};]/.test(gallerySelector)) {
    throw new AppError(422, 'PHOTO_PARSER_SELECTOR_INVALID', 'Вкажіть лише CSS-селектор без фігурних дужок і правил стилю.');
  }
  return {
    id: existing?.id || `custom-${randomUUID()}`,
    source: 'custom',
    name,
    host,
    storeUrl: store.origin,
    gallerySelector,
    strict: true,
    fallback: payload?.fallback === true,
    enabled: existing?.enabled !== false,
    sortOrder: Number(existing?.sortOrder || 100)
  };
}

export function serializePhotoParserAdapter(row) {
  return {
    id: row.id,
    source: row.source,
    name: row.name,
    host: row.host,
    storeUrl: row.store_url,
    gallerySelector: row.gallery_selector,
    strict: row.strict === true,
    fallback: row.fallback === true,
    enabled: row.enabled === true,
    sortOrder: Number(row.sort_order || 0),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

export async function ensureBuiltInPhotoParserAdapters(db = { query }) {
  for (const adapter of builtInPhotoParserAdapters) {
    await db.query(
      `INSERT INTO used_smartphone_photo_parser_adapters (
         id, source, name, host, store_url, gallery_selector, strict, fallback, enabled, sort_order
       ) VALUES ($1, 'builtin', $2, $3, $4, $5, $6, $7, TRUE, $8)
       ON CONFLICT (id)
       DO UPDATE SET name = EXCLUDED.name,
                     host = EXCLUDED.host,
                     store_url = EXCLUDED.store_url,
                     gallery_selector = EXCLUDED.gallery_selector,
                     strict = EXCLUDED.strict,
                     fallback = EXCLUDED.fallback,
                     sort_order = EXCLUDED.sort_order,
                     updated_at = NOW()`,
      [
        adapter.id,
        adapter.name,
        adapter.host,
        adapter.storeUrl,
        adapter.gallerySelector,
        adapter.strict,
        adapter.fallback,
        adapter.sortOrder
      ]
    );
  }
}

export async function loadPhotoParserAdapters(db = { query }) {
  await ensureBuiltInPhotoParserAdapters(db);
  const result = await db.query(
    `SELECT *
     FROM used_smartphone_photo_parser_adapters
     ORDER BY CASE source WHEN 'builtin' THEN 0 ELSE 1 END, sort_order, lower(name)`
  );
  return result.rows.map(serializePhotoParserAdapter);
}

export function findPhotoParserAdapter(url, adapters) {
  let hostname = '';
  try {
    hostname = new URL(url).hostname;
  } catch {
    return null;
  }
  const custom = adapters.find((adapter) => (
    adapter.source === 'custom' && adapter.enabled && hostMatches(hostname, adapter.host)
  ));
  if (custom) return custom;
  return adapters.find((adapter) => (
    adapter.source === 'builtin' && adapter.enabled && hostMatches(hostname, adapter.host)
  )) || null;
}

export function normalizePhotoParserImageUrls(urls, pageUrl) {
  let pageHost = '';
  try {
    pageHost = new URL(pageUrl).hostname.toLowerCase();
  } catch {
    return [];
  }
  let sourceUrls = Array.isArray(urls) ? urls : [];

  if (pageHost.endsWith('foxtrot.com.ua')) {
    let productPrefix = '';
    for (const raw of sourceUrls) {
      try {
        const name = path.posix.basename(new URL(raw).pathname);
        const match = name.match(/^(img_0_\d+_\d+_)/i);
        if (match) {
          productPrefix = match[1].toLowerCase();
          break;
        }
      } catch {
        // Ignore invalid candidates collected from the page.
      }
    }
    if (productPrefix) {
      sourceUrls = sourceUrls.filter((raw) => {
        try {
          const image = new URL(raw);
          return image.hostname.toLowerCase().endsWith('foxtrot.com.ua')
            && path.posix.basename(image.pathname).toLowerCase().startsWith(productPrefix);
        } catch {
          return false;
        }
      });
    }
  }

  const result = [];
  const seen = new Set();
  for (const raw of sourceUrls) {
    try {
      const image = new URL(raw);
      if (!['http:', 'https:'].includes(image.protocol)) continue;
      const host = image.hostname.toLowerCase();
      image.pathname = image.pathname.replace(/\/{2,}/g, '/');

      if (pageHost.endsWith('comfy.ua')) {
        if (!host.endsWith('comfy.ua') || !image.pathname.includes('/media/catalog/product/')) continue;
        if (/\/small_image\//i.test(image.pathname)) continue;
        image.pathname = image.pathname.replace(
          /\/media\/catalog\/product\/cache\/[^/]+\/image\/[^/]+\/[^/]+\//i,
          '/media/catalog/product/'
        );
      }

      if (pageHost.endsWith('allo.ua')) {
        if (!host.endsWith('allo.ua') || !image.pathname.includes('/media/catalog/product/')) continue;
        image.pathname = image.pathname.replace(
          /\/media\/catalog\/product\/cache\/[^/]+\/image\/[^/]+\/[^/]+\//i,
          '/media/catalog/product/'
        );
      }

      if (pageHost.endsWith('rozetka.com.ua') && /(^|\.)content\d*\.rozetka\.com\.ua$/.test(host)) {
        image.pathname = image.pathname.replace(
          /\/goods\/images\/(?:base_action|big|medium|preview|original)\//i,
          '/goods/images/original/'
        );
      }

      image.hash = '';
      let key = image.href;
      if (pageHost.endsWith('foxtrot.com.ua')) {
        key = path.posix.basename(image.pathname)
          .replace(/_Small(?=\.)/i, '')
          .replace(/\.[^.]+$/, '')
          .toLowerCase();
      }
      if (!seen.has(key)) {
        seen.add(key);
        result.push(image.href);
      }
    } catch {
      // Ignore invalid candidates collected from the page.
    }
  }
  return result;
}
