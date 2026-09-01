import { query } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import { titleLabelsEmbedScript } from './title-labels.embed.js';

export const horoshopTitleLabelsToolId = 'horoshop_title_labels';

function jsonArray(value) {
  if (Array.isArray(value)) return value;
  try { return JSON.parse(value || '[]'); } catch { return []; }
}

function normalizeTitle(value) {
  return String(value || '').normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('uk-UA');
}

function stickerDescriptor(sticker) {
  if (typeof sticker === 'string') {
    const title = sticker.trim();
    return title ? { key: `title:${normalizeTitle(title)}`, id: '', title } : null;
  }
  const id = String(sticker?.id ?? '').trim();
  const title = String(sticker?.title ?? sticker?.name ?? '').trim();
  if (!id && !title) return null;
  return { key: id ? `id:${id}` : `title:${normalizeTitle(title)}`, id, title: title || id };
}

function normalizePath(value, storeDomain) {
  try {
    const url = new URL(value, `https://${storeDomain}`);
    const host = url.hostname.toLowerCase().replace(/^www\./u, '');
    const expected = String(storeDomain || '').toLowerCase().replace(/^https?:\/\//u, '').replace(/^www\./u, '').split('/')[0];
    if (host !== expected) return '';
    return (url.pathname.replace(/\/{2,}/gu, '/').replace(/\/+$/u, '') || '/').toLowerCase();
  } catch { return ''; }
}

function normalizeFontSize(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(8, Math.min(32, Math.round(numeric)));
}

function normalizeRule(rule) {
  return {
    id: String(rule.id),
    name: String(rule.name).trim(),
    text: String(rule.text).trim(),
    stickerKeys: [...new Set(rule.stickerKeys.map((key) => String(key).trim()))],
    backgroundColor: String(rule.backgroundColor).toLowerCase(),
    textColor: String(rule.textColor).toLowerCase(),
    borderColor: String(rule.borderColor).toLowerCase(),
    borderRadius: Number(rule.borderRadius),
    productPageFontSize: normalizeFontSize(rule.productPageFontSize, 18),
    productCardFontSize: normalizeFontSize(rule.productCardFontSize, 12),
    cartFontSize: normalizeFontSize(rule.cartFontSize, 13),
    enabled: rule.enabled !== false
  };
}

async function ensureSettings() {
  await query(`INSERT INTO horoshop_title_label_settings (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING`);
}

async function loadSettingsRow() {
  await ensureSettings();
  const result = await query(
    `SELECT settings.*, connection.id AS connection_id, connection.generation,
            connection.store_domain, connection.last_sync_at
     FROM horoshop_title_label_settings AS settings
     LEFT JOIN search_horoshop_connections AS connection ON connection.singleton = TRUE
     WHERE settings.id = TRUE
     LIMIT 1`
  );
  return result.rows[0];
}

async function loadCatalogRows(connectionId, generation) {
  if (!connectionId || !generation) return [];
  const result = await query(
    `SELECT product.canonical_url, product.stickers AS product_stickers,
            modification.page_url, modification.stickers AS modification_stickers
     FROM search_horoshop_products AS product
     LEFT JOIN search_horoshop_modifications AS modification
       ON modification.product_id = product.id
      AND modification.connection_id = product.connection_id
      AND modification.generation = $2
      AND modification.active = TRUE
      AND modification.visible = TRUE
     WHERE product.connection_id = $1
       AND product.generation = $2
       AND product.active = TRUE
       AND product.visible = TRUE`,
    [connectionId, generation]
  );
  return result.rows;
}

function catalogIndex(rows, storeDomain) {
  const stickers = new Map();
  const pathKeys = new Map();
  const addPath = (path, descriptors) => {
    if (!path) return;
    if (!pathKeys.has(path)) pathKeys.set(path, new Set());
    descriptors.forEach((descriptor) => {
      pathKeys.get(path).add(descriptor.key);
      const current = stickers.get(descriptor.key) || { ...descriptor, paths: new Set() };
      current.paths.add(path);
      stickers.set(descriptor.key, current);
    });
  };
  rows.forEach((row) => {
    const productDescriptors = jsonArray(row.product_stickers).map(stickerDescriptor).filter(Boolean);
    const modificationDescriptors = jsonArray(row.modification_stickers).map(stickerDescriptor).filter(Boolean);
    const canonicalPath = normalizePath(row.canonical_url, storeDomain);
    const modificationPath = normalizePath(row.page_url || row.canonical_url, storeDomain);
    addPath(canonicalPath, productDescriptors);
    addPath(modificationPath, [...productDescriptors, ...modificationDescriptors]);
  });
  return { stickers, pathKeys };
}

function stickerOptions(index) {
  return [...index.stickers.values()]
    .map((sticker) => ({ key: sticker.key, id: sticker.id, title: sticker.title, productCount: sticker.paths.size }))
    .sort((a, b) => a.title.localeCompare(b.title, 'uk-UA'));
}

function assignmentsForRules(index, rules) {
  const groups = new Map(rules.filter((rule) => rule.enabled).map((rule) => [rule.id, []]));
  index.pathKeys.forEach((keys, path) => {
    rules.forEach((rule) => {
      if (rule.enabled && rule.stickerKeys.some((key) => keys.has(key))) groups.get(rule.id).push(path);
    });
  });
  return [...groups.entries()]
    .filter(([, paths]) => paths.length > 0)
    .map(([labelId, paths]) => ({ labelId, paths: paths.sort() }));
}

function embedCode(origin, publicId) {
  return `<script async src="${origin}/api/public/horoshop-title-labels/embed.js?site=${encodeURIComponent(publicId)}"></script>`;
}

function serializeSettings(row, options, origin = '') {
  return {
    publicId: row.public_id,
    enabled: row.enabled === true,
    draftRules: jsonArray(row.draft_rules).map(normalizeRule),
    publishedRules: jsonArray(row.published_rules).map(normalizeRule),
    publishedVersion: Number(row.published_version || 0),
    storeDomain: row.store_domain || '',
    lastCatalogSyncAt: row.last_sync_at || null,
    updatedAt: row.updated_at,
    publishedAt: row.published_at || null,
    embedCode: origin ? embedCode(origin, row.public_id) : '',
    stickerOptions: options
  };
}

export async function getTitleLabelSettings(origin = '') {
  const row = await loadSettingsRow();
  const rows = await loadCatalogRows(row.connection_id, row.generation);
  return serializeSettings(row, stickerOptions(catalogIndex(rows, row.store_domain)), origin);
}

export async function updateTitleLabelDraft(rules, userId, origin = '') {
  const normalized = rules.map(normalizeRule);
  await ensureSettings();
  await query(
    `UPDATE horoshop_title_label_settings
     SET draft_rules = $1::JSONB, updated_by = $2, updated_at = NOW()
     WHERE id = TRUE`,
    [JSON.stringify(normalized), userId]
  );
  return getTitleLabelSettings(origin);
}

export async function publishTitleLabels(rules, userId, origin = '') {
  const normalized = rules.map(normalizeRule);
  if (!normalized.some((rule) => rule.enabled && rule.stickerKeys.length > 0)) {
    throw new AppError(422, 'TITLE_LABEL_RULE_REQUIRED', 'Додайте хоча б один активний лейбл і привʼяжіть до нього стікер.');
  }
  await ensureSettings();
  await query(
    `UPDATE horoshop_title_label_settings
     SET draft_rules = $1::JSONB,
         published_rules = $1::JSONB,
         published_version = published_version + 1,
         enabled = TRUE,
         updated_by = $2,
         published_by = $2,
         updated_at = NOW(),
         published_at = NOW()
     WHERE id = TRUE`,
    [JSON.stringify(normalized), userId]
  );
  return getTitleLabelSettings(origin);
}

export async function setTitleLabelsEnabled(enabled, userId, origin = '') {
  await ensureSettings();
  const result = await query(
    `UPDATE horoshop_title_label_settings
     SET enabled = $1, updated_by = $2, updated_at = NOW()
     WHERE id = TRUE AND ($1 = FALSE OR published_version > 0)
     RETURNING id`,
    [enabled, userId]
  );
  if (!result.rows[0]) {
    throw new AppError(409, 'TITLE_LABELS_NOT_PUBLISHED', 'Спочатку опублікуйте правила лейблів.');
  }
  return getTitleLabelSettings(origin);
}

export async function loadPublishedTitleLabels(publicId) {
  const result = await query(
    `SELECT settings.published_rules, settings.published_version,
            connection.id AS connection_id, connection.generation, connection.store_domain
     FROM horoshop_title_label_settings AS settings
     LEFT JOIN search_horoshop_connections AS connection ON connection.singleton = TRUE
     WHERE settings.public_id = $1
       AND settings.enabled = TRUE
       AND settings.published_version > 0
     LIMIT 1`,
    [publicId]
  );
  const row = result.rows[0];
  if (!row?.connection_id || !row.store_domain) return null;
  const rules = jsonArray(row.published_rules).map(normalizeRule).filter((rule) => rule.enabled);
  const rows = await loadCatalogRows(row.connection_id, row.generation);
  const index = catalogIndex(rows, row.store_domain);
  return {
    version: Number(row.published_version || 0),
    storeDomain: row.store_domain,
    labels: rules.map((rule) => ({
      id: rule.id,
      name: rule.name,
      text: rule.text,
      backgroundColor: rule.backgroundColor,
      textColor: rule.textColor,
      borderColor: rule.borderColor,
      borderRadius: rule.borderRadius,
      productPageFontSize: rule.productPageFontSize,
      productCardFontSize: rule.productCardFontSize,
      cartFontSize: rule.cartFontSize
    })),
    assignments: assignmentsForRules(index, rules)
  };
}

export { titleLabelsEmbedScript };
