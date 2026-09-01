import { createHash, randomUUID } from 'node:crypto';
import { pool } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function localizedTitle(value) {
  const titles = object(value);
  for (const key of ['uk', 'ua', 'ru', 'en']) {
    const title = String(titles[key] || '').trim();
    if (title) return title;
  }
  return Object.values(titles).map((title) => String(title || '').trim()).find(Boolean) || '';
}

function numericValue(value) {
  const normalized = String(value || '').replace(/[\s\u00a0]/gu, '').replace(',', '.');
  const match = normalized.match(/-?\d+(?:\.\d+)?/u);
  return match ? Number(match[0]) : null;
}

function sourceIdentifier(value, fallback = '') {
  const source = object(value);
  return String(source.id ?? source.external_id ?? source.product_id ?? fallback ?? '').trim();
}

function sourceOldPrice(value) {
  const source = object(value);
  return String(source.price_old ?? source.old_price ?? source.priceOld ?? source.oldPrice ?? '').trim();
}

function isAvailable(value) {
  const availability = String(value || '').trim().toLocaleLowerCase('uk-UA');
  if (!availability) return false;
  return !/(немає\s+(?:в\s+)?наявност|нет\s+(?:в\s+)?наличи|out[\s-]*of[\s-]*stock|not[\s-]*available|закінчив|отсутств)/iu.test(availability);
}

function publicHttpUrl(value, base = '') {
  const source = String(value || '').trim();
  if (!source) return '';
  try {
    const parsed = new URL(source, base || undefined);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
  } catch {
    return '';
  }
}

function storeOrigin(storeDomain) {
  const source = String(storeDomain || '').trim();
  if (!source) return '';
  try {
    return new URL(source.includes('://') ? source : `https://${source}`).origin;
  } catch {
    return '';
  }
}

function normalizedProductLocation(value) {
  try {
    const parsed = new URL(String(value || ''));
    return {
      host: parsed.hostname.toLocaleLowerCase('en-US').replace(/^www\./u, ''),
      path: (parsed.pathname.replace(/\/+$/u, '') || '/').toLocaleLowerCase('en-US')
    };
  } catch {
    return null;
  }
}

function sameProductLocation(left, right) {
  const first = normalizedProductLocation(left);
  const second = normalizedProductLocation(right);
  return Boolean(first && second && first.host === second.host && first.path === second.path);
}

function analyticsPageUrl(value) {
  try {
    const parsed = new URL(String(value || ''));
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return `${parsed.origin}${parsed.pathname}`.slice(0, 2000);
  } catch {
    return null;
  }
}

function analyticsDateRange(days) {
  const until = new Date();
  const from = new Date(until);
  from.setUTCDate(from.getUTCDate() - Math.max(0, Number(days) - 1));
  from.setUTCHours(0, 0, 0, 0);
  return { from, until };
}

function analyticsSeries(days, rows, eventTypes) {
  const { from } = analyticsDateRange(days);
  const byDate = new Map();
  for (const row of rows) {
    const date = String(row.day instanceof Date ? row.day.toISOString().slice(0, 10) : row.day).slice(0, 10);
    const current = byDate.get(date) || {};
    current[row.event_type] = Number(current[row.event_type] || 0) + Number(row.count || 1);
    byDate.set(date, current);
  }
  return Array.from({ length: days }, (_, index) => {
    const current = new Date(from);
    current.setUTCDate(from.getUTCDate() + index);
    const date = current.toISOString().slice(0, 10);
    const values = byDate.get(date) || {};
    return Object.fromEntries([
      ['date', date],
      ...eventTypes.map((type) => [type, Number(values[type] || 0)])
    ]);
  });
}

function syntheticOldPrice(current, mode, value) {
  if (!Number.isFinite(current) || current <= 0 || !Number.isFinite(value) || value <= 0) return null;
  if (mode === 'percent') {
    const rounded = Math.floor((current * (1 + value / 100)) / 10) * 10;
    return rounded > current ? rounded : Math.ceil(current / 10) * 10 + 10;
  }
  if (mode === 'fixed') {
    const result = Math.round((current + value) * 100) / 100;
    return result > current ? result : null;
  }
  return null;
}

function promoProductUrl(value, token, enabled) {
  const pageUrl = publicHttpUrl(value);
  if (!pageUrl || !enabled) return pageUrl;
  const parsed = new URL(pageUrl);
  parsed.searchParams.set('mt_promo', token);
  return parsed.href;
}

function mapSelection(row, items = []) {
  return {
    id: row.id,
    publicId: row.public_id,
    name: row.name,
    heading: row.heading,
    priceMode: row.price_mode,
    priceValue: Number(row.price_value || 0),
    highlightPromoPrice: row.highlight_promo_price !== false,
    buttonLabel: row.button_label,
    desktopColumns: Number(row.desktop_columns || 4),
    mobileColumns: Number(row.mobile_columns || 2),
    itemCount: Number(row.item_count ?? items.length),
    items,
    owner: row.owner_id ? { id: row.owner_id, name: row.owner_name || '' } : null,
    isOwner: row.is_owner !== false,
    storeDomain: row.store_domain || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function offerFromRow(row) {
  const expectsModification = Boolean(row.modification_external_id);
  const missing = !row.product_id || (expectsModification && !row.modification_id);
  const useModification = Boolean(row.modification_id);
  const base = storeOrigin(row.store_domain);
  return {
    id: row.item_id,
    productExternalId: row.product_external_id,
    modificationExternalId: row.modification_external_id || null,
    position: Number(row.position || 0),
    promoToken: row.promo_token,
    sku: useModification ? row.modification_sku || row.product_sku || '' : row.product_sku || '',
    title: useModification
      ? localizedTitle(row.modification_titles) || localizedTitle(row.product_titles)
      : localizedTitle(row.product_titles),
    imageUrl: publicHttpUrl(
      useModification ? row.modification_image_url || row.primary_image_url : row.primary_image_url,
      base
    ),
    pageUrl: publicHttpUrl(
      useModification ? row.modification_page_url || row.canonical_url : row.canonical_url,
      base
    ),
    price: useModification ? row.modification_price || row.product_price || '' : row.product_price || '',
    oldPrice: useModification
      ? row.modification_old_price || sourceOldPrice(row.modification_source_data)
        || row.product_old_price || sourceOldPrice(row.product_source_data)
      : row.product_old_price || sourceOldPrice(row.product_source_data),
    currency: useModification
      ? row.modification_currency || row.product_currency || ''
      : row.product_currency || '',
    availability: useModification
      ? row.modification_availability || row.product_availability || ''
      : row.product_availability || '',
    visible: useModification ? row.modification_visible !== false : row.product_visible !== false,
    available: !missing && isAvailable(useModification
      ? row.modification_availability || row.product_availability
      : row.product_availability),
    buyId: useModification
      ? sourceIdentifier(row.modification_source_data, sourceIdentifier(row.product_source_data, row.product_external_id))
      : sourceIdentifier(row.product_source_data, row.product_external_id),
    missing
  };
}

async function currentConnection(database = pool) {
  const result = await database.query(`
    SELECT id, generation, store_domain, status, last_sync_at
    FROM search_horoshop_connections
    WHERE singleton = TRUE AND status IN ('connected', 'syncing')
    LIMIT 1
  `);
  return result.rows[0] || null;
}

async function resolvedItems(database, selectionId, connection) {
  const result = await database.query(`
    SELECT item.id AS item_id, item.product_external_id, item.modification_external_id,
           item.position, item.promo_token,
           product.id AS product_id, product.sku AS product_sku, product.titles AS product_titles,
           product.price AS product_price, product.old_price AS product_old_price,
           product.currency AS product_currency, product.availability AS product_availability,
           product.visible AS product_visible, product.primary_image_url, product.canonical_url,
           product.source_data AS product_source_data,
           modification.id AS modification_id, modification.sku AS modification_sku,
           modification.titles AS modification_titles, modification.price AS modification_price,
           modification.old_price AS modification_old_price,
           modification.currency AS modification_currency,
           modification.availability AS modification_availability,
           modification.visible AS modification_visible,
           modification.image_url AS modification_image_url,
           modification.page_url AS modification_page_url,
           modification.source_data AS modification_source_data,
           $3::TEXT AS store_domain
    FROM product_selection_items AS item
    LEFT JOIN search_horoshop_products AS product
      ON product.connection_id = $2 AND product.generation = $4
     AND product.external_id = item.product_external_id AND product.active = TRUE
    LEFT JOIN search_horoshop_modifications AS modification
      ON modification.connection_id = $2 AND modification.generation = $4
     AND modification.product_id = product.id
     AND modification.external_id = item.modification_external_id AND modification.active = TRUE
    WHERE item.selection_id = $1
    ORDER BY item.position, item.id
  `, [selectionId, connection.id, connection.store_domain, connection.generation]);
  return result.rows.map(offerFromRow);
}

async function validateItems(database, connection, items) {
  const productIds = [...new Set(items.map((item) => item.productExternalId))];
  const productResult = await database.query(`
    SELECT id, external_id
    FROM search_horoshop_products
    WHERE connection_id = $1 AND generation = $2 AND active = TRUE
      AND external_id = ANY($3::TEXT[])
  `, [connection.id, connection.generation, productIds]);
  const products = new Map(productResult.rows.map((row) => [row.external_id, row.id]));
  const modificationIds = [...new Set(items.map((item) => item.modificationExternalId).filter(Boolean))];
  let modifications = new Map();
  if (modificationIds.length) {
    const modificationResult = await database.query(`
      SELECT modification.external_id, product.external_id AS product_external_id
      FROM search_horoshop_modifications AS modification
      JOIN search_horoshop_products AS product ON product.id = modification.product_id
      WHERE modification.connection_id = $1 AND modification.generation = $2
        AND modification.active = TRUE AND product.active = TRUE
        AND modification.external_id = ANY($3::TEXT[])
    `, [connection.id, connection.generation, modificationIds]);
    modifications = new Map(modificationResult.rows.map((row) => [
      `${row.product_external_id}\0${row.external_id}`, true
    ]));
  }
  for (const item of items) {
    if (!products.has(item.productExternalId)
      || (item.modificationExternalId
        && !modifications.has(`${item.productExternalId}\0${item.modificationExternalId}`))) {
      throw new AppError(422, 'PRODUCT_SELECTION_ITEM_INVALID', 'Один із вибраних товарів більше не існує в актуальному каталозі Хорошопа.');
    }
  }
}

function itemKey(item) {
  return `${item.productExternalId}\0${item.modificationExternalId || ''}`;
}

async function replaceItems(database, selectionId, connection, items) {
  await validateItems(database, connection, items);
  const existingResult = await database.query(`
    SELECT product_external_id, modification_external_id, promo_token
    FROM product_selection_items
    WHERE selection_id = $1
  `, [selectionId]);
  const existingTokens = new Map(existingResult.rows.map((row) => [
    `${row.product_external_id}\0${row.modification_external_id || ''}`,
    row.promo_token
  ]));
  await database.query('DELETE FROM product_selection_items WHERE selection_id = $1', [selectionId]);
  for (let position = 0; position < items.length; position += 1) {
    const item = items[position];
    await database.query(`
      INSERT INTO product_selection_items (
        selection_id, product_external_id, modification_external_id, position, promo_token
      ) VALUES ($1, $2, $3, $4, $5)
    `, [selectionId, item.productExternalId, item.modificationExternalId || null,
      position, existingTokens.get(itemKey(item)) || randomUUID()]);
  }
}

async function loadSelection(database, id, userId = null) {
  const values = [id];
  const ownerClause = userId ? 'AND selection.user_id = $2' : '';
  if (userId) values.push(userId);
  const result = await database.query(`
    SELECT selection.*, users.name AS owner_name,
           selection.user_id AS owner_id,
           connection.store_domain, connection.generation,
           ${userId ? 'selection.user_id = $2' : 'TRUE'} AS is_owner
    FROM product_selections AS selection
    JOIN users ON users.id = selection.user_id
    JOIN search_horoshop_connections AS connection ON connection.id = selection.connection_id
    WHERE selection.id = $1 ${ownerClause}
  `, values);
  const row = result.rows[0];
  if (!row) return null;
  const items = await resolvedItems(database, row.id, {
    id: row.connection_id,
    generation: row.generation,
    store_domain: row.store_domain
  });
  return mapSelection(row, items);
}

export async function listProductSelections(userId, search = '') {
  const result = await pool.query(`
    SELECT selection.*, users.name AS owner_name,
           selection.user_id AS owner_id, connection.store_domain,
           selection.user_id = $1 AS is_owner,
           COUNT(item.id) AS item_count
    FROM product_selections AS selection
    JOIN users ON users.id = selection.user_id
    JOIN search_horoshop_connections AS connection ON connection.id = selection.connection_id
    LEFT JOIN product_selection_items AS item ON item.selection_id = selection.id
    WHERE selection.user_id = $1
      AND ($2 = '' OR selection.name ILIKE '%' || $2 || '%')
    GROUP BY selection.id, users.name, connection.store_domain
    ORDER BY selection.updated_at DESC
  `, [userId, String(search || '').trim()]);
  return result.rows.map((row) => mapSelection(row));
}

export async function getProductSelection(id, userId) {
  const selection = await loadSelection(pool, id, userId);
  if (!selection) throw new AppError(404, 'PRODUCT_SELECTION_NOT_FOUND', 'Вибірку товарів не знайдено.');
  return selection;
}

export async function createProductSelection(userId, input) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const connection = await currentConnection(client);
    if (!connection) throw new AppError(409, 'HOROSHOP_NOT_CONNECTED', 'Підключіть Хорошоп і синхронізуйте каталог.');
    const result = await client.query(`
      INSERT INTO product_selections (
        user_id, connection_id, name, heading, price_mode, price_value,
        highlight_promo_price, button_label, desktop_columns, mobile_columns
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `, [userId, connection.id, input.name, input.heading, input.priceMode, input.priceValue,
      input.highlightPromoPrice, input.buttonLabel, input.desktopColumns, input.mobileColumns]);
    await replaceItems(client, result.rows[0].id, connection, input.items);
    await client.query('COMMIT');
    return getProductSelection(result.rows[0].id, userId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateProductSelection(id, userId, input) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(`
      SELECT id, connection_id FROM product_selections
      WHERE id = $1 AND user_id = $2 FOR UPDATE
    `, [id, userId]);
    if (!existing.rows[0]) throw new AppError(404, 'PRODUCT_SELECTION_NOT_FOUND', 'Вибірку товарів не знайдено.');
    const connectionResult = await client.query(`
      SELECT id, generation, store_domain
      FROM search_horoshop_connections
      WHERE id = $1 AND status IN ('connected', 'syncing')
    `, [existing.rows[0].connection_id]);
    const connection = connectionResult.rows[0];
    if (!connection) throw new AppError(409, 'HOROSHOP_NOT_CONNECTED', 'Підключення Хорошоп для цієї вибірки недоступне.');
    await client.query(`
      UPDATE product_selections
      SET name = $1, heading = $2, price_mode = $3, price_value = $4,
          highlight_promo_price = $5, button_label = $6,
          desktop_columns = $7, mobile_columns = $8, updated_at = NOW()
      WHERE id = $9 AND user_id = $10
    `, [input.name, input.heading, input.priceMode, input.priceValue,
      input.highlightPromoPrice, input.buttonLabel, input.desktopColumns,
      input.mobileColumns, id, userId]);
    await replaceItems(client, id, connection, input.items);
    await client.query('COMMIT');
    return getProductSelection(id, userId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteProductSelection(id, userId) {
  const result = await pool.query(
    'DELETE FROM product_selections WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  if (!result.rowCount) throw new AppError(404, 'PRODUCT_SELECTION_NOT_FOUND', 'Вибірку товарів не знайдено.');
}

export async function loadPublicProductSelection(publicId) {
  const result = await pool.query(`
    SELECT selection.*, connection.generation, connection.store_domain
    FROM product_selections AS selection
    JOIN search_horoshop_connections AS connection ON connection.id = selection.connection_id
    WHERE selection.public_id = $1 AND connection.status IN ('connected', 'syncing')
    LIMIT 1
  `, [publicId]);
  const row = result.rows[0];
  if (!row) return null;
  const storedItems = await resolvedItems(pool, row.id, {
    id: row.connection_id,
    generation: row.generation,
    store_domain: row.store_domain
  });
  const synthetic = row.price_mode !== 'none' && Number(row.price_value) > 0;
  const products = storedItems.filter((item) => (
    !item.missing && item.visible && item.available && item.title && item.imageUrl && item.pageUrl && item.price
  )).map((item) => {
    const current = numericValue(item.price);
    const calculated = syntheticOldPrice(current, row.price_mode, Number(row.price_value));
    const fallbackOld = numericValue(item.oldPrice);
    const oldPrice = calculated ?? (fallbackOld !== null && fallbackOld > (current ?? 0) ? fallbackOld : null);
    return {
      productExternalId: item.productExternalId,
      modificationExternalId: item.modificationExternalId,
      article: item.sku,
      title: item.title,
      imageUrl: item.imageUrl,
      pageUrl: promoProductUrl(item.pageUrl, item.promoToken, synthetic),
      price: item.price,
      oldPrice: oldPrice === null ? '' : String(oldPrice),
      currency: item.currency,
      buyId: item.buyId,
      highlightPrice: Boolean(row.highlight_promo_price && oldPrice !== null)
    };
  });
  return {
    id: row.public_id,
    heading: row.heading,
    buttonLabel: row.button_label,
    desktopColumns: Number(row.desktop_columns),
    mobileColumns: Number(row.mobile_columns),
    products
  };
}

export async function recordProductSelectionEvents(publicId, events) {
  const selectionResult = await pool.query(
    'SELECT id FROM product_selections WHERE public_id = $1',
    [publicId]
  );
  const selection = selectionResult.rows[0];
  if (!selection) throw new AppError(404, 'PRODUCT_SELECTION_NOT_FOUND', 'Вибірку товарів не знайдено.');
  const visitorHashes = new Map();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const event of events) {
      const visitorKey = String(event.visitorKey || '').slice(0, 200);
      if (!visitorHashes.has(visitorKey)) {
        visitorHashes.set(visitorKey, visitorKey
          ? createHash('sha256').update(visitorKey).digest('hex') : null);
      }
      await client.query(`
        INSERT INTO product_selection_events (
          selection_id, product_external_id, modification_external_id, event_type,
          visitor_key_hash, page_url, surface, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::JSONB)
      `, [selection.id, event.productExternalId || null, event.modificationExternalId || null,
        event.eventType, visitorHashes.get(visitorKey), analyticsPageUrl(event.pageUrl),
        event.surface || 'desktop', JSON.stringify(object(event.metadata))]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function productSelectionAnalytics(userId, { days = 30, selectionId = null } = {}) {
  const periodDays = Math.min(90, Math.max(7, Number(days) || 30));
  const { from } = analyticsDateRange(periodDays);
  const values = [userId, from.toISOString()];
  const selectionClause = selectionId ? 'AND selection.id = $3' : '';
  if (selectionId) values.push(selectionId);
  const selectionMetadataClause = selectionId ? 'AND selection.id = $2' : '';
  const selectionMetadataValues = selectionId ? [userId, selectionId] : [userId];

  if (selectionId) {
    const owned = await pool.query(
      'SELECT id FROM product_selections WHERE id = $1 AND user_id = $2',
      [selectionId, userId]
    );
    if (!owned.rows[0]) throw new AppError(404, 'PRODUCT_SELECTION_NOT_FOUND', 'Вибірку товарів не знайдено.');
  }

  const scope = `
    FROM product_selection_events AS event
    JOIN product_selections AS selection ON selection.id = event.selection_id
    WHERE selection.user_id = $1 AND event.created_at >= $2 ${selectionClause}
  `;
  const [totalsResult, seriesResult, selectionResult, selectionStatsResult, productResult, surfaceResult, pageResult] = await Promise.all([
    pool.query(`SELECT event.event_type, COUNT(*) AS count ${scope} GROUP BY event.event_type`, values),
    pool.query(`SELECT event.created_at AS day, event.event_type ${scope} ORDER BY event.created_at`, values),
    pool.query(`SELECT selection.id, selection.public_id, selection.name, COUNT(item.id) AS item_count
                FROM product_selections AS selection
                LEFT JOIN product_selection_items AS item ON item.selection_id = selection.id
                WHERE selection.user_id = $1 ${selectionMetadataClause}
                GROUP BY selection.id, selection.public_id, selection.name, selection.updated_at
                ORDER BY selection.updated_at DESC`, selectionMetadataValues),
    pool.query(`SELECT event.selection_id, event.event_type, COUNT(*) AS count ${scope}
                GROUP BY event.selection_id, event.event_type`, values),
    pool.query(`SELECT event.product_external_id, event.modification_external_id,
                       product.sku AS product_sku, product.titles AS product_titles,
                       product.primary_image_url, modification.sku AS modification_sku,
                       modification.titles AS modification_titles, modification.image_url,
                       event.event_type, COUNT(*) AS count
                FROM product_selection_events AS event
                JOIN product_selections AS selection ON selection.id = event.selection_id
                LEFT JOIN search_horoshop_connections AS connection ON connection.id = selection.connection_id
                LEFT JOIN search_horoshop_products AS product
                  ON product.connection_id = connection.id AND product.generation = connection.generation
                 AND product.external_id = event.product_external_id AND product.active = TRUE
                LEFT JOIN search_horoshop_modifications AS modification
                  ON modification.connection_id = connection.id AND modification.generation = connection.generation
                 AND modification.product_id = product.id
                 AND modification.external_id = event.modification_external_id AND modification.active = TRUE
                WHERE selection.user_id = $1 AND event.created_at >= $2 ${selectionClause}
                  AND event.product_external_id IS NOT NULL
                GROUP BY event.product_external_id, event.modification_external_id,
                         product.sku, product.titles, product.primary_image_url,
                         modification.sku, modification.titles, modification.image_url,
                         event.event_type`, values),
    pool.query(`SELECT COALESCE(event.surface, 'desktop') AS surface, COUNT(*) AS count ${scope}
                GROUP BY COALESCE(event.surface, 'desktop')`, values),
    pool.query(`SELECT event.page_url, event.event_type, COUNT(*) AS count ${scope}
                AND event.page_url IS NOT NULL GROUP BY event.page_url, event.event_type
                ORDER BY count DESC`, values)
  ]);

  const eventCounts = Object.fromEntries(totalsResult.rows.map((row) => [row.event_type, Number(row.count)]));
  const uniqueResult = await pool.query(`SELECT COUNT(DISTINCT event.visitor_key_hash) AS count ${scope}
                                         AND event.visitor_key_hash IS NOT NULL`, values);
  const totals = {
    impressions: Number(eventCounts.impression || 0),
    productImpressions: Number(eventCounts.product_impression || 0),
    productClicks: Number(eventCounts.product_click || 0),
    buyClicks: Number(eventCounts.buy_click || 0),
    addToCart: Number(eventCounts.add_to_cart || 0),
    alreadyInCart: Number(eventCounts.already_in_cart || 0),
    errors: Number(eventCounts.add_to_cart_error || 0),
    uniqueVisitors: Number(uniqueResult.rows[0]?.count || 0)
  };

  function groupedRows(rows, keyFn, baseFn) {
    const grouped = new Map();
    for (const row of rows) {
      const key = keyFn(row);
      const item = grouped.get(key) || { ...baseFn(row), counts: {} };
      item.counts[row.event_type] = Number(row.count || 0);
      grouped.set(key, item);
    }
    return [...grouped.values()];
  }

  const selectionStats = new Map();
  for (const row of selectionStatsResult.rows) {
    const counts = selectionStats.get(row.selection_id) || {};
    counts[row.event_type] = Number(row.count || 0);
    selectionStats.set(row.selection_id, counts);
  }
  const selections = selectionResult.rows.map((row) => ({
    id: row.id,
    publicId: row.public_id,
    name: row.name,
    itemCount: Number(row.item_count || 0),
    ...(selectionStats.get(row.id) || {})
  }));
  const itemDetails = new Map();
  const loadedSelections = await Promise.all(selectionResult.rows.map((row) => loadSelection(pool, row.id, userId)));
  for (const selection of loadedSelections) {
    for (const item of selection?.items || []) itemDetails.set(itemKey(item), item);
  }
  const products = groupedRows(productResult.rows,
    (row) => `${row.product_external_id}\0${row.modification_external_id || ''}`,
    (row) => {
      const details = itemDetails.get(`${row.product_external_id}\0${row.modification_external_id || ''}`);
      return ({
      productExternalId: row.product_external_id,
      modificationExternalId: row.modification_external_id || null,
      sku: details?.sku || row.modification_sku || row.product_sku || '',
      title: details?.title || localizedTitle(row.modification_titles) || localizedTitle(row.product_titles) || row.product_external_id,
      imageUrl: details?.imageUrl || row.image_url || row.primary_image_url || ''
    }); }).map((item) => ({ ...item, ...item.counts, counts: undefined }));
  const pages = groupedRows(pageResult.rows, (row) => row.page_url, (row) => ({ pageUrl: row.page_url }))
    .map((item) => ({ ...item, ...item.counts, counts: undefined })).slice(0, 12);

  return {
    periodDays,
    totals: {
      ...totals,
      clickThroughRate: totals.productImpressions ? totals.productClicks / totals.productImpressions : 0,
      cartRate: totals.buyClicks ? (totals.addToCart + totals.alreadyInCart) / totals.buyClicks : 0
    },
    series: analyticsSeries(periodDays, seriesResult.rows,
      ['impression', 'product_click', 'add_to_cart', 'add_to_cart_error']),
    selections,
    products,
    surfaces: surfaceResult.rows.map((row) => ({ surface: row.surface, count: Number(row.count || 0) })),
    pages
  };
}

export async function resolveProductPromo(token, pageUrl) {
  const result = await pool.query(`
    SELECT selection.price_mode, selection.price_value,
           selection.highlight_promo_price, connection.store_domain,
           item.modification_external_id, modification.id AS modification_id,
           product.canonical_url,
           modification.page_url AS modification_page_url
    FROM product_selection_items AS item
    JOIN product_selections AS selection ON selection.id = item.selection_id
    JOIN search_horoshop_connections AS connection
      ON connection.id = selection.connection_id AND connection.status IN ('connected', 'syncing')
    JOIN search_horoshop_products AS product
      ON product.connection_id = connection.id AND product.generation = connection.generation
     AND product.external_id = item.product_external_id AND product.active = TRUE
    LEFT JOIN search_horoshop_modifications AS modification
      ON modification.connection_id = connection.id AND modification.generation = connection.generation
     AND modification.product_id = product.id
     AND modification.external_id = item.modification_external_id AND modification.active = TRUE
    WHERE item.promo_token = $1
    LIMIT 1
  `, [token]);
  const row = result.rows[0];
  const expectedUrl = publicHttpUrl(row?.modification_page_url || row?.canonical_url, storeOrigin(row?.store_domain));
  if (!row || (row.modification_external_id && !row.modification_id)
    || row.price_mode === 'none' || Number(row.price_value) <= 0
    || !expectedUrl || !sameProductLocation(pageUrl, expectedUrl)) return null;
  return {
    mode: row.price_mode,
    value: Number(row.price_value),
    highlightPromoPrice: row.highlight_promo_price !== false
  };
}

export { isAvailable, syntheticOldPrice };
