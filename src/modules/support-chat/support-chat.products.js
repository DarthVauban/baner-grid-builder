import { query } from '../../db/pool.js';

const urlPattern = /https?:\/\/[^\s<>"']+/giu;

function jsonObject(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function jsonArray(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function localizedTitle(value, fallback) {
  const titles = jsonObject(value);
  return titles.uk || titles.ua || titles.ru || titles.en || Object.values(titles).find(Boolean) || fallback;
}

function rawHostname(value) {
  try {
    const url = new URL(/^https?:\/\//iu.test(String(value || '')) ? value : `https://${value}`);
    return url.hostname.toLowerCase();
  } catch {
    return '';
  }
}

function hostname(value) {
  return rawHostname(value).replace(/^www\./u, '');
}

function normalizeCandidate(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    url.hash = '';
    const path = decodeURIComponent(url.pathname).replace(/\/+$/u, '') || '/';
    return {
      href: url.href,
      rawHost: url.hostname.toLowerCase(),
      host: url.hostname.toLowerCase().replace(/^www\./u, ''),
      key: `${url.hostname.toLowerCase().replace(/^www\./u, '')}${path}`,
      pathname: url.pathname,
      search: url.search
    };
  } catch {
    return null;
  }
}

function candidateVariants(candidate, storeDomain) {
  const result = new Set();
  const storeHost = hostname(storeDomain);
  const rawStoreHost = rawHostname(storeDomain);
  for (const host of new Set([candidate.rawHost, candidate.host, rawStoreHost, storeHost].filter(Boolean))) {
    for (const protocol of ['https:', 'http:']) {
      const url = new URL(`${protocol}//${host}${candidate.pathname}${candidate.search}`);
      result.add(url.href);
      url.search = '';
      result.add(url.href);
      if (url.pathname !== '/') {
        url.pathname = url.pathname.endsWith('/') ? url.pathname.replace(/\/+$/u, '') : `${url.pathname}/`;
        result.add(url.href);
      }
    }
  }
  return [...result];
}

function messageCandidates(body, pageUrl) {
  const candidates = [];
  const seen = new Set();
  const add = (value, source) => {
    const candidate = normalizeCandidate(value);
    if (!candidate || seen.has(`${source}:${candidate.href}`)) return;
    seen.add(`${source}:${candidate.href}`);
    candidates.push({ ...candidate, source });
  };
  for (const match of String(body || '').matchAll(urlPattern)) {
    add(match[0].replace(/[),.;!?]+$/gu, ''), 'message');
  }
  if (pageUrl) add(pageUrl, 'page');
  return candidates.slice(0, 10);
}

export async function resolveSupportProductReferences({ body = '', pageUrl = '' } = {}) {
  const detectedCandidates = messageCandidates(body, pageUrl);
  if (!detectedCandidates.length) return [];
  const connectionResult = await query(
    `SELECT id, store_domain
     FROM search_horoshop_connections
     WHERE singleton = TRUE AND status IN ('connected', 'syncing', 'error')
     LIMIT 1`
  );
  const connection = connectionResult.rows[0];
  if (!connection) return [];
  const storeHost = hostname(connection.store_domain);
  const candidates = detectedCandidates.filter((candidate) => candidate.host === storeHost);
  if (!candidates.length) return [];
  const variants = [...new Set(candidates.flatMap((candidate) => candidateVariants(candidate, connection.store_domain)))];
  const placeholders = variants.map((_, index) => `$${index + 2}`).join(', ');
  const matches = await query(
    `SELECT product.id AS product_id, product.canonical_url AS product_url,
            modification.id AS modification_id, modification.page_url AS modification_url
     FROM search_horoshop_products AS product
     LEFT JOIN search_horoshop_modifications AS modification
       ON modification.product_id = product.id AND modification.active = TRUE
     WHERE product.connection_id = $1 AND product.active = TRUE
       AND (product.canonical_url IN (${placeholders}) OR modification.page_url IN (${placeholders}))`,
    [connection.id, ...variants]
  );
  const references = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const productMatch = matches.rows.find((row) => normalizeCandidate(row.product_url)?.key === candidate.key);
    const modificationMatch = matches.rows.find((row) => {
      const modificationKey = normalizeCandidate(row.modification_url)?.key;
      const productKey = normalizeCandidate(row.product_url)?.key;
      return modificationKey === candidate.key && modificationKey !== productKey;
    });
    const match = modificationMatch || productMatch;
    if (!match) continue;
    const modificationId = modificationMatch?.modification_id || null;
    const key = modificationId || match.product_id;
    if (seen.has(key)) continue;
    seen.add(key);
    references.push({
      productId: match.product_id,
      modificationId,
      url: candidate.href,
      source: candidate.source
    });
  }
  return references.slice(0, 5);
}

export function filterRepeatedPageReferences(references, existingMessages) {
  const seenProducts = new Set((existingMessages || []).flatMap((message) => (
    jsonArray(message.product_references).map((reference) => reference.modificationId || reference.productId)
  )));
  return references.filter((reference) => (
    reference.source !== 'page' || !seenProducts.has(reference.modificationId || reference.productId)
  ));
}

export async function hydrateSupportProductCards(rows) {
  const messages = Array.isArray(rows) ? rows : [];
  const references = messages.flatMap((row) => jsonArray(row.product_references));
  const productIds = [...new Set(references.map((reference) => reference.productId).filter(Boolean))];
  if (!productIds.length) return messages.map((row) => ({ ...row, product_cards: [] }));
  const productPlaceholders = productIds.map((_, index) => `$${index + 1}`).join(', ');
  const productsResult = await query(
    `SELECT id, sku, titles, brand, price, old_price, currency, availability,
            visible, active, primary_image_url, canonical_url
     FROM search_horoshop_products
     WHERE id IN (${productPlaceholders})`,
    productIds
  );
  const modificationIds = [...new Set(references.map((reference) => reference.modificationId).filter(Boolean))];
  let modificationRows = [];
  if (modificationIds.length) {
    const modificationPlaceholders = modificationIds.map((_, index) => `$${index + 1}`).join(', ');
    modificationRows = (await query(
      `SELECT id, product_id, sku, titles, price, old_price, currency, availability,
              visible, active, image_url, page_url
       FROM search_horoshop_modifications
       WHERE id IN (${modificationPlaceholders})`,
      modificationIds
    )).rows;
  }
  const products = new Map(productsResult.rows.map((row) => [row.id, row]));
  const modifications = new Map(modificationRows.map((row) => [row.id, row]));
  return messages.map((row) => ({
    ...row,
    product_cards: jsonArray(row.product_references).flatMap((reference) => {
      const product = products.get(reference.productId);
      if (!product) return [];
      const modification = reference.modificationId ? modifications.get(reference.modificationId) : null;
      if (reference.modificationId && !modification) return [];
      const item = modification || product;
      return [{
        id: modification?.id || product.id,
        productId: product.id,
        modificationId: modification?.id || null,
        title: localizedTitle(item.titles, localizedTitle(product.titles, product.sku)),
        sku: item.sku || product.sku,
        brand: product.brand || '',
        price: item.price || product.price || '',
        oldPrice: item.old_price || product.old_price || '',
        currency: item.currency || product.currency || '',
        availability: item.availability || product.availability || '',
        visible: item.visible === true,
        active: product.active === true && (!modification || modification.active === true),
        imageUrl: item.image_url || product.primary_image_url || '',
        url: item.page_url || product.canonical_url || reference.url,
        source: reference.source === 'page' ? 'page' : 'message'
      }];
    })
  }));
}
