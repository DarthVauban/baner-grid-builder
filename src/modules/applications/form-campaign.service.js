import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { pool, query } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import { cleanText, cleanUrl, loadPublishedForm } from './application.service.js';

const tokenAudience = 'application-form-campaign';
const tokenIssuer = 'mt-banner-builder';

const defaultPlacement = {
  desktop: { selector: '.product-order__row', insertPosition: 'end' },
  mobile: { selector: '.product-order__row', insertPosition: 'end' }
};

const defaultButtonStyles = {
  backgroundColor: '#6d5dfc',
  color: '#ffffff',
  borderRadius: '12px',
  padding: '12px 18px',
  fontWeight: '700',
  fontSize: 'inherit'
};

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function localizedTitle(value) {
  const source = object(value);
  return cleanText(source.uk || source.ua || source.ru || source.en || Object.values(source)[0] || '', 500);
}

function normalizePlacement(value) {
  const source = object(value);
  const normalizeDevice = (device, fallback) => {
    const candidate = object(device);
    return {
      selector: cleanText(candidate.selector || fallback.selector, 500),
      insertPosition: ['start', 'end', 'before', 'after'].includes(candidate.insertPosition)
        ? candidate.insertPosition
        : fallback.insertPosition
    };
  };
  return {
    desktop: normalizeDevice(source.desktop, defaultPlacement.desktop),
    mobile: normalizeDevice(source.mobile, defaultPlacement.mobile)
  };
}

function normalizeButtonStyles(value) {
  const source = object(value);
  return Object.fromEntries(Object.entries(defaultButtonStyles).map(([key, fallback]) => [
    key,
    cleanText(source[key] ?? fallback, 120)
  ]));
}

function serializeTarget(row) {
  return {
    id: row.id,
    productId: row.product_id,
    modificationId: row.modification_id || null,
    productExternalId: row.product_external_id,
    modificationExternalId: row.modification_external_id || null,
    sku: row.sku || '',
    title: row.title || '',
    targetKey: row.target_key
  };
}

function serializeCampaign(row, targets = []) {
  return {
    id: row.id,
    publicId: row.public_id,
    formId: row.form_id,
    formPublicId: row.form_public_id,
    formName: row.form_name,
    connectionId: row.connection_id,
    connectionGeneration: row.connection_generation,
    name: row.name,
    status: row.status,
    priority: Number(row.priority || 0),
    buttonText: row.button_text,
    buttonStyles: normalizeButtonStyles(row.button_styles),
    placement: normalizePlacement(row.placement),
    availabilityMode: row.availability_mode,
    targetMode: row.target_mode || 'products',
    categoryExternalId: row.category_external_id || null,
    stickerExternalId: row.sticker_external_id || null,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    publishedAt: row.published_at,
    archivedAt: row.archived_at,
    targets: targets.map(serializeTarget),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function loadTargets(campaignIds, db = pool) {
  if (!campaignIds.length) return new Map();
  const placeholders = campaignIds.map((_, index) => `$${index + 1}`).join(', ');
  const result = await db.query(
    `SELECT *
     FROM application_form_campaign_targets
     WHERE campaign_id IN (${placeholders})
     ORDER BY lower(title), lower(sku), modification_id NULLS FIRST`,
    campaignIds
  );
  const grouped = new Map(campaignIds.map((id) => [id, []]));
  for (const row of result.rows) grouped.get(row.campaign_id)?.push(row);
  return grouped;
}

export async function listFormCampaigns({ formId = '' } = {}, db = pool) {
  const params = [];
  const clauses = ['campaign.archived_at IS NULL'];
  if (formId) {
    params.push(formId);
    clauses.push(`campaign.form_id = $${params.length}`);
  }
  const result = await db.query(
    `SELECT campaign.*, form.public_id AS form_public_id, form.name AS form_name
     FROM application_form_campaigns AS campaign
     JOIN application_forms AS form ON form.id = campaign.form_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY campaign.updated_at DESC`,
    params
  );
  const targets = await loadTargets(result.rows.map((row) => row.id), db);
  return result.rows.map((row) => serializeCampaign(row, targets.get(row.id) || []));
}

export async function loadFormCampaign(id, db = pool) {
  const result = await db.query(
    `SELECT campaign.*, form.public_id AS form_public_id, form.name AS form_name
     FROM application_form_campaigns AS campaign
     JOIN application_forms AS form ON form.id = campaign.form_id
     WHERE campaign.id = $1 AND campaign.archived_at IS NULL`,
    [id]
  );
  if (!result.rows[0]) return null;
  const targets = await loadTargets([id], db);
  return serializeCampaign(result.rows[0], targets.get(id) || []);
}

async function currentConnection(db = pool) {
  const result = await db.query(
    `SELECT id, generation, store_domain, status
     FROM search_horoshop_connections
     WHERE singleton = TRUE
     LIMIT 1`
  );
  return result.rows[0] || null;
}

export async function listFormCampaignStickers(db = pool) {
  const connection = await currentConnection(db);
  if (!connection) return [];
  const result = await db.query(
    `SELECT external_id, title
     FROM search_horoshop_stickers
     WHERE connection_id = $1 AND generation = $2
       AND active = TRUE AND enabled = TRUE
     ORDER BY LOWER(title), external_id`,
    [connection.id, connection.generation]
  );
  return result.rows.map((row) => ({ externalId: row.external_id, title: row.title }));
}

function normalizedTargeting(input) {
  const targetMode = ['all_products', 'products', 'category', 'sticker'].includes(input.targetMode)
    ? input.targetMode
    : 'products';
  return {
    targetMode,
    categoryExternalId: targetMode === 'category' ? cleanText(input.categoryExternalId, 255) : null,
    stickerExternalId: targetMode === 'sticker' ? cleanText(input.stickerExternalId, 255) : null
  };
}

async function resolveCampaignTargeting(input, connection, db) {
  const targeting = normalizedTargeting(input);
  if (targeting.targetMode === 'products') {
    const targets = await resolveTargets(input.targets || [], connection, db);
    if (!targets.length) {
      throw new AppError(422, 'FORM_CAMPAIGN_TARGET_REQUIRED', 'Оберіть хоча б один товар або модифікацію.');
    }
    return { ...targeting, targets };
  }
  if (targeting.targetMode === 'category') {
    const category = await db.query(
      `SELECT id FROM search_horoshop_categories
       WHERE connection_id = $1 AND generation = $2 AND external_id = $3 AND active = TRUE
       LIMIT 1`,
      [connection.id, connection.generation, targeting.categoryExternalId]
    );
    if (!category.rows[0]) {
      throw new AppError(422, 'FORM_CAMPAIGN_CATEGORY_NOT_FOUND', 'Обрана категорія вже недоступна в актуальному каталозі.');
    }
  }
  if (targeting.targetMode === 'sticker') {
    const sticker = await db.query(
      `SELECT id FROM search_horoshop_stickers
       WHERE connection_id = $1 AND generation = $2 AND external_id = $3
         AND active = TRUE AND enabled = TRUE
       LIMIT 1`,
      [connection.id, connection.generation, targeting.stickerExternalId]
    );
    if (!sticker.rows[0]) {
      throw new AppError(422, 'FORM_CAMPAIGN_STICKER_NOT_FOUND', 'Обраний стікер уже недоступний в актуальному каталозі.');
    }
  }
  return { ...targeting, targets: [] };
}

function normalizeTargetReferences(references) {
  const unique = new Map();
  for (const reference of references) {
    const productId = String(reference.productId || '');
    const modificationId = reference.modificationId ? String(reference.modificationId) : null;
    const existingParent = unique.has(`${productId}:*`);
    if (modificationId && existingParent) continue;
    if (!modificationId) {
      for (const key of unique.keys()) if (key.startsWith(`${productId}:`)) unique.delete(key);
    }
    unique.set(`${productId}:${modificationId || '*'}`, { productId, modificationId });
  }
  return [...unique.values()];
}

async function resolveTargets(references, connection, db) {
  const resolved = [];
  for (const reference of normalizeTargetReferences(references)) {
    const result = await db.query(
      `SELECT product.id AS product_id, product.external_id AS product_external_id,
              product.sku AS product_sku, product.titles AS product_titles,
              modification.id AS modification_id,
              modification.external_id AS modification_external_id,
              modification.sku AS modification_sku,
              modification.titles AS modification_titles
       FROM search_horoshop_products AS product
       LEFT JOIN search_horoshop_modifications AS modification
         ON modification.id = $2
        AND modification.product_id = product.id
        AND modification.connection_id = product.connection_id
        AND modification.generation = product.generation
        AND modification.active = TRUE
       WHERE product.id = $1
         AND product.connection_id = $3
         AND product.generation = $4
         AND product.active = TRUE
         AND ($2::UUID IS NULL OR modification.id IS NOT NULL)
       LIMIT 1`,
      [reference.productId, reference.modificationId, connection.id, connection.generation]
    );
    const row = result.rows[0];
    if (!row) {
      throw new AppError(422, 'FORM_CAMPAIGN_TARGET_NOT_FOUND', 'Обраний товар або модифікація вже недоступні в актуальному каталозі.');
    }
    const modificationExternalId = row.modification_external_id || null;
    resolved.push({
      productId: row.product_id,
      modificationId: row.modification_id || null,
      productExternalId: row.product_external_id,
      modificationExternalId,
      sku: row.modification_sku || row.product_sku || '',
      title: localizedTitle(row.modification_titles) || localizedTitle(row.product_titles),
      targetKey: `${row.product_external_id}:${modificationExternalId || '*'}`
    });
  }
  return resolved;
}

async function replaceTargets(db, campaignId, targets) {
  await db.query('DELETE FROM application_form_campaign_targets WHERE campaign_id = $1', [campaignId]);
  for (const target of targets) {
    await db.query(
      `INSERT INTO application_form_campaign_targets (
         campaign_id, product_id, modification_id, product_external_id,
         modification_external_id, sku, title, target_key
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [campaignId, target.productId, target.modificationId, target.productExternalId,
        target.modificationExternalId, target.sku, target.title, target.targetKey]
    );
  }
}

async function validateForm(formId, db) {
  const result = await db.query(
    `SELECT id, public_id, form_type, status
     FROM application_forms
     WHERE id = $1 AND status <> 'archived'
     LIMIT 1`,
    [formId]
  );
  const form = result.rows[0];
  if (!form) throw new AppError(404, 'FORM_NOT_FOUND', 'Форму не знайдено.');
  if (form.form_type !== 'simple') {
    throw new AppError(422, 'FORM_CAMPAIGN_SIMPLE_ONLY', 'Розміщення на товарах доступне лише для звичайних форм.');
  }
  return form;
}

export async function createFormCampaign(input, actorUserId) {
  const client = await pool.connect();
  let campaignId;
  try {
    await client.query('BEGIN');
    await validateForm(input.formId, client);
    const connection = await currentConnection(client);
    if (!connection || !['connected', 'syncing'].includes(connection.status)) {
      throw new AppError(409, 'HOROSHOP_NOT_CONNECTED', 'Підключіть магазин Хорошоп перед створенням розміщення.');
    }
    const targeting = await resolveCampaignTargeting(input, connection, client);
    const result = await client.query(
      `INSERT INTO application_form_campaigns (
         form_id, connection_id, connection_generation, name, priority,
         button_text, button_styles, placement, availability_mode,
         target_mode, category_external_id, sticker_external_id,
         starts_at, ends_at, created_by, updated_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::JSONB, $8::JSONB, $9, $10, $11, $12, $13, $14, $15, $15)
       RETURNING id`,
      [input.formId, connection.id, connection.generation, input.name, input.priority,
        input.buttonText, JSON.stringify(normalizeButtonStyles(input.buttonStyles)),
        JSON.stringify(normalizePlacement(input.placement)), input.availabilityMode,
        targeting.targetMode, targeting.categoryExternalId, targeting.stickerExternalId,
        input.startsAt || null, input.endsAt || null, actorUserId]
    );
    campaignId = result.rows[0].id;
    await replaceTargets(client, campaignId, targeting.targets);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  return loadFormCampaign(campaignId);
}

export async function updateFormCampaign(id, input, actorUserId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      `SELECT * FROM application_form_campaigns
       WHERE id = $1 AND archived_at IS NULL
       FOR UPDATE`,
      [id]
    );
    if (!current.rows[0]) throw new AppError(404, 'FORM_CAMPAIGN_NOT_FOUND', 'Розміщення не знайдено.');
    const form = await validateForm(input.formId, client);
    if (current.rows[0].status === 'active' && form.status !== 'published') {
      throw new AppError(422, 'FORM_CAMPAIGN_FORM_NOT_PUBLISHED', 'Активне розміщення можна прив’язати лише до опублікованої форми.');
    }
    const connection = await currentConnection(client);
    if (!connection || !['connected', 'syncing'].includes(connection.status)) {
      throw new AppError(409, 'HOROSHOP_NOT_CONNECTED', 'Підключіть магазин Хорошоп перед оновленням розміщення.');
    }
    const targeting = await resolveCampaignTargeting(input, connection, client);
    await client.query(
      `UPDATE application_form_campaigns
       SET form_id = $2, connection_id = $3, connection_generation = $4,
           name = $5, priority = $6, button_text = $7, button_styles = $8::JSONB,
           placement = $9::JSONB, availability_mode = $10,
           target_mode = $11, category_external_id = $12, sticker_external_id = $13,
           starts_at = $14, ends_at = $15, updated_by = $16, updated_at = NOW()
       WHERE id = $1`,
      [id, input.formId, connection.id, connection.generation, input.name, input.priority,
        input.buttonText, JSON.stringify(normalizeButtonStyles(input.buttonStyles)),
        JSON.stringify(normalizePlacement(input.placement)), input.availabilityMode,
        targeting.targetMode, targeting.categoryExternalId, targeting.stickerExternalId,
        input.startsAt || null, input.endsAt || null, actorUserId]
    );
    await replaceTargets(client, id, targeting.targets);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  return loadFormCampaign(id);
}

async function assertCampaignCanActivate(id, db) {
  const result = await db.query(
    `SELECT campaign.id, campaign.connection_id, campaign.connection_generation,
            campaign.target_mode, campaign.category_external_id, campaign.sticker_external_id,
            form.form_type, form.status AS form_status,
            connection.id AS current_connection_id, connection.generation AS current_generation,
            connection.status AS connection_status
     FROM application_form_campaigns AS campaign
     JOIN application_forms AS form ON form.id = campaign.form_id
     LEFT JOIN search_horoshop_connections AS connection ON connection.singleton = TRUE
     WHERE campaign.id = $1 AND campaign.archived_at IS NULL`,
    [id]
  );
  const campaign = result.rows[0];
  if (!campaign) throw new AppError(404, 'FORM_CAMPAIGN_NOT_FOUND', 'Розміщення не знайдено.');
  if (campaign.form_type !== 'simple') throw new AppError(422, 'FORM_CAMPAIGN_SIMPLE_ONLY', 'Розміщення доступне лише для звичайних форм.');
  if (campaign.form_status !== 'published') throw new AppError(422, 'FORM_CAMPAIGN_FORM_NOT_PUBLISHED', 'Спочатку опублікуйте форму.');
  if (!['connected', 'syncing'].includes(campaign.connection_status)
    || campaign.connection_id !== campaign.current_connection_id
    || campaign.connection_generation !== campaign.current_generation) {
    throw new AppError(409, 'FORM_CAMPAIGN_CATALOG_STALE', 'Каталог Хорошоп змінився. Збережіть цільові товари повторно.');
  }
  if (campaign.target_mode === 'all_products') return;
  if (campaign.target_mode === 'category') {
    const category = await db.query(
      `SELECT id FROM search_horoshop_categories
       WHERE connection_id = $1 AND generation = $2 AND external_id = $3 AND active = TRUE
       LIMIT 1`,
      [campaign.current_connection_id, campaign.current_generation, campaign.category_external_id]
    );
    if (!category.rows[0]) {
      throw new AppError(422, 'FORM_CAMPAIGN_CATEGORY_NOT_FOUND', 'Обрана категорія вже недоступна в актуальному каталозі.');
    }
    return;
  }
  if (campaign.target_mode === 'sticker') {
    const sticker = await db.query(
      `SELECT id FROM search_horoshop_stickers
       WHERE connection_id = $1 AND generation = $2 AND external_id = $3
         AND active = TRUE AND enabled = TRUE
       LIMIT 1`,
      [campaign.current_connection_id, campaign.current_generation, campaign.sticker_external_id]
    );
    if (!sticker.rows[0]) {
      throw new AppError(422, 'FORM_CAMPAIGN_STICKER_NOT_FOUND', 'Обраний стікер уже недоступний в актуальному каталозі.');
    }
    return;
  }
  const targets = await db.query(
    `SELECT target.modification_id, product.id AS current_product_id,
            modification.id AS current_modification_id
     FROM application_form_campaign_targets AS target
     LEFT JOIN search_horoshop_products AS product
       ON product.id = target.product_id AND product.active = TRUE AND product.visible = TRUE
      AND product.connection_id = $2 AND product.generation = $3
     LEFT JOIN search_horoshop_modifications AS modification
       ON modification.id = target.modification_id AND modification.active = TRUE AND modification.visible = TRUE
      AND modification.product_id = product.id
      AND modification.connection_id = $2 AND modification.generation = $3
     WHERE target.campaign_id = $1`,
    [id, campaign.current_connection_id, campaign.current_generation]
  );
  if (!targets.rows.length || targets.rows.some((target) => (
    !target.current_product_id || (target.modification_id && !target.current_modification_id)
  ))) {
    throw new AppError(422, 'FORM_CAMPAIGN_TARGET_STALE', 'Один або кілька цільових товарів більше недоступні. Оновіть список.');
  }
}

export async function setFormCampaignStatus(id, status, actorUserId) {
  if (status === 'active') await assertCampaignCanActivate(id, pool);
  const result = await query(
    `UPDATE application_form_campaigns
     SET status = $2,
         published_at = CASE WHEN $2 = 'active' THEN COALESCE(published_at, NOW()) ELSE published_at END,
         updated_by = $3, updated_at = NOW()
     WHERE id = $1 AND archived_at IS NULL
     RETURNING id`,
    [id, status, actorUserId]
  );
  if (!result.rows[0]) throw new AppError(404, 'FORM_CAMPAIGN_NOT_FOUND', 'Розміщення не знайдено.');
  return loadFormCampaign(id);
}

export async function archiveFormCampaign(id, actorUserId) {
  const result = await query(
    `UPDATE application_form_campaigns
     SET status = 'paused', archived_at = NOW(), updated_by = $2, updated_at = NOW()
     WHERE id = $1 AND archived_at IS NULL
     RETURNING id`,
    [id, actorUserId]
  );
  if (!result.rows[0]) throw new AppError(404, 'FORM_CAMPAIGN_NOT_FOUND', 'Розміщення не знайдено.');
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

function stickerIds(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === 'string' || typeof item === 'number') return String(item);
    if (!item || typeof item !== 'object') return '';
    return String(item.id || item.externalId || item.value || '');
  }).filter(Boolean);
}

function productFromRow(row) {
  const modification = Boolean(row.modification_id);
  const productStickerIds = stickerIds(row.product_stickers);
  const modificationStickerIds = stickerIds(row.modification_stickers);
  return {
    id: row.product_id,
    modificationId: row.modification_id || null,
    title: localizedTitle(modification ? row.modification_titles : null) || localizedTitle(row.product_titles),
    url: cleanUrl((modification ? row.modification_page_url : '') || row.product_url || ''),
    imageUrl: cleanUrl((modification ? row.modification_image_url : '') || row.product_image_url || ''),
    price: cleanText((modification ? row.modification_price : '') || row.product_price || '', 120),
    oldPrice: cleanText((modification ? row.modification_old_price : '') || row.product_old_price || '', 120),
    currency: cleanText((modification ? row.modification_currency : '') || row.product_currency || '', 20),
    sku: cleanText((modification ? row.modification_sku : '') || row.product_sku || '', 160),
    productCode: cleanText((modification ? row.modification_external_id : '') || row.product_external_id || '', 160),
    availability: cleanText((modification ? row.modification_availability : '') || row.product_availability || '', 160),
    externalProductId: cleanText(row.product_external_id || '', 180),
    externalModificationId: cleanText(row.modification_external_id || '', 180),
    categoryExternalId: cleanText(row.product_category_external_id || '', 255),
    stickerIds: [...new Set([...productStickerIds, ...modificationStickerIds])],
    domain: cleanText(row.store_domain || '', 255)
  };
}

function campaignMatchesProduct(campaign, product) {
  const targetMode = campaign.target_mode || 'products';
  if (targetMode === 'all_products') return true;
  if (targetMode === 'category') return campaign.category_external_id === product.categoryExternalId;
  if (targetMode === 'sticker') return product.stickerIds.includes(campaign.sticker_external_id);
  return Boolean(campaign.matched_target_id);
}

function isOutOfStock(value) {
  return /(немає\s+(?:в\s+)?наявност|нет\s+(?:в\s+)?наличи|відсутн|out[\s_-]*of[\s_-]*stock|not[\s_-]*available|unavailable|sold[\s_-]*out)/iu
    .test(cleanText(value, 300));
}

async function resolveStorefrontProduct(connection, article, pageUrl, db = pool) {
  const normalizedArticle = cleanText(article, 300);
  const pathUrl = `${pageUrl.origin}${pageUrl.pathname}`.replace(/\/+$/u, '');
  const selectProduct = `SELECT product.id AS product_id, product.external_id AS product_external_id,
            product.sku AS product_sku, product.titles AS product_titles,
            product.category_external_id AS product_category_external_id,
            product.stickers AS product_stickers,
            product.price AS product_price, product.old_price AS product_old_price,
            product.currency AS product_currency, product.availability AS product_availability,
            product.primary_image_url AS product_image_url, product.canonical_url AS product_url,
            modification.id AS modification_id,
            modification.external_id AS modification_external_id,
            modification.sku AS modification_sku, modification.titles AS modification_titles,
            modification.price AS modification_price, modification.old_price AS modification_old_price,
            modification.currency AS modification_currency, modification.availability AS modification_availability,
            modification.stickers AS modification_stickers,
            modification.image_url AS modification_image_url, modification.page_url AS modification_page_url,
            $4::TEXT AS store_domain`;

  if (normalizedArticle) {
    const byArticle = await db.query(
      `${selectProduct}
       FROM search_horoshop_products AS product
       LEFT JOIN search_horoshop_modifications AS modification
         ON modification.product_id = product.id
        AND modification.connection_id = product.connection_id
        AND modification.generation = product.generation
        AND modification.active = TRUE AND modification.visible = TRUE
        AND LOWER(modification.sku) = LOWER($2)
       WHERE product.connection_id = $1 AND product.generation = $3
         AND product.active = TRUE AND product.visible = TRUE
         AND (LOWER(product.sku) = LOWER($2) OR modification.id IS NOT NULL)
       ORDER BY CASE WHEN modification.id IS NOT NULL THEN 1 ELSE 2 END
       LIMIT 2`,
      [connection.id, normalizedArticle, connection.generation, connection.store_domain]
    );
    if (byArticle.rows.length === 1) return productFromRow(byArticle.rows[0]);
    if (byArticle.rows.length > 1) return null;
  }

  const byModificationUrl = await db.query(
    `${selectProduct}
     FROM search_horoshop_products AS product
     JOIN search_horoshop_modifications AS modification
       ON modification.product_id = product.id
      AND modification.connection_id = product.connection_id
      AND modification.generation = product.generation
      AND modification.active = TRUE AND modification.visible = TRUE
     WHERE product.connection_id = $1 AND product.generation = $3
       AND product.active = TRUE AND product.visible = TRUE
       AND LOWER(COALESCE(modification.page_url, '')) IN (LOWER($2), LOWER($2 || '/'))
     LIMIT 2`,
    [connection.id, pathUrl, connection.generation, connection.store_domain]
  );
  if (byModificationUrl.rows.length === 1) return productFromRow(byModificationUrl.rows[0]);

  const byProductUrl = await db.query(
    `SELECT product.id AS product_id, product.external_id AS product_external_id,
            product.sku AS product_sku, product.titles AS product_titles,
            product.category_external_id AS product_category_external_id,
            product.stickers AS product_stickers,
            product.price AS product_price, product.old_price AS product_old_price,
            product.currency AS product_currency, product.availability AS product_availability,
            product.primary_image_url AS product_image_url, product.canonical_url AS product_url,
            NULL::UUID AS modification_id,
            NULL::TEXT AS modification_external_id,
            NULL::TEXT AS modification_sku, NULL::JSONB AS modification_titles,
            NULL::TEXT AS modification_price, NULL::TEXT AS modification_old_price,
            NULL::TEXT AS modification_currency, NULL::TEXT AS modification_availability,
            NULL::JSONB AS modification_stickers,
            NULL::TEXT AS modification_image_url, NULL::TEXT AS modification_page_url,
            $3::TEXT AS store_domain
     FROM search_horoshop_products AS product
     WHERE product.connection_id = $1 AND product.generation = $2
       AND product.active = TRUE AND product.visible = TRUE
       AND LOWER(COALESCE(product.canonical_url, '')) IN (LOWER($4), LOWER($4 || '/'))
     LIMIT 2`,
    [connection.id, connection.generation, connection.store_domain, pathUrl]
  );
  return byProductUrl.rows.length === 1 ? productFromRow(byProductUrl.rows[0]) : null;
}

function createContextToken(campaign, product) {
  return jwt.sign({
    purpose: 'application_form_campaign',
    campaignId: campaign.id,
    campaignPublicId: campaign.public_id,
    formId: campaign.form_id,
    productId: product.id,
    modificationId: product.modificationId || ''
  }, env.JWT_SECRET, { issuer: tokenIssuer, audience: tokenAudience, expiresIn: '10m' });
}

function verifyContextToken(token) {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { issuer: tokenIssuer, audience: tokenAudience });
    if (payload.purpose !== 'application_form_campaign') throw new Error('Invalid token purpose');
    return payload;
  } catch {
    throw new AppError(422, 'FORM_CAMPAIGN_CONTEXT_INVALID', 'Сторінка товару змінилася. Оновіть її та спробуйте ще раз.');
  }
}

export async function resolvePublicFormCampaign({ pageUrl: rawPageUrl, article = '', requestOrigin = '' }) {
  const pageUrl = normalizedPageUrl(rawPageUrl);
  if (!pageUrl) throw new AppError(422, 'FORM_CAMPAIGN_PAGE_URL_INVALID', 'Не вдалося визначити сторінку товару.');
  const connection = await currentConnection();
  if (!connection || !['connected', 'syncing'].includes(connection.status)
    || !sameStoreHost(pageUrl.hostname, connection.store_domain)) return null;
  const originUrl = normalizedPageUrl(requestOrigin);
  if (originUrl && !sameStoreHost(originUrl.hostname, connection.store_domain)) return null;
  const product = await resolveStorefrontProduct(connection, article, pageUrl);
  if (!product) return null;
  const result = await query(
    `SELECT campaign.*, form.public_id AS form_public_id, form.name AS form_name,
            target.id AS matched_target_id
     FROM application_form_campaigns AS campaign
     JOIN application_forms AS form ON form.id = campaign.form_id
     LEFT JOIN application_form_campaign_targets AS target
       ON target.campaign_id = campaign.id
      AND target.product_id = $3
      AND (target.modification_id IS NULL OR target.modification_id = $4)
     WHERE campaign.status = 'active' AND campaign.archived_at IS NULL
       AND campaign.connection_id = $1 AND campaign.connection_generation = $2
       AND form.form_type = 'simple' AND form.status = 'published'
       AND (campaign.starts_at IS NULL OR campaign.starts_at <= NOW())
       AND (campaign.ends_at IS NULL OR campaign.ends_at > NOW())
     ORDER BY campaign.priority DESC, campaign.updated_at DESC`,
    [connection.id, connection.generation, product.id, product.modificationId]
  );
  const campaign = result.rows.find((row) => (
    campaignMatchesProduct(row, product)
    && (row.availability_mode !== 'out_of_stock' || isOutOfStock(product.availability))
  ));
  if (!campaign) return null;
  return {
    campaign: {
      publicId: campaign.public_id,
      name: campaign.name,
      buttonText: campaign.button_text,
      buttonStyles: normalizeButtonStyles(campaign.button_styles),
      placement: normalizePlacement(campaign.placement)
    },
    form: { publicId: campaign.form_public_id, name: campaign.form_name },
    product: {
      title: product.title,
      url: product.url || pageUrl.href,
      imageUrl: product.imageUrl,
      price: product.price,
      oldPrice: product.oldPrice,
      currency: product.currency,
      sku: product.sku,
      productCode: product.productCode,
      availability: product.availability,
      externalProductId: product.externalProductId,
      externalModificationId: product.externalModificationId,
      domain: product.domain
    },
    contextToken: createContextToken(campaign, product)
  };
}

async function loadProductByIds(campaign, productId, modificationId, db = pool) {
  const result = await db.query(
    `SELECT product.id AS product_id, product.external_id AS product_external_id,
            product.sku AS product_sku, product.titles AS product_titles,
            product.category_external_id AS product_category_external_id,
            product.stickers AS product_stickers,
            product.price AS product_price, product.old_price AS product_old_price,
            product.currency AS product_currency, product.availability AS product_availability,
            product.primary_image_url AS product_image_url, product.canonical_url AS product_url,
            modification.id AS modification_id,
            modification.external_id AS modification_external_id,
            modification.sku AS modification_sku, modification.titles AS modification_titles,
            modification.price AS modification_price, modification.old_price AS modification_old_price,
            modification.currency AS modification_currency, modification.availability AS modification_availability,
            modification.stickers AS modification_stickers,
            modification.image_url AS modification_image_url, modification.page_url AS modification_page_url,
            connection.store_domain
     FROM search_horoshop_products AS product
     JOIN search_horoshop_connections AS connection ON connection.id = product.connection_id
     LEFT JOIN search_horoshop_modifications AS modification
       ON modification.id = $2 AND modification.product_id = product.id
      AND modification.connection_id = product.connection_id
      AND modification.generation = product.generation
      AND modification.active = TRUE AND modification.visible = TRUE
     WHERE product.id = $1 AND product.connection_id = $3 AND product.generation = $4
       AND product.active = TRUE AND product.visible = TRUE
       AND ($2::UUID IS NULL OR modification.id IS NOT NULL)
     LIMIT 1`,
    [productId, modificationId, campaign.connection_id, campaign.connection_generation]
  );
  return result.rows[0] ? productFromRow(result.rows[0]) : null;
}

export async function resolveFormCampaignSubmission({ publicId, contextToken, sourceUrl = '', requestOrigin = '' }) {
  const token = verifyContextToken(contextToken);
  if (token.campaignPublicId !== publicId) {
    throw new AppError(422, 'FORM_CAMPAIGN_CONTEXT_INVALID', 'Цей контекст не належить обраному розміщенню.');
  }
  const result = await query(
    `SELECT campaign.*, form.public_id AS form_public_id, form.name AS form_name,
            connection.store_domain, connection.status AS connection_status,
            connection.generation AS current_generation
     FROM application_form_campaigns AS campaign
     JOIN application_forms AS form ON form.id = campaign.form_id
     JOIN search_horoshop_connections AS connection ON connection.id = campaign.connection_id
     WHERE campaign.id = $1 AND campaign.public_id = $2
       AND campaign.form_id = $3 AND campaign.status = 'active'
       AND campaign.archived_at IS NULL AND form.form_type = 'simple' AND form.status = 'published'
       AND (campaign.starts_at IS NULL OR campaign.starts_at <= NOW())
       AND (campaign.ends_at IS NULL OR campaign.ends_at > NOW())
     LIMIT 1`,
    [token.campaignId, publicId, token.formId]
  );
  const campaign = result.rows[0];
  if (!campaign || !['connected', 'syncing'].includes(campaign.connection_status)
    || campaign.connection_generation !== campaign.current_generation) {
    throw new AppError(409, 'FORM_CAMPAIGN_INACTIVE', 'Це розміщення вже неактивне. Оновіть сторінку.');
  }
  const modificationId = token.modificationId || null;
  const product = await loadProductByIds(campaign, token.productId, modificationId);
  if (!product) throw new AppError(409, 'FORM_CAMPAIGN_PRODUCT_CHANGED', 'Товар або модифікація більше недоступні.');
  let matchedTargetId = null;
  if ((campaign.target_mode || 'products') === 'products') {
    const target = await query(
      `SELECT id FROM application_form_campaign_targets
       WHERE campaign_id = $1 AND product_id = $2
         AND (modification_id IS NULL OR modification_id = $3)
       LIMIT 1`,
      [campaign.id, token.productId, modificationId]
    );
    matchedTargetId = target.rows[0]?.id || null;
  }
  if (!campaignMatchesProduct({ ...campaign, matched_target_id: matchedTargetId }, product)) {
    throw new AppError(409, 'FORM_CAMPAIGN_TARGET_CHANGED', 'Умови показу цієї кнопки для товару змінилися.');
  }
  if (campaign.availability_mode === 'out_of_stock' && !isOutOfStock(product.availability)) {
    throw new AppError(409, 'FORM_CAMPAIGN_PRODUCT_AVAILABLE', 'Це розміщення доступне лише для товарів, яких немає в наявності.');
  }
  const pageUrl = normalizedPageUrl(sourceUrl);
  const originUrl = normalizedPageUrl(requestOrigin);
  if (!pageUrl || !sameStoreHost(pageUrl.hostname, campaign.store_domain)
    || (originUrl && !sameStoreHost(originUrl.hostname, campaign.store_domain))) {
    throw new AppError(422, 'FORM_CAMPAIGN_STORE_MISMATCH', 'Заявка має надсилатися з підключеного магазину.');
  }
  const form = await loadPublishedForm(campaign.form_public_id);
  if (!form) throw new AppError(404, 'FORM_NOT_FOUND', 'Форма більше недоступна.');
  return { campaign, form, product };
}

export function formCampaignEmbedScript(origin) {
  return `(() => {
  if (window.__mtApplicationFormCampaignsLoaded) return;
  window.__mtApplicationFormCampaignsLoaded = true;
  const apiOrigin = ${JSON.stringify(origin)};
  let button = null;
  let resolveTimer = null;
  let lastKey = '';

  function endpoint(path) { return new URL('/api/public/application-form-campaigns' + path, apiOrigin || location.href); }
  function formLoaderUrl() { return new URL('/api/public/application-forms/loader.js', apiOrigin || location.href).href; }
  function article() {
    const direct = document.querySelector('[itemprop="sku"], meta[property="product:retailer_item_id"], [data-product-article]');
    const directValue = direct?.content || direct?.dataset?.productArticle || direct?.textContent;
    if (String(directValue || '').trim()) return String(directValue).trim();
    for (const node of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const data = JSON.parse(node.textContent || '{}');
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          if (item?.sku) return String(item.sku).trim();
          if (item?.offers?.sku) return String(item.offers.sku).trim();
        }
      } catch {}
    }
    return '';
  }
  function isMobileSurface() {
    const ua = String(navigator.userAgent || '');
    const mobileUa = /Android|iPhone|iPod|IEMobile|Opera Mini|Mobile/iu.test(ua)
      || (/Macintosh/iu.test(ua) && Number(navigator.maxTouchPoints) > 1);
    return innerWidth <= 760 && mobileUa;
  }
  function removeButton() { if (button) button.remove(); button = null; }
  function ensureLoader() {
    if (window.MTApplicationForms) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-mt-application-loader="true"]');
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = formLoaderUrl(); script.async = true; script.dataset.mtApplicationLoader = 'true';
      script.onload = resolve; script.onerror = reject; document.head.appendChild(script);
    });
  }
  function insert(node, target, position) {
    if (position === 'before') target.before(node);
    else if (position === 'after') target.after(node);
    else if (position === 'start') target.prepend(node);
    else target.append(node);
  }
  function render(payload) {
    removeButton();
    const device = isMobileSurface() ? 'mobile' : 'desktop';
    const placement = payload.campaign.placement[device];
    let target;
    try { target = document.querySelector(placement.selector); } catch { return false; }
    if (!target) return false;
    button = document.createElement('button');
    button.type = 'button'; button.className = 'mt-application-campaign-button';
    button.textContent = payload.campaign.buttonText;
    Object.assign(button.style, payload.campaign.buttonStyles || {}, {
      border: '0', cursor: 'pointer', fontFamily: 'inherit'
    });
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await ensureLoader();
        window.MTApplicationForms?.open({
          formId: payload.form.publicId,
          product: payload.product,
          submitUrl: endpoint('/' + encodeURIComponent(payload.campaign.publicId) + '/applications').href,
          contextToken: payload.contextToken,
          context: { campaignPublicId: payload.campaign.publicId, campaignName: payload.campaign.name }
        });
      } finally { button.disabled = false; }
    });
    insert(button, target, placement.insertPosition);
    return true;
  }
  async function resolveCampaign(force = false) {
    const key = location.href + '|' + article() + '|' + (isMobileSurface() ? 'mobile' : 'desktop');
    if (!force && key === lastKey && button?.isConnected) return;
    lastKey = key;
    try {
      const url = endpoint('/resolve');
      url.searchParams.set('pageUrl', location.href);
      url.searchParams.set('article', article());
      const response = await fetch(url, { credentials: 'omit' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.data) { removeButton(); return; }
      if (!render(body.data)) schedule(true);
    } catch { removeButton(); }
  }
  function schedule(force = false) {
    clearTimeout(resolveTimer);
    resolveTimer = setTimeout(() => resolveCampaign(force), 140);
  }
  const observer = new MutationObserver(() => schedule(false));
  observer.observe(document.documentElement, { childList: true, subtree: true });
  addEventListener('resize', () => schedule(true), { passive: true });
  addEventListener('popstate', () => schedule(true));
  for (const method of ['pushState', 'replaceState']) {
    const original = history[method];
    history[method] = function(...args) { const value = original.apply(this, args); schedule(true); return value; };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => schedule(true), { once: true });
  else schedule(true);
})();`;
}
