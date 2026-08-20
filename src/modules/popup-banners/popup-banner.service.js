import { createHash, randomUUID } from 'node:crypto';
import { pool, query } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';

export const popupBannerToolId = 'popup_banners';

const defaultContent = {
  eyebrow: 'Важлива інформація',
  title: 'Зверніть увагу',
  body: 'Перед оформленням замовлення ознайомтеся з важливою інформацією про товар.',
  primaryLabel: 'Зрозуміло',
  primaryUrl: '',
  secondaryLabel: 'Закрити',
  imageUrl: '',
  acknowledgementLabel: 'Я прочитав(-ла) і розумію цю інформацію.'
};

const defaultStyles = {
  layout: 'modal',
  accentColor: '#6d5dfc',
  backgroundColor: '#ffffff',
  textColor: '#172033',
  mutedColor: '#667085',
  borderRadius: 24,
  maxWidth: 520
};

const defaultTargeting = {
  mode: 'products',
  match: 'all',
  stickers: [],
  brands: [],
  categoryIds: [],
  conditions: [],
  urlContains: []
};

const defaultBehavior = {
  delayMs: 300,
  frequency: 'product',
  cooldownDays: 7,
  dismissible: true,
  requireAcknowledgement: false
};

const eventStatsKey = {
  impression: 'impressions',
  dismiss: 'dismissals',
  click: 'clicks',
  acknowledge: 'acknowledgements'
};

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function localizedTitle(value) {
  const source = object(value);
  return String(source.uk || source.ua || source.ru || source.en || '').trim();
}

function stickerList(value) {
  return array(value).flatMap((item) => {
    if (typeof item === 'string' && item.trim()) return [{ id: '', title: item.trim() }];
    const source = object(item);
    const title = String(source.title || source.name || source.label || '').trim();
    return title ? [{ id: String(source.id || ''), title }] : [];
  });
}

function stringList(value, maximum = 100) {
  return [...new Set(array(value)
    .map((item) => String(item || '').trim())
    .filter(Boolean))].slice(0, maximum);
}

function normalizeContent(value) {
  const source = object(value);
  return {
    eyebrow: String(source.eyebrow ?? defaultContent.eyebrow).trim().slice(0, 120),
    title: String(source.title ?? defaultContent.title).trim().slice(0, 240),
    body: String(source.body ?? defaultContent.body).trim().slice(0, 3000),
    primaryLabel: String(source.primaryLabel ?? defaultContent.primaryLabel).trim().slice(0, 120),
    primaryUrl: String(source.primaryUrl ?? '').trim().slice(0, 2000),
    secondaryLabel: String(source.secondaryLabel ?? defaultContent.secondaryLabel).trim().slice(0, 120),
    imageUrl: String(source.imageUrl ?? '').trim().slice(0, 2000),
    acknowledgementLabel: String(source.acknowledgementLabel ?? defaultContent.acknowledgementLabel).trim().slice(0, 300)
  };
}

function normalizeStyles(value) {
  const source = object(value);
  const color = (candidate, fallback) => /^#[0-9a-f]{6}$/iu.test(String(candidate || ''))
    ? String(candidate).toLowerCase() : fallback;
  return {
    layout: ['modal', 'bottom-sheet', 'corner'].includes(source.layout) ? source.layout : defaultStyles.layout,
    accentColor: color(source.accentColor, defaultStyles.accentColor),
    backgroundColor: color(source.backgroundColor, defaultStyles.backgroundColor),
    textColor: color(source.textColor, defaultStyles.textColor),
    mutedColor: color(source.mutedColor, defaultStyles.mutedColor),
    borderRadius: Math.min(40, Math.max(0, Number(source.borderRadius) || defaultStyles.borderRadius)),
    maxWidth: Math.min(760, Math.max(320, Number(source.maxWidth) || defaultStyles.maxWidth))
  };
}

function normalizeTargeting(value) {
  const source = object(value);
  return {
    mode: ['all_pages', 'all_products', 'products', 'rules'].includes(source.mode) ? source.mode : defaultTargeting.mode,
    match: source.match === 'any' ? 'any' : 'all',
    stickers: stringList(source.stickers),
    brands: stringList(source.brands),
    categoryIds: stringList(source.categoryIds),
    conditions: stringList(source.conditions),
    urlContains: stringList(source.urlContains, 30).map((item) => item.toLocaleLowerCase('uk-UA'))
  };
}

function normalizeBehavior(value) {
  const source = object(value);
  return {
    delayMs: Math.min(60_000, Math.max(0, Number(source.delayMs) || 0)),
    frequency: ['always', 'session', 'product', 'days'].includes(source.frequency)
      ? source.frequency : defaultBehavior.frequency,
    cooldownDays: Math.min(365, Math.max(1, Number(source.cooldownDays) || defaultBehavior.cooldownDays)),
    dismissible: source.dismissible !== false,
    requireAcknowledgement: source.requireAcknowledgement === true
  };
}

function campaignSnapshot(row, targets = []) {
  return {
    name: row.name,
    status: row.status,
    priority: Number(row.priority),
    content: normalizeContent(row.content),
    styles: normalizeStyles(row.styles),
    targeting: normalizeTargeting(row.targeting),
    behavior: normalizeBehavior(row.behavior),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    targets
  };
}

function serializeTarget(row) {
  return {
    id: row.id,
    productId: row.product_id,
    modificationId: row.modification_id || null,
    sku: row.modification_sku || row.product_sku || '',
    title: localizedTitle(row.modification_titles) || localizedTitle(row.product_titles),
    inputValue: row.input_value,
    matchedBy: row.matched_by
  };
}

function serializeCampaign(row, targets = []) {
  return {
    id: row.id,
    publicId: row.public_id,
    name: row.name,
    status: row.status,
    priority: Number(row.priority),
    content: normalizeContent(row.content),
    styles: normalizeStyles(row.styles),
    targeting: normalizeTargeting(row.targeting),
    behavior: normalizeBehavior(row.behavior),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    publishedAt: row.published_at,
    productTargets: targets.map(serializeTarget),
    stats: {
      impressions: Number(row.impressions || 0),
      dismissals: Number(row.dismissals || 0),
      clicks: Number(row.clicks || 0),
      acknowledgements: Number(row.acknowledgements || 0)
    },
    connection: row.connection_id ? {
      id: row.connection_id,
      generation: row.connection_generation,
      storeDomain: row.store_domain || ''
    } : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function loadTargets(campaignId, db = { query }) {
  const result = await db.query(
    `SELECT target.*, product.sku AS product_sku, product.titles AS product_titles,
            modification.sku AS modification_sku, modification.titles AS modification_titles
     FROM popup_banner_product_targets AS target
     JOIN search_horoshop_products AS product ON product.id = target.product_id
     LEFT JOIN search_horoshop_modifications AS modification ON modification.id = target.modification_id
     WHERE target.campaign_id = $1
     ORDER BY COALESCE(modification.titles, product.titles)::TEXT, target.id`,
    [campaignId]
  );
  return result.rows;
}

async function loadCampaignRow(id, db = { query }) {
  const result = await db.query(
    `SELECT campaign.*, connection.store_domain
     FROM popup_banner_campaigns AS campaign
     LEFT JOIN search_horoshop_connections AS connection ON connection.id = campaign.connection_id
     WHERE campaign.id = $1`,
    [id]
  );
  if (!result.rows[0]) throw new AppError(404, 'POPUP_CAMPAIGN_NOT_FOUND', 'Попап-кампанію не знайдено.');
  const stats = await db.query(
    `SELECT event_type, COUNT(*) AS count
     FROM popup_banner_events WHERE campaign_id = $1 GROUP BY event_type`,
    [id]
  );
  const row = result.rows[0];
  for (const item of stats.rows) row[eventStatsKey[item.event_type]] = Number(item.count);
  return row;
}

export async function listPopupCampaigns() {
  const result = await query(
    `SELECT campaign.*, connection.store_domain
     FROM popup_banner_campaigns AS campaign
     LEFT JOIN search_horoshop_connections AS connection ON connection.id = campaign.connection_id
     ORDER BY campaign.priority DESC, campaign.updated_at DESC`
  );
  const statsResult = await query(
    `SELECT campaign_id, event_type, COUNT(*) AS count
     FROM popup_banner_events GROUP BY campaign_id, event_type`
  );
  const stats = new Map();
  for (const item of statsResult.rows) {
    const current = stats.get(item.campaign_id) || {};
    current[eventStatsKey[item.event_type]] = Number(item.count);
    stats.set(item.campaign_id, current);
  }
  const targetRows = await query(
    `SELECT target.*, product.sku AS product_sku, product.titles AS product_titles,
            modification.sku AS modification_sku, modification.titles AS modification_titles
     FROM popup_banner_product_targets AS target
     JOIN search_horoshop_products AS product ON product.id = target.product_id
     LEFT JOIN search_horoshop_modifications AS modification ON modification.id = target.modification_id
     ORDER BY target.created_at, target.id`
  );
  const grouped = new Map();
  for (const target of targetRows.rows) {
    const items = grouped.get(target.campaign_id) || [];
    items.push(target);
    grouped.set(target.campaign_id, items);
  }
  return result.rows.map((row) => serializeCampaign(
    { ...row, ...(stats.get(row.id) || {}) },
    grouped.get(row.id) || []
  ));
}

export async function getPopupCampaign(id) {
  const row = await loadCampaignRow(id);
  return serializeCampaign(row, await loadTargets(id));
}

export async function popupCampaignOptions() {
  const connectionResult = await query(
    `SELECT id, generation, store_domain, status, last_sync_at
     FROM search_horoshop_connections WHERE singleton = TRUE LIMIT 1`
  );
  const connection = connectionResult.rows[0] || null;
  if (!connection) return { integration: null, stickers: [], brands: [], categories: [], conditions: [] };
  const [products, modifications, categories] = await Promise.all([
    query(`SELECT brand, stickers, condition_label FROM search_horoshop_products WHERE connection_id = $1 AND active`, [connection.id]),
    query(`SELECT stickers, condition_label FROM search_horoshop_modifications WHERE connection_id = $1 AND active`, [connection.id]),
    query(`SELECT external_id, titles FROM search_horoshop_categories WHERE connection_id = $1 AND active ORDER BY titles::TEXT`, [connection.id])
  ]);
  const stickers = new Map();
  const brands = new Set();
  const conditions = new Set();
  for (const item of [...products.rows, ...modifications.rows]) {
    for (const sticker of stickerList(item.stickers)) {
      const key = sticker.id || sticker.title.toLocaleLowerCase('uk-UA');
      if (!stickers.has(key)) stickers.set(key, sticker);
    }
    if (item.brand) brands.add(String(item.brand));
    if (item.condition_label) conditions.add(String(item.condition_label));
  }
  return {
    integration: {
      id: connection.id,
      generation: connection.generation,
      storeDomain: connection.store_domain,
      status: connection.status,
      lastSyncAt: connection.last_sync_at
    },
    stickers: [...stickers.values()].sort((left, right) => left.title.localeCompare(right.title, 'uk-UA')),
    brands: [...brands].sort((left, right) => left.localeCompare(right, 'uk-UA')),
    conditions: [...conditions].sort((left, right) => left.localeCompare(right, 'uk-UA')),
    categories: categories.rows.map((item) => ({ id: item.external_id, title: localizedTitle(item.titles) }))
  };
}

async function resolveProductEntries(entries, connectionId, db) {
  const resolved = new Map();
  const unmatched = [];
  for (const rawEntry of entries) {
    const entry = String(rawEntry || '').trim();
    if (!entry) continue;
    const matches = await db.query(
      `SELECT product.id AS product_id, modification.id AS modification_id,
              product.sku AS product_sku, product.titles AS product_titles,
              modification.sku AS modification_sku, modification.titles AS modification_titles,
              CASE
                WHEN LOWER(COALESCE(modification.sku, '')) = LOWER($2) THEN 'modification_sku'
                WHEN LOWER(product.sku) = LOWER($2) THEN 'product_sku'
                WHEN LOWER(COALESCE(modification.titles->>'uk', modification.titles->>'ua', modification.titles->>'ru', '')) = LOWER($2) THEN 'modification_title'
                ELSE 'product_title'
              END AS matched_by
       FROM search_horoshop_products AS product
       LEFT JOIN search_horoshop_modifications AS modification
         ON modification.product_id = product.id AND modification.active = TRUE
       WHERE product.connection_id = $1 AND product.active = TRUE
         AND (
           LOWER(product.sku) = LOWER($2)
           OR LOWER(COALESCE(product.titles->>'uk', product.titles->>'ua', product.titles->>'ru', '')) = LOWER($2)
           OR LOWER(COALESCE(modification.sku, '')) = LOWER($2)
           OR LOWER(COALESCE(modification.titles->>'uk', modification.titles->>'ua', modification.titles->>'ru', '')) = LOWER($2)
         )
       ORDER BY CASE
         WHEN LOWER(COALESCE(modification.sku, '')) = LOWER($2) THEN 1
         WHEN LOWER(product.sku) = LOWER($2) THEN 2
         WHEN LOWER(COALESCE(modification.titles->>'uk', modification.titles->>'ua', modification.titles->>'ru', '')) = LOWER($2) THEN 3
         ELSE 4
       END
       LIMIT 100`,
      [connectionId, entry]
    );
    if (!matches.rows.length) {
      unmatched.push(entry);
      continue;
    }
    const bestRank = matches.rows[0].matched_by;
    for (const match of matches.rows.filter((item) => item.matched_by === bestRank)) {
      const modificationId = match.matched_by.startsWith('modification_') ? match.modification_id : null;
      const targetKey = modificationId ? `modification:${modificationId}` : `product:${match.product_id}`;
      resolved.set(targetKey, {
        productId: match.product_id,
        modificationId,
        targetKey,
        inputValue: entry,
        matchedBy: match.matched_by
      });
    }
  }
  return { targets: [...resolved.values()], unmatched };
}

async function recordVersion(client, campaignId, actorUserId) {
  const row = await loadCampaignRow(campaignId, client);
  const targets = await loadTargets(campaignId, client);
  await client.query(
    `INSERT INTO popup_banner_versions (campaign_id, version_number, snapshot, created_by)
     SELECT $1, COALESCE(MAX(version_number), 0) + 1, $2::JSONB, $3
     FROM popup_banner_versions WHERE campaign_id = $1`,
    [campaignId, JSON.stringify(campaignSnapshot(row, targets.map(serializeTarget))), actorUserId]
  );
}

async function savePopupCampaign(existingId, input, actorUserId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const connectionResult = await client.query(
      `SELECT id, generation FROM search_horoshop_connections WHERE singleton = TRUE LIMIT 1 FOR UPDATE`
    );
    const connection = connectionResult.rows[0] || null;
    if (!connection) throw new AppError(409, 'HOROSHOP_NOT_CONNECTED', 'Підключіть магазин Хорошоп перед створенням попап-кампанії.');
    const content = normalizeContent(input.content);
    const styles = normalizeStyles(input.styles);
    const targeting = normalizeTargeting(input.targeting);
    const behavior = normalizeBehavior(input.behavior);
    const startsAt = input.startsAt || null;
    const endsAt = input.endsAt || null;
    let id = existingId;
    if (id) {
      const updated = await client.query(
        `UPDATE popup_banner_campaigns
         SET connection_id = $2, connection_generation = $3, name = $4, priority = $5,
             content = $6::JSONB, styles = $7::JSONB, targeting = $8::JSONB,
             behavior = $9::JSONB, starts_at = $10, ends_at = $11,
             updated_by = $12, updated_at = NOW()
         WHERE id = $1 RETURNING id`,
        [id, connection.id, connection.generation, input.name, input.priority,
          JSON.stringify(content), JSON.stringify(styles), JSON.stringify(targeting),
          JSON.stringify(behavior), startsAt, endsAt, actorUserId]
      );
      if (!updated.rows[0]) throw new AppError(404, 'POPUP_CAMPAIGN_NOT_FOUND', 'Попап-кампанію не знайдено.');
    } else {
      id = randomUUID();
      await client.query(
        `INSERT INTO popup_banner_campaigns (
           id, connection_id, connection_generation, name, priority, content, styles,
           targeting, behavior, starts_at, ends_at, created_by, updated_by
         ) VALUES ($1, $2, $3, $4, $5, $6::JSONB, $7::JSONB, $8::JSONB, $9::JSONB, $10, $11, $12, $12)`,
        [id, connection.id, connection.generation, input.name, input.priority,
          JSON.stringify(content), JSON.stringify(styles), JSON.stringify(targeting),
          JSON.stringify(behavior), startsAt, endsAt, actorUserId]
      );
    }

    await client.query('DELETE FROM popup_banner_product_targets WHERE campaign_id = $1', [id]);
    const resolution = await resolveProductEntries(input.productEntries || [], connection.id, client);
    for (const target of resolution.targets) {
      await client.query(
        `INSERT INTO popup_banner_product_targets (
           campaign_id, product_id, modification_id, target_key, input_value, matched_by
         ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, target.productId, target.modificationId, target.targetKey, target.inputValue, target.matchedBy]
      );
    }
    if (targeting.mode === 'products' && resolution.targets.length === 0) {
      throw new AppError(422, 'POPUP_TARGETS_EMPTY', 'Для номенклатурної кампанії потрібно знайти хоча б один товар або модифікацію.', {
        unmatched: resolution.unmatched
      });
    }
    if (targeting.mode === 'rules') {
      const hasRule = targeting.stickers.length || targeting.brands.length || targeting.categoryIds.length
        || targeting.conditions.length || targeting.urlContains.length;
      if (!hasRule) throw new AppError(422, 'POPUP_RULES_EMPTY', 'Додайте хоча б одну умову показу.');
    }
    await recordVersion(client, id, actorUserId);
    await client.query('COMMIT');
    const campaign = await getPopupCampaign(id);
    return { ...campaign, resolution: { unmatched: resolution.unmatched } };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export function createPopupCampaign(input, actorUserId) {
  return savePopupCampaign('', input, actorUserId);
}

export function updatePopupCampaign(id, input, actorUserId) {
  return savePopupCampaign(id, input, actorUserId);
}

export async function setPopupCampaignStatus(id, status, actorUserId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const campaign = await client.query(
      'SELECT * FROM popup_banner_campaigns WHERE id = $1 FOR UPDATE',
      [id]
    );
    const connection = await client.query(
      'SELECT id, generation FROM search_horoshop_connections WHERE singleton = TRUE LIMIT 1'
    );
    const current = campaign.rows[0] ? {
      ...campaign.rows[0],
      current_connection_id: connection.rows[0]?.id || null,
      current_generation: connection.rows[0]?.generation || null
    } : null;
    if (!current) throw new AppError(404, 'POPUP_CAMPAIGN_NOT_FOUND', 'Попап-кампанію не знайдено.');
    if (status === 'active') {
      if (!current.current_connection_id || current.connection_id !== current.current_connection_id
        || current.connection_generation !== current.current_generation) {
        throw new AppError(409, 'POPUP_CATALOG_STALE', 'Кампанія належить до попереднього підключення Хорошоп. Збережіть її повторно для поточного каталогу.');
      }
      const targeting = normalizeTargeting(current.targeting);
      if (targeting.mode === 'products') {
        const targets = await client.query('SELECT 1 FROM popup_banner_product_targets WHERE campaign_id = $1 LIMIT 1', [id]);
        if (!targets.rows[0]) throw new AppError(422, 'POPUP_TARGETS_EMPTY', 'Додайте хоча б один товар до кампанії.');
      }
    }
    await client.query(
      `UPDATE popup_banner_campaigns
       SET status = $2, published_at = CASE WHEN $2 = 'active' THEN COALESCE(published_at, NOW()) ELSE published_at END,
           updated_by = $3, updated_at = NOW()
       WHERE id = $1`,
      [id, status, actorUserId]
    );
    await recordVersion(client, id, actorUserId);
    await client.query('COMMIT');
    return getPopupCampaign(id);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function deletePopupCampaign(id) {
  const result = await query('DELETE FROM popup_banner_campaigns WHERE id = $1 RETURNING id', [id]);
  if (!result.rows[0]) throw new AppError(404, 'POPUP_CAMPAIGN_NOT_FOUND', 'Попап-кампанію не знайдено.');
}

function normalizedPageUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}

function sameStoreHost(left, right) {
  const normalize = (value) => String(value || '').toLowerCase().replace(/^www\./u, '');
  return normalize(left) === normalize(right);
}

function templateText(value, product) {
  const replacements = {
    '{{product.title}}': product?.title || '',
    '{{product.article}}': product?.sku || '',
    '{{product.price}}': product?.price || '',
    '{{product.condition}}': product?.condition || '',
    '{{product.stickers}}': (product?.stickers || []).map((item) => item.title).join(', ')
  };
  return Object.entries(replacements).reduce((text, [token, replacement]) => text.replaceAll(token, replacement), String(value || ''));
}

function matchesTargeting(campaign, product, pageUrl, targets) {
  const targeting = normalizeTargeting(campaign.targeting);
  if (targeting.mode === 'all_pages') return true;
  if (!product) return false;
  if (targeting.mode === 'all_products') return true;
  if (targeting.mode === 'products') {
    return targets.some((target) => target.product_id === product.id
      && (!target.modification_id || target.modification_id === product.modificationId));
  }
  const productStickers = new Set(product.stickers.map((item) => `${item.id}:${item.title.toLocaleLowerCase('uk-UA')}`));
  const productStickerTitles = new Set(product.stickers.map((item) => item.title.toLocaleLowerCase('uk-UA')));
  const checks = [];
  if (targeting.stickers.length) checks.push(targeting.stickers.some((value) => {
    const normalized = value.toLocaleLowerCase('uk-UA');
    return productStickers.has(normalized) || productStickerTitles.has(normalized) || [...productStickers].some((item) => item.startsWith(`${value}:`));
  }));
  if (targeting.brands.length) checks.push(targeting.brands.some((value) => value.toLocaleLowerCase('uk-UA') === product.brand.toLocaleLowerCase('uk-UA')));
  if (targeting.categoryIds.length) checks.push(targeting.categoryIds.includes(product.categoryId));
  if (targeting.conditions.length) checks.push(targeting.conditions.some((value) => value.toLocaleLowerCase('uk-UA') === product.condition.toLocaleLowerCase('uk-UA')));
  if (targeting.urlContains.length) checks.push(targeting.urlContains.some((value) => pageUrl.href.toLocaleLowerCase('uk-UA').includes(value)));
  return checks.length > 0 && (targeting.match === 'any' ? checks.some(Boolean) : checks.every(Boolean));
}

async function resolveProduct(connection, article, pageUrl) {
  const normalizedArticle = String(article || '').trim();
  const pathUrl = `${pageUrl.origin}${pageUrl.pathname}`.replace(/\/+$/u, '');
  const result = await query(
    `SELECT product.*, modification.id AS modification_id, modification.sku AS modification_sku,
            modification.titles AS modification_titles, modification.price AS modification_price,
            modification.currency AS modification_currency, modification.stickers AS modification_stickers,
            modification.condition_label AS modification_condition
     FROM search_horoshop_products AS product
     LEFT JOIN search_horoshop_modifications AS modification
       ON modification.product_id = product.id AND modification.active = TRUE
       AND $2 <> '' AND LOWER(modification.sku) = LOWER($2)
     WHERE product.connection_id = $1 AND product.generation = $3 AND product.active = TRUE
       AND (
         ($2 <> '' AND (LOWER(product.sku) = LOWER($2) OR modification.id IS NOT NULL))
         OR COALESCE(product.canonical_url, '') IN ($4, $4 || '/')
       )
     ORDER BY CASE WHEN modification.id IS NOT NULL THEN 1 WHEN LOWER(product.sku) = LOWER($2) THEN 2 ELSE 3 END
     LIMIT 1`,
    [connection.id, normalizedArticle, connection.generation, pathUrl]
  );
  const row = result.rows[0];
  if (!row) return null;
  const productStickers = stickerList(row.stickers);
  const modificationStickers = stickerList(row.modification_stickers);
  const stickers = new Map();
  for (const sticker of [...productStickers, ...modificationStickers]) {
    const key = `${sticker.id}:${sticker.title.toLocaleLowerCase('uk-UA')}`;
    if (!stickers.has(key)) stickers.set(key, sticker);
  }
  const price = row.modification_price || row.price || '';
  const currency = row.modification_currency || row.currency || '';
  return {
    id: row.id,
    modificationId: row.modification_id || null,
    sku: row.modification_sku || row.sku,
    title: localizedTitle(row.modification_titles) || localizedTitle(row.titles),
    brand: String(row.brand || ''),
    categoryId: String(row.category_external_id || ''),
    price: [price, currency].filter(Boolean).join(' '),
    condition: String(row.modification_condition || row.condition_label || ''),
    stickers: [...stickers.values()]
  };
}

export async function resolvePopupCampaign({ pageUrl: rawPageUrl, article = '', requestOrigin = '' }) {
  const pageUrl = normalizedPageUrl(rawPageUrl);
  if (!pageUrl) throw new AppError(422, 'POPUP_PAGE_URL_INVALID', 'Не вдалося визначити сторінку для попапа.');
  const connectionResult = await query(
    `SELECT id, generation, store_domain FROM search_horoshop_connections
     WHERE singleton = TRUE AND status IN ('connected', 'syncing') LIMIT 1`
  );
  const connection = connectionResult.rows[0];
  if (!connection || !sameStoreHost(pageUrl.hostname, connection.store_domain)) return null;
  const originUrl = normalizedPageUrl(requestOrigin);
  if (originUrl && !sameStoreHost(originUrl.hostname, connection.store_domain)) return null;
  const product = await resolveProduct(connection, article, pageUrl);
  const campaigns = await query(
    `SELECT * FROM popup_banner_campaigns
     WHERE status = 'active' AND connection_id = $1 AND connection_generation = $2
       AND (starts_at IS NULL OR starts_at <= NOW())
       AND (ends_at IS NULL OR ends_at > NOW())
     ORDER BY priority DESC, updated_at DESC`,
    [connection.id, connection.generation]
  );
  for (const campaign of campaigns.rows) {
    const targets = campaign.targeting?.mode === 'products'
      ? (await query('SELECT product_id, modification_id FROM popup_banner_product_targets WHERE campaign_id = $1', [campaign.id])).rows
      : [];
    if (!matchesTargeting(campaign, product, pageUrl, targets)) continue;
    const content = normalizeContent(campaign.content);
    return {
      campaign: {
        publicId: campaign.public_id,
        content: Object.fromEntries(Object.entries(content).map(([key, value]) => [key, templateText(value, product)])),
        styles: normalizeStyles(campaign.styles),
        behavior: normalizeBehavior(campaign.behavior)
      },
      product: product ? { article: product.sku, title: product.title } : null
    };
  }
  return null;
}

export async function recordPopupEvent({ publicId, eventType, pageUrl, article, visitorKey, metadata }) {
  const campaign = await query('SELECT id FROM popup_banner_campaigns WHERE public_id = $1', [publicId]);
  if (!campaign.rows[0]) throw new AppError(404, 'POPUP_CAMPAIGN_NOT_FOUND', 'Попап-кампанію не знайдено.');
  const connectionResult = await query('SELECT id, generation, store_domain FROM search_horoshop_connections WHERE singleton = TRUE LIMIT 1');
  const connection = connectionResult.rows[0];
  const parsedPage = normalizedPageUrl(pageUrl);
  const product = connection && parsedPage ? await resolveProduct(connection, article, parsedPage) : null;
  const visitorKeyHash = visitorKey
    ? createHash('sha256').update(String(visitorKey).slice(0, 200)).digest('hex') : null;
  await query(
    `INSERT INTO popup_banner_events (
       campaign_id, product_id, modification_id, event_type, visitor_key_hash, page_url, metadata
     ) VALUES ($1, $2, $3, $4, $5, $6, $7::JSONB)`,
    [campaign.rows[0].id, product?.id || null, product?.modificationId || null,
      eventType, visitorKeyHash, parsedPage?.href.slice(0, 4000) || null, JSON.stringify(object(metadata))]
  );
}

export function popupEmbedScript(origin) {
  return `(() => {
  if (window.__mtPopupBannersLoaded) return;
  window.__mtPopupBannersLoaded = true;
  const script = document.currentScript;
  const apiOrigin = ${JSON.stringify(origin)};
  const articleSelector = script?.dataset.articleSelector || '';
  let currentHost = null;
  let currentUrl = '';
  let pendingTimer = null;
  const visitorStorageKey = 'mt-popup-visitor';
  let visitorKey = localStorage.getItem(visitorStorageKey);
  if (!visitorKey) {
    visitorKey = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now());
    localStorage.setItem(visitorStorageKey, visitorKey);
  }

  function article() {
    if (articleSelector) {
      const selected = document.querySelector(articleSelector);
      const value = selected?.value || selected?.content || selected?.textContent;
      if (String(value || '').trim()) return String(value).trim();
    }
    const direct = document.querySelector('[itemprop="sku"], meta[property="product:retailer_item_id"], [data-product-article]');
    const directValue = direct?.content || direct?.dataset?.productArticle || direct?.textContent;
    if (String(directValue || '').trim()) return String(directValue).trim();
    for (const node of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const data = JSON.parse(node.textContent || '{}');
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) if (item?.sku) return String(item.sku).trim();
      } catch {}
    }
    return '';
  }

  function event(publicId, eventType, productArticle, metadata = {}) {
    fetch(new URL('/api/public/popup-banners/events', apiOrigin), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ publicId, eventType, pageUrl: location.href, article: productArticle, visitorKey, metadata }),
      keepalive: true
    }).catch(() => {});
  }

  function frequencyKey(payload) {
    const frequency = payload.campaign.behavior.frequency;
    const suffix = frequency === 'product' ? (payload.product?.article || location.pathname) : 'site';
    return 'mt-popup:' + payload.campaign.publicId + ':' + suffix;
  }

  function isSuppressed(payload) {
    const behavior = payload.campaign.behavior;
    if (behavior.frequency === 'always') return false;
    const key = frequencyKey(payload);
    if (behavior.frequency === 'session') return sessionStorage.getItem(key) === '1';
    const stored = Number(localStorage.getItem(key) || 0);
    if (!stored) return false;
    if (behavior.frequency === 'days') return Date.now() - stored < behavior.cooldownDays * 86400000;
    return true;
  }

  function remember(payload) {
    const behavior = payload.campaign.behavior;
    if (behavior.frequency === 'always') return;
    const key = frequencyKey(payload);
    if (behavior.frequency === 'session') sessionStorage.setItem(key, '1');
    else localStorage.setItem(key, String(Date.now()));
  }

  function render(payload, productArticle) {
    if (currentHost || isSuppressed(payload)) return;
    const { campaign } = payload;
    const host = document.createElement('div');
    host.id = 'mt-popup-banner-root';
    host.style.position = 'fixed';
    host.style.inset = '0';
    host.style.zIndex = '2147482990';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = \`:host{all:initial}.backdrop{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(15,23,42,.56);font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--text)}.card{position:relative;width:min(var(--width),100%);max-height:calc(100vh - 36px);overflow:auto;border-radius:var(--radius);background:var(--bg);box-shadow:0 28px 90px rgba(15,23,42,.3);animation:enter .2s ease-out}.content{padding:30px}.image{display:block;width:100%;max-height:260px;object-fit:cover;border-radius:calc(var(--radius) - 7px) calc(var(--radius) - 7px) 0 0}.eyebrow{margin:0 0 8px;color:var(--accent);font-size:12px;font-weight:800;letter-spacing:.11em;text-transform:uppercase}.title{margin:0;color:var(--text);font-size:clamp(24px,4vw,34px);line-height:1.08}.body{margin:14px 0 0;color:var(--muted);font-size:16px;line-height:1.58;white-space:pre-line}.ack{display:flex;gap:10px;align-items:flex-start;margin:20px 0 0;padding:14px;border-radius:14px;background:color-mix(in srgb,var(--accent) 9%,var(--bg));font-size:14px;line-height:1.4}.ack input{width:18px;height:18px;accent-color:var(--accent)}.actions{display:flex;gap:10px;justify-content:flex-end;margin-top:24px}.button{min-height:44px;border:0;border-radius:12px;padding:10px 18px;font:inherit;font-weight:750;cursor:pointer}.primary{background:var(--accent);color:white}.primary:disabled{opacity:.45;cursor:not-allowed}.secondary{background:color-mix(in srgb,var(--text) 7%,var(--bg));color:var(--text)}.close{position:absolute;z-index:2;top:12px;right:12px;width:38px;height:38px;border:0;border-radius:50%;background:rgba(15,23,42,.72);color:#fff;font-size:24px;line-height:1;cursor:pointer}.corner{align-items:flex-end;justify-content:flex-end;background:transparent;pointer-events:none}.corner .card{pointer-events:auto;box-shadow:0 20px 65px rgba(15,23,42,.25)}.bottom-sheet{align-items:flex-end}.bottom-sheet .card{width:min(760px,100%);border-radius:var(--radius) var(--radius) 0 0;margin-bottom:-18px}@keyframes enter{from{opacity:0;transform:translateY(12px) scale(.98)}to{opacity:1;transform:none}}@media(max-width:600px){.backdrop{padding:10px;align-items:flex-end}.card{border-radius:20px 20px 0 0;margin-bottom:-10px}.content{padding:24px 20px}.actions{flex-direction:column-reverse}.button{width:100%}}\`;
    shadow.append(style);
    const backdrop = document.createElement('div');
    backdrop.className = 'backdrop ' + campaign.styles.layout;
    backdrop.style.setProperty('--accent', campaign.styles.accentColor);
    backdrop.style.setProperty('--bg', campaign.styles.backgroundColor);
    backdrop.style.setProperty('--text', campaign.styles.textColor);
    backdrop.style.setProperty('--muted', campaign.styles.mutedColor);
    backdrop.style.setProperty('--radius', campaign.styles.borderRadius + 'px');
    backdrop.style.setProperty('--width', campaign.styles.maxWidth + 'px');
    const card = document.createElement('section');
    card.className = 'card'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true');
    const close = (kind) => {
      event(campaign.publicId, kind, productArticle);
      host.remove(); currentHost = null;
    };
    if (campaign.behavior.dismissible) {
      const closeButton = document.createElement('button');
      closeButton.className = 'close'; closeButton.type = 'button'; closeButton.setAttribute('aria-label', 'Закрити'); closeButton.textContent = '×';
      closeButton.addEventListener('click', () => close('dismiss')); card.append(closeButton);
      backdrop.addEventListener('click', (clickEvent) => { if (clickEvent.target === backdrop) close('dismiss'); });
    }
    if (campaign.content.imageUrl) {
      const image = document.createElement('img'); image.className = 'image'; image.src = campaign.content.imageUrl; image.alt = ''; card.append(image);
    }
    const content = document.createElement('div'); content.className = 'content';
    if (campaign.content.eyebrow) { const node = document.createElement('p'); node.className = 'eyebrow'; node.textContent = campaign.content.eyebrow; content.append(node); }
    const title = document.createElement('h2'); title.className = 'title'; title.textContent = campaign.content.title; content.append(title);
    const body = document.createElement('p'); body.className = 'body'; body.textContent = campaign.content.body; content.append(body);
    let acknowledgement = null;
    if (campaign.behavior.requireAcknowledgement) {
      const label = document.createElement('label'); label.className = 'ack';
      acknowledgement = document.createElement('input'); acknowledgement.type = 'checkbox';
      const text = document.createElement('span'); text.textContent = campaign.content.acknowledgementLabel;
      label.append(acknowledgement, text); content.append(label);
    }
    const actions = document.createElement('div'); actions.className = 'actions';
    if (campaign.behavior.dismissible && campaign.content.secondaryLabel) {
      const secondary = document.createElement('button'); secondary.className = 'button secondary'; secondary.type = 'button'; secondary.textContent = campaign.content.secondaryLabel;
      secondary.addEventListener('click', () => close('dismiss')); actions.append(secondary);
    }
    const primary = document.createElement('button'); primary.className = 'button primary'; primary.type = 'button'; primary.textContent = campaign.content.primaryLabel;
    primary.disabled = Boolean(acknowledgement && !acknowledgement.checked);
    acknowledgement?.addEventListener('change', () => { primary.disabled = !acknowledgement.checked; });
    primary.addEventListener('click', () => {
      event(campaign.publicId, campaign.behavior.requireAcknowledgement ? 'acknowledge' : 'click', productArticle);
      const target = campaign.content.primaryUrl;
      host.remove(); currentHost = null;
      if (target) { try { location.assign(new URL(target, location.href).href); } catch {} }
    });
    actions.append(primary); content.append(actions); card.append(content); backdrop.append(card); shadow.append(backdrop); document.body.append(host);
    currentHost = host; remember(payload); event(campaign.publicId, 'impression', productArticle);
    requestAnimationFrame(() => primary.focus());
  }

  async function evaluate() {
    const evaluatedUrl = location.href;
    currentUrl = evaluatedUrl;
    if (pendingTimer) clearTimeout(pendingTimer);
    pendingTimer = null;
    currentHost?.remove(); currentHost = null;
    const productArticle = article();
    const url = new URL('/api/public/popup-banners/resolve', apiOrigin);
    url.searchParams.set('pageUrl', location.href);
    if (productArticle) url.searchParams.set('article', productArticle);
    try {
      const response = await fetch(url, { headers: { accept: 'application/json' } });
      if (!response.ok) return;
      const envelope = await response.json();
      if (!envelope.data || location.href !== evaluatedUrl) return;
      pendingTimer = setTimeout(() => {
        pendingTimer = null;
        if (location.href === evaluatedUrl) render(envelope.data, productArticle);
      }, envelope.data.campaign.behavior.delayMs);
    } catch {}
  }

  evaluate();
  setInterval(() => { if (location.href !== currentUrl) evaluate(); }, 1000);
})();`;
}

export function popupEmbedCode(origin) {
  return `<script async src="${origin}/api/public/popup-banners/embed.js"></script>`;
}
