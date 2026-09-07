import { createHash, randomUUID } from 'node:crypto';
import * as XLSX from 'xlsx';
import { pool, query } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import { loadPromoCodeRow, promoCodeSnapshot } from '../promo-codes/promo-code.service.js';

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
  promoFormat: 'notification',
  desktopPosition: 'bottom_left',
  mobilePosition: 'bottom',
  accentColor: '#6d5dfc',
  backgroundColor: '#ffffff',
  textColor: '#172033',
  mutedColor: '#667085',
  primaryButtonBackgroundColor: '#6d5dfc',
  primaryButtonTextColor: '#ffffff',
  secondaryButtonBackgroundColor: '#ffffff',
  secondaryButtonTextColor: '#172033',
  checkboxAccentColor: '#6d5dfc',
  checkboxCheckColor: '#ffffff',
  checkboxTextColor: '#172033',
  timelineColor: '#6d5dfc',
  timelineTrackColor: '#ede9fe',
  showPromoTitle: false,
  eyebrowFontSize: 12,
  titleFontSize: 34,
  bodyFontSize: 16,
  acknowledgementFontSize: 14,
  buttonFontSize: 16,
  buttonBorderRadius: 12,
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
  targetPageUrl: '',
  urlContains: [],
  recommendationLimit: 6
};

const defaultBehavior = {
  trigger: 'delay',
  delayMs: 300,
  scrollPercent: 35,
  inactivitySeconds: 8,
  frequency: 'product',
  cooldownHours: 24,
  cooldownDays: 7,
  maxShowsPerSession: 0,
  device: 'all',
  autoCloseSeconds: 0,
  rotationSeconds: 6,
  activeWeekdays: [1, 2, 3, 4, 5, 6, 7],
  dailyStartTime: '',
  dailyEndTime: '',
  scheduleTimezone: 'Europe/Kyiv',
  dismissible: true,
  requireAcknowledgement: false,
  buttonCount: 2
};

const defaultFormConfig = {
  fields: [
    { id: 'name', type: 'text', label: 'Імʼя', placeholder: 'Ваше імʼя', required: true, options: [] },
    { id: 'phone', type: 'phone', label: 'Телефон', placeholder: '+380', required: true, options: [] }
  ],
  submitLabel: 'Отримати промокод',
  successTitle: 'Ваш промокод готовий',
  successBody: 'Скопіюйте код і використайте його під час оформлення замовлення.'
};

const eventStatsKey = {
  impression: 'impressions',
  dismiss: 'dismissals',
  click: 'clicks',
  acknowledge: 'acknowledgements',
  copy: 'copies',
  promo_cta: 'promoCtaClicks'
};

function normalizeCampaignType(value, targeting = {}) {
  if (value === 'exit_offer') return 'message';
  if (object(targeting).mode === 'out_of_stock' && !['product_promo', 'promo_code', 'lead_form'].includes(value)) {
    return 'out_of_stock_recommendations';
  }
  if (['message', 'out_of_stock_recommendations', 'product_promo', 'promo_code', 'lead_form'].includes(value)) return value;
  return 'message';
}

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
  const accentColor = color(source.accentColor, defaultStyles.accentColor);
  const backgroundColor = color(source.backgroundColor, defaultStyles.backgroundColor);
  const textColor = color(source.textColor, defaultStyles.textColor);
  return {
    layout: ['modal', 'bottom-sheet', 'corner'].includes(source.layout) ? source.layout : defaultStyles.layout,
    promoFormat: ['notification', 'compact', 'standard', 'wide', 'custom'].includes(source.promoFormat)
      ? source.promoFormat : defaultStyles.promoFormat,
    desktopPosition: ['top_left', 'top_right', 'bottom_left', 'bottom_right'].includes(source.desktopPosition)
      ? source.desktopPosition : defaultStyles.desktopPosition,
    mobilePosition: ['top', 'bottom'].includes(source.mobilePosition)
      ? source.mobilePosition : defaultStyles.mobilePosition,
    accentColor,
    backgroundColor,
    textColor,
    mutedColor: color(source.mutedColor, defaultStyles.mutedColor),
    primaryButtonBackgroundColor: color(source.primaryButtonBackgroundColor, accentColor),
    primaryButtonTextColor: color(source.primaryButtonTextColor, defaultStyles.primaryButtonTextColor),
    secondaryButtonBackgroundColor: color(source.secondaryButtonBackgroundColor, backgroundColor),
    secondaryButtonTextColor: color(source.secondaryButtonTextColor, textColor),
    checkboxAccentColor: color(source.checkboxAccentColor, accentColor),
    checkboxCheckColor: color(source.checkboxCheckColor, defaultStyles.checkboxCheckColor),
    checkboxTextColor: color(source.checkboxTextColor, textColor),
    timelineColor: color(source.timelineColor, accentColor),
    timelineTrackColor: color(source.timelineTrackColor, defaultStyles.timelineTrackColor),
    showPromoTitle: source.showPromoTitle === true,
    eyebrowFontSize: Math.min(32, Math.max(8, Number(source.eyebrowFontSize) || defaultStyles.eyebrowFontSize)),
    titleFontSize: Math.min(72, Math.max(18, Number(source.titleFontSize) || defaultStyles.titleFontSize)),
    bodyFontSize: Math.min(36, Math.max(10, Number(source.bodyFontSize) || defaultStyles.bodyFontSize)),
    acknowledgementFontSize: Math.min(28, Math.max(10, Number(source.acknowledgementFontSize) || defaultStyles.acknowledgementFontSize)),
    buttonFontSize: Math.min(28, Math.max(10, Number(source.buttonFontSize) || defaultStyles.buttonFontSize)),
    buttonBorderRadius: Math.min(40, Math.max(0, Number.isFinite(Number(source.buttonBorderRadius))
      ? Number(source.buttonBorderRadius) : defaultStyles.buttonBorderRadius)),
    borderRadius: Math.min(40, Math.max(0, Number(source.borderRadius) || defaultStyles.borderRadius)),
    maxWidth: Math.min(1400, Math.max(320, Number(source.maxWidth) || defaultStyles.maxWidth))
  };
}

function normalizeTargeting(value) {
  const source = object(value);
  return {
    mode: ['all_pages', 'all_products', 'products', 'rules', 'target_page', 'out_of_stock'].includes(source.mode)
      ? source.mode : defaultTargeting.mode,
    match: source.match === 'any' ? 'any' : 'all',
    stickers: stringList(source.stickers),
    brands: stringList(source.brands),
    categoryIds: stringList(source.categoryIds),
    conditions: stringList(source.conditions),
    targetPageUrl: normalizeTargetPageUrl(source.targetPageUrl),
    urlContains: stringList(source.urlContains, 30).map((item) => item.toLocaleLowerCase('uk-UA')),
    recommendationLimit: Math.min(8, Math.max(3, Number(source.recommendationLimit) || defaultTargeting.recommendationLimit))
  };
}

function normalizeBehavior(value) {
  const source = object(value);
  const activeWeekdays = [...new Set(array(source.activeWeekdays)
    .map(Number).filter((day) => Number.isInteger(day) && day >= 1 && day <= 7))].sort();
  return {
    trigger: ['delay', 'scroll', 'inactivity', 'exit_intent'].includes(source.trigger) ? source.trigger : defaultBehavior.trigger,
    delayMs: Math.min(60_000, Math.max(0, Number(source.delayMs) || 0)),
    scrollPercent: Math.min(100, Math.max(5, Number(source.scrollPercent) || defaultBehavior.scrollPercent)),
    inactivitySeconds: Math.min(300, Math.max(1, Number(source.inactivitySeconds) || defaultBehavior.inactivitySeconds)),
    frequency: ['always', 'session', 'product', 'hours', 'days'].includes(source.frequency)
      ? source.frequency : defaultBehavior.frequency,
    cooldownHours: Math.min(8760, Math.max(1, Number(source.cooldownHours) || defaultBehavior.cooldownHours)),
    cooldownDays: Math.min(365, Math.max(1, Number(source.cooldownDays) || defaultBehavior.cooldownDays)),
    maxShowsPerSession: Math.min(20, Math.max(0, Number(source.maxShowsPerSession) || 0)),
    device: ['all', 'desktop', 'mobile'].includes(source.device) ? source.device : defaultBehavior.device,
    autoCloseSeconds: Math.min(300, Math.max(0, Number(source.autoCloseSeconds) || 0)),
    rotationSeconds: Math.min(60, Math.max(2, Number(source.rotationSeconds) || defaultBehavior.rotationSeconds)),
    activeWeekdays: activeWeekdays.length ? activeWeekdays : defaultBehavior.activeWeekdays,
    dailyStartTime: /^([01]\d|2[0-3]):[0-5]\d$/u.test(String(source.dailyStartTime || ''))
      ? String(source.dailyStartTime) : '',
    dailyEndTime: /^([01]\d|2[0-3]):[0-5]\d$/u.test(String(source.dailyEndTime || ''))
      ? String(source.dailyEndTime) : '',
    scheduleTimezone: ['Europe/Kyiv', 'Europe/Warsaw', 'Europe/Berlin', 'UTC'].includes(source.scheduleTimezone)
      ? source.scheduleTimezone : defaultBehavior.scheduleTimezone,
    dismissible: source.dismissible !== false,
    requireAcknowledgement: source.requireAcknowledgement === true,
    buttonCount: Number(source.buttonCount) === 1 ? 1 : defaultBehavior.buttonCount
  };
}

function campaignSnapshot(row, targets = [], promoProducts = []) {
  return {
    campaignType: normalizeCampaignType(row.campaign_type, row.targeting),
    name: row.name,
    status: row.status,
    priority: Number(row.priority),
    content: normalizeContent(row.content),
    styles: normalizeStyles(row.styles),
    targeting: normalizeTargeting(row.targeting),
    behavior: normalizeBehavior(row.behavior),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    targets,
    promoProducts,
    promoCodeId: row.promo_code_id || null,
    promoCode: object(row.promo_code_draft_snapshot),
    publishedPromoCode: object(row.promo_code_published_snapshot),
    formConfig: normalizeFormConfig(row.form_config),
    publishedFormConfig: object(row.form_published_snapshot)
  };
}

function normalizeFormConfig(value) {
  const source = object(value);
  const usedIds = new Set();
  const fields = array(source.fields).flatMap((candidate) => {
    const field = object(candidate);
    const id = String(field.id || '').trim().slice(0, 64);
    const type = ['text', 'email', 'phone', 'textarea', 'select', 'checkbox'].includes(field.type)
      ? field.type : 'text';
    const label = String(field.label || '').trim().slice(0, 120);
    if (!/^[a-z][a-z0-9_-]{0,63}$/iu.test(id) || usedIds.has(id) || !label) return [];
    usedIds.add(id);
    return [{
      id,
      type,
      label,
      placeholder: String(field.placeholder || '').trim().slice(0, 200),
      required: field.required === true,
      options: type === 'select' ? stringList(field.options, 20).map((item) => item.slice(0, 80)) : []
    }];
  }).slice(0, 12);
  return {
    fields,
    submitLabel: String(source.submitLabel ?? defaultFormConfig.submitLabel).trim().slice(0, 120)
      || defaultFormConfig.submitLabel,
    successTitle: String(source.successTitle ?? defaultFormConfig.successTitle).trim().slice(0, 240),
    successBody: String(source.successBody ?? defaultFormConfig.successBody).trim().slice(0, 1000)
  };
}

function storefrontImageUrl(value) {
  const candidate = String(value || '').trim();
  if (!candidate) return '';
  try {
    const url = new URL(candidate);
    url.pathname = url.pathname.replace(/_\+[0-9a-f]{6,}(?=\.[a-z0-9]+$)/iu, '');
    return url.toString();
  } catch {
    return candidate.replace(/_\+[0-9a-f]{6,}(?=\.[a-z0-9]+(?:[?#]|$))/iu, '');
  }
}

function isWithinBehaviorSchedule(value, now = new Date()) {
  const behavior = normalizeBehavior(value);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: behavior.scheduleTimezone,
    weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(now).map((part) => [part.type, part.value]));
  const weekday = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[parts.weekday];
  if (!behavior.activeWeekdays.includes(weekday)) return false;
  if (!behavior.dailyStartTime || !behavior.dailyEndTime) return true;
  const current = `${parts.hour}:${parts.minute}`;
  return behavior.dailyStartTime <= behavior.dailyEndTime
    ? current >= behavior.dailyStartTime && current < behavior.dailyEndTime
    : current >= behavior.dailyStartTime || current < behavior.dailyEndTime;
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

function serializePromoProduct(row) {
  const hasModification = Boolean(row.modification_id);
  const sourceData = hasModification ? row.modification_source_data : row.product_source_data;
  const productSourceData = row.product_source_data;
  const price = hasModification ? row.modification_price : row.product_price;
  const oldPrice = hasModification
    ? row.modification_old_price || sourceOldPrice(sourceData) || row.product_old_price || sourceOldPrice(productSourceData)
    : row.product_old_price || sourceOldPrice(productSourceData);
  const availability = hasModification ? row.modification_availability : row.product_availability;
  return {
    id: row.id,
    productId: row.product_id,
    modificationId: row.modification_id || null,
    productExternalId: row.product_external_id,
    modificationExternalId: row.modification_external_id || null,
    position: Number(row.position),
    sku: (hasModification ? row.modification_sku : row.product_sku) || '',
    article: (hasModification ? row.modification_sku : row.product_sku) || '',
    title: localizedTitle(hasModification ? row.modification_titles : row.product_titles)
      || localizedTitle(row.product_titles),
    imageUrl: storefrontImageUrl(
      (hasModification ? row.modification_image_url : row.product_image_url) || row.product_image_url || ''
    ),
    pageUrl: (hasModification ? row.modification_page_url : row.product_page_url) || row.product_page_url || '',
    price: price || '',
    oldPrice: oldPrice || '',
    currency: (hasModification ? row.modification_currency : row.product_currency) || row.product_currency || '',
    availability: availability || '',
    visible: (hasModification ? row.modification_visible : row.product_visible) !== false,
    available: isAvailable(availability),
    buyId: sourceIdentifier(sourceData, sourceIdentifier(productSourceData, row.modification_external_id || row.product_external_id))
  };
}

function serializeCampaign(row, targets = [], promoProducts = []) {
  return {
    id: row.id,
    publicId: row.public_id,
    campaignType: normalizeCampaignType(row.campaign_type, row.targeting),
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
    promoProducts: promoProducts.map(serializePromoProduct),
    promoCodeId: row.promo_code_id || null,
    promoCode: Object.keys(object(row.promo_code_draft_snapshot)).length ? object(row.promo_code_draft_snapshot) : null,
    publishedPromoCode: Object.keys(object(row.promo_code_published_snapshot)).length ? object(row.promo_code_published_snapshot) : null,
    formConfig: normalizeFormConfig(row.form_config),
    publishedFormConfig: Object.keys(object(row.form_published_snapshot)).length
      ? normalizeFormConfig(row.form_published_snapshot) : null,
    stats: {
      impressions: Number(row.impressions || 0),
      dismissals: Number(row.dismissals || 0),
      clicks: Number(row.clicks || 0),
      acknowledgements: Number(row.acknowledgements || 0),
      copies: Number(row.copies || 0),
      promoCtaClicks: Number(row.promoCtaClicks || 0),
      contacts: Number(row.contacts || 0)
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
  const contacts = await db.query(
    'SELECT COUNT(*) AS count FROM popup_banner_contacts WHERE campaign_id = $1',
    [id]
  );
  row.contacts = Number(contacts.rows[0]?.count || 0);
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
  const contactStatsResult = await query(
    'SELECT campaign_id, COUNT(*) AS count FROM popup_banner_contacts GROUP BY campaign_id'
  );
  for (const item of contactStatsResult.rows) {
    const current = stats.get(item.campaign_id) || {};
    current.contacts = Number(item.count);
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
  return Promise.all(result.rows.map(async (row) => serializeCampaign(
    { ...row, ...(stats.get(row.id) || {}) },
    grouped.get(row.id) || [],
    await loadPromoProducts(row.id)
  )));
}

export async function getPopupCampaign(id) {
  const row = await loadCampaignRow(id);
  const [targets, promoProducts] = await Promise.all([loadTargets(id), loadPromoProducts(id)]);
  return serializeCampaign(row, targets, promoProducts);
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

async function resolvePromoItems(items, connectionId, generation, db) {
  const resolved = [];
  const unmatched = [];
  const seen = new Set();
  for (const [position, reference] of array(items).entries()) {
    const productExternalId = String(reference?.productExternalId || '').trim();
    const modificationExternalId = String(reference?.modificationExternalId || '').trim() || null;
    const itemKey = JSON.stringify([productExternalId, modificationExternalId]);
    if (!productExternalId || seen.has(itemKey)) continue;
    seen.add(itemKey);
    const match = await db.query(
      `SELECT product.id AS product_id, modification.id AS modification_id
       FROM search_horoshop_products AS product
       LEFT JOIN search_horoshop_modifications AS modification
         ON modification.product_id = product.id
        AND modification.connection_id = $1 AND modification.generation = $2
        AND modification.active = TRUE AND modification.external_id = $4
       WHERE product.connection_id = $1 AND product.generation = $2
         AND product.active = TRUE AND product.external_id = $3
         AND ($4::TEXT IS NULL OR modification.id IS NOT NULL)
       LIMIT 1`,
      [connectionId, generation, productExternalId, modificationExternalId]
    );
    if (!match.rows[0]) {
      unmatched.push({ productExternalId, modificationExternalId });
      continue;
    }
    resolved.push({
      productId: match.rows[0].product_id,
      modificationId: modificationExternalId ? match.rows[0].modification_id : null,
      itemKey,
      position
    });
  }
  return { items: resolved, unmatched };
}

async function recordVersion(client, campaignId, actorUserId) {
  const row = await loadCampaignRow(campaignId, client);
  const [targets, promoProducts] = await Promise.all([
    loadTargets(campaignId, client),
    loadPromoProducts(campaignId, client)
  ]);
  await client.query(
    `INSERT INTO popup_banner_versions (campaign_id, version_number, snapshot, created_by)
     SELECT $1, COALESCE(MAX(version_number), 0) + 1, $2::JSONB, $3
     FROM popup_banner_versions WHERE campaign_id = $1`,
    [campaignId, JSON.stringify(campaignSnapshot(
      row,
      targets.map(serializeTarget),
      promoProducts.map(serializePromoProduct)
    )), actorUserId]
  );
}

async function savePopupCampaign(existingId, input, actorUserId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const connectionResult = await client.query(
      `SELECT id, generation, store_domain FROM search_horoshop_connections
       WHERE singleton = TRUE LIMIT 1 FOR UPDATE`
    );
    const connection = connectionResult.rows[0] || null;
    if (!connection) throw new AppError(409, 'HOROSHOP_NOT_CONNECTED', 'Підключіть магазин Хорошоп перед створенням попап-кампанії.');
    const campaignType = normalizeCampaignType(input.campaignType, input.targeting);
    const content = normalizeContent(input.content);
    const styles = normalizeStyles(input.styles);
    const targeting = normalizeTargeting(input.targeting);
    validateTargetPage(targeting, connection.store_domain);
    const behavior = normalizeBehavior(input.behavior);
    const formConfig = normalizeFormConfig(input.formConfig);
    if (['product_promo', 'out_of_stock_recommendations'].includes(campaignType) && behavior.trigger === 'exit_intent') {
      behavior.trigger = 'delay';
    }
    if (campaignType === 'lead_form' && formConfig.fields.length === 0) {
      throw new AppError(422, 'POPUP_FORM_FIELDS_EMPTY', 'Додайте хоча б одне поле до контактної форми.');
    }
    let selectedPromoCode = null;
    if (['promo_code', 'lead_form'].includes(campaignType)) {
      selectedPromoCode = await loadPromoCodeRow(input.promoCodeId, connection.id, client, true);
    }
    const draftPromoCodeSnapshot = selectedPromoCode ? promoCodeSnapshot(selectedPromoCode) : null;
    const startsAt = input.startsAt || null;
    const endsAt = input.endsAt || null;
    let id = existingId;
    if (id) {
      const updated = await client.query(
        `UPDATE popup_banner_campaigns
         SET connection_id = $2, connection_generation = $3, campaign_type = $4,
              name = $5, priority = $6, content = $7::JSONB, styles = $8::JSONB,
              targeting = $9::JSONB, behavior = $10::JSONB, starts_at = $11, ends_at = $12,
              promo_code_id = $13, promo_code_draft_snapshot = $14::JSONB,
              promo_code_published_snapshot = CASE WHEN $4 IN ('promo_code', 'lead_form') THEN promo_code_published_snapshot ELSE NULL END,
              form_config = $15::JSONB,
              form_published_snapshot = CASE WHEN $4 = 'lead_form' THEN form_published_snapshot ELSE NULL END,
              updated_by = $16, updated_at = NOW()
         WHERE id = $1 RETURNING id`,
        [id, connection.id, connection.generation, campaignType, input.name, input.priority,
          JSON.stringify(content), JSON.stringify(styles), JSON.stringify(targeting),
          JSON.stringify(behavior), startsAt, endsAt, selectedPromoCode?.id || null,
          draftPromoCodeSnapshot ? JSON.stringify(draftPromoCodeSnapshot) : null,
          JSON.stringify(formConfig), actorUserId]
      );
      if (!updated.rows[0]) throw new AppError(404, 'POPUP_CAMPAIGN_NOT_FOUND', 'Попап-кампанію не знайдено.');
    } else {
      id = randomUUID();
      await client.query(
        `INSERT INTO popup_banner_campaigns (
           id, connection_id, connection_generation, campaign_type, name, priority, content, styles,
            targeting, behavior, starts_at, ends_at, promo_code_id, promo_code_draft_snapshot,
            form_config, created_by, updated_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::JSONB, $8::JSONB, $9::JSONB, $10::JSONB, $11, $12, $13, $14::JSONB, $15::JSONB, $16, $16)`,
        [id, connection.id, connection.generation, campaignType, input.name, input.priority,
          JSON.stringify(content), JSON.stringify(styles), JSON.stringify(targeting),
          JSON.stringify(behavior), startsAt, endsAt, selectedPromoCode?.id || null,
          draftPromoCodeSnapshot ? JSON.stringify(draftPromoCodeSnapshot) : null,
          JSON.stringify(formConfig), actorUserId]
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

    await client.query('DELETE FROM popup_banner_promo_products WHERE campaign_id = $1', [id]);
    const promoResolution = campaignType === 'product_promo'
      ? await resolvePromoItems(input.promoItems || [], connection.id, connection.generation, client)
      : { items: [], unmatched: [] };
    for (const item of promoResolution.items) {
      await client.query(
        `INSERT INTO popup_banner_promo_products (
           campaign_id, product_id, modification_id, item_key, position
         ) VALUES ($1, $2, $3, $4, $5)`,
        [id, item.productId, item.modificationId, item.itemKey, item.position]
      );
    }
    if (campaignType === 'product_promo' && promoResolution.items.length === 0) {
      throw new AppError(422, 'POPUP_PROMO_PRODUCTS_EMPTY', 'Додайте хоча б один товар до промобанера.', {
        unmatched: promoResolution.unmatched
      });
    }
    await recordVersion(client, id, actorUserId);
    await client.query('COMMIT');
    const campaign = await getPopupCampaign(id);
    return {
      ...campaign,
      resolution: {
        unmatched: resolution.unmatched,
        unmatchedPromoProducts: promoResolution.unmatched
      }
    };
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
      'SELECT id, generation, store_domain FROM search_horoshop_connections WHERE singleton = TRUE LIMIT 1'
    );
    const current = campaign.rows[0] ? {
      ...campaign.rows[0],
      current_connection_id: connection.rows[0]?.id || null,
      current_generation: connection.rows[0]?.generation || null,
      current_store_domain: connection.rows[0]?.store_domain || ''
    } : null;
    if (!current) throw new AppError(404, 'POPUP_CAMPAIGN_NOT_FOUND', 'Попап-кампанію не знайдено.');
    const campaignType = normalizeCampaignType(current.campaign_type, current.targeting);
    if (status === 'active') {
      if (!current.current_connection_id || current.connection_id !== current.current_connection_id
        || current.connection_generation !== current.current_generation) {
        throw new AppError(409, 'POPUP_CATALOG_STALE', 'Кампанія належить до попереднього підключення Хорошоп. Збережіть її повторно для поточного каталогу.');
      }
      const targeting = normalizeTargeting(current.targeting);
      validateTargetPage(targeting, current.current_store_domain);
      if (targeting.mode === 'products') {
        const targets = await client.query('SELECT 1 FROM popup_banner_product_targets WHERE campaign_id = $1 LIMIT 1', [id]);
        if (!targets.rows[0]) throw new AppError(422, 'POPUP_TARGETS_EMPTY', 'Додайте хоча б один товар до кампанії.');
      }
      if (campaignType === 'product_promo') {
        const products = await client.query('SELECT 1 FROM popup_banner_promo_products WHERE campaign_id = $1 LIMIT 1', [id]);
        if (!products.rows[0]) throw new AppError(422, 'POPUP_PROMO_PRODUCTS_EMPTY', 'Додайте хоча б один товар до промобанера.');
      }
      if (['promo_code', 'lead_form'].includes(campaignType)) {
        if (!current.promo_code_id) {
          throw new AppError(422, 'POPUP_PROMO_CODE_EMPTY', 'Оберіть промокод для кампанії.');
        }
        const code = await loadPromoCodeRow(current.promo_code_id, current.current_connection_id, client, true);
        current.promo_code_published_snapshot = promoCodeSnapshot(code);
      }
      if (campaignType === 'lead_form') {
        const formConfig = normalizeFormConfig(current.form_config);
        if (!formConfig.fields.length) {
          throw new AppError(422, 'POPUP_FORM_FIELDS_EMPTY', 'Додайте хоча б одне поле до контактної форми.');
        }
        current.form_published_snapshot = formConfig;
      }
    }
    await client.query(
      `UPDATE popup_banner_campaigns
       SET status = $2::VARCHAR,
           published_at = CASE WHEN $2::VARCHAR = 'active' THEN COALESCE(published_at, NOW()) ELSE published_at END,
            promo_code_published_snapshot = CASE
              WHEN $2::VARCHAR = 'active' AND campaign_type IN ('promo_code', 'lead_form') THEN $4::JSONB
              ELSE promo_code_published_snapshot
            END,
            form_published_snapshot = CASE
              WHEN $2::VARCHAR = 'active' AND campaign_type = 'lead_form' THEN $5::JSONB
              ELSE form_published_snapshot
            END,
            updated_by = $3, updated_at = NOW()
       WHERE id = $1`,
      [id, status, actorUserId, current.promo_code_published_snapshot
        ? JSON.stringify(current.promo_code_published_snapshot) : null,
      current.form_published_snapshot ? JSON.stringify(current.form_published_snapshot) : null]
    );
    if (status === 'active') await recordVersion(client, id, actorUserId);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return getPopupCampaign(id);
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

function normalizedPagePath(url) {
  return url.pathname.replace(/\/+$/u, '') || '/';
}

function normalizeTargetPageUrl(value) {
  const url = normalizedPageUrl(value);
  if (!url) return '';
  url.pathname = url.pathname.replace(/\/+$/u, '') || '/';
  url.search = '';
  return url.href;
}

function sameStoreHost(left, right) {
  const normalize = (value) => String(value || '').toLowerCase().replace(/^www\./u, '');
  return normalize(left) === normalize(right);
}

function validateTargetPage(targeting, storeDomain) {
  if (targeting.mode !== 'target_page') return;
  const targetPage = normalizedPageUrl(targeting.targetPageUrl);
  if (!targetPage) {
    throw new AppError(422, 'POPUP_TARGET_PAGE_INVALID', 'Вкажіть коректне посилання цільової сторінки.');
  }
  if (!sameStoreHost(targetPage.hostname, storeDomain)) {
    throw new AppError(422, 'POPUP_TARGET_PAGE_STORE_MISMATCH', 'Цільова сторінка має належати підключеному магазину Хорошоп.');
  }
}

function matchesTargetPage(targetPageUrl, pageUrl) {
  const targetPage = normalizedPageUrl(targetPageUrl);
  return Boolean(targetPage
    && sameStoreHost(targetPage.hostname, pageUrl.hostname)
    && normalizedPagePath(targetPage) === normalizedPagePath(pageUrl));
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

function matchesTargeting(campaign, product, pageUrl, targets, stockState) {
  const targeting = normalizeTargeting(campaign.targeting);
  if (targeting.mode === 'target_page') return matchesTargetPage(targeting.targetPageUrl, pageUrl);
  if (targeting.mode === 'all_pages') return true;
  if (!product) return false;
  if (targeting.mode === 'out_of_stock') return stockState === 'out_of_stock';
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
    priceValue: price,
    condition: String(row.modification_condition || row.condition_label || ''),
    stickers: [...stickers.values()]
  };
}

async function loadPromoProducts(campaignId, db = { query }) {
  const result = await db.query(
    `SELECT item.*, product.external_id AS product_external_id,
            product.sku AS product_sku, product.titles AS product_titles,
            product.price AS product_price, product.old_price AS product_old_price,
            product.currency AS product_currency, product.availability AS product_availability,
            product.visible AS product_visible, product.primary_image_url AS product_image_url,
            product.canonical_url AS product_page_url, product.source_data AS product_source_data,
            modification.external_id AS modification_external_id,
            modification.sku AS modification_sku, modification.titles AS modification_titles,
            modification.price AS modification_price, modification.old_price AS modification_old_price,
            modification.currency AS modification_currency, modification.availability AS modification_availability,
            modification.visible AS modification_visible, modification.image_url AS modification_image_url,
            modification.page_url AS modification_page_url, modification.source_data AS modification_source_data
     FROM popup_banner_promo_products AS item
     JOIN search_horoshop_products AS product ON product.id = item.product_id
     LEFT JOIN search_horoshop_modifications AS modification ON modification.id = item.modification_id
     WHERE item.campaign_id = $1
     ORDER BY item.position, item.id`,
    [campaignId]
  );
  return result.rows;
}

async function loadPreviewProductsByResolvedItems(items, db = { query }) {
  const rows = [];
  for (const item of items) {
    const result = await db.query(
      `SELECT $3::TEXT AS id, $4::INTEGER AS position,
              product.id AS product_id, product.external_id AS product_external_id,
              product.sku AS product_sku, product.titles AS product_titles,
              product.price AS product_price, product.old_price AS product_old_price,
              product.currency AS product_currency, product.availability AS product_availability,
              product.visible AS product_visible, product.primary_image_url AS product_image_url,
              product.canonical_url AS product_page_url, product.source_data AS product_source_data,
              modification.id AS modification_id, modification.external_id AS modification_external_id,
              modification.sku AS modification_sku, modification.titles AS modification_titles,
              modification.price AS modification_price, modification.old_price AS modification_old_price,
              modification.currency AS modification_currency, modification.availability AS modification_availability,
              modification.visible AS modification_visible, modification.image_url AS modification_image_url,
              modification.page_url AS modification_page_url, modification.source_data AS modification_source_data
       FROM search_horoshop_products AS product
       LEFT JOIN search_horoshop_modifications AS modification ON modification.id = $2
       WHERE product.id = $1
       LIMIT 1`,
      [item.productId, item.modificationId || null, item.itemKey || item.targetKey || String(item.productId), item.position || 0]
    );
    if (result.rows[0]) rows.push(result.rows[0]);
  }
  return rows.map(serializePromoProduct);
}

async function loadPreviewRecommendations(connection, limit, db = { query }) {
  const result = await db.query(
    `SELECT product.id AS id, 0 AS position,
            product.id AS product_id, product.external_id AS product_external_id,
            product.sku AS product_sku, product.titles AS product_titles,
            product.price AS product_price, product.old_price AS product_old_price,
            product.currency AS product_currency, product.availability AS product_availability,
            product.visible AS product_visible, product.primary_image_url AS product_image_url,
            product.canonical_url AS product_page_url, product.source_data AS product_source_data,
            NULL AS modification_id, NULL AS modification_external_id,
            NULL AS modification_sku, NULL AS modification_titles,
            NULL AS modification_price, NULL AS modification_old_price,
            NULL AS modification_currency, NULL AS modification_availability,
            NULL AS modification_visible, NULL AS modification_image_url,
            NULL AS modification_page_url, NULL AS modification_source_data
     FROM search_horoshop_products AS product
     WHERE product.connection_id = $1 AND product.generation = $2
       AND product.active = TRUE AND product.visible = TRUE
     ORDER BY product.updated_at DESC
     LIMIT 50`,
    [connection.id, connection.generation]
  );
  return result.rows.map(serializePromoProduct).filter((item) => (
    item.available && item.visible && item.title && item.imageUrl && item.pageUrl && item.buyId
  )).slice(0, limit);
}

function isAvailable(value) {
  const availability = String(value || '').trim().toLocaleLowerCase('uk-UA');
  if (!availability) return false;
  return !/(немає\s+(?:в\s+)?наявност|нет\s+(?:в\s+)?наличи|out[\s-]*of[\s-]*stock|not[\s-]*available|закінчив|отсутств)/iu.test(availability);
}

function sourceIdentifier(value, fallback = '') {
  const source = object(value);
  return String(source.id ?? source.external_id ?? source.product_id ?? fallback ?? '').trim();
}

function sourceOldPrice(value) {
  const source = object(value);
  return String(source.price_old ?? source.old_price ?? source.priceOld ?? source.oldPrice ?? '').trim();
}

function numericValue(value) {
  const normalized = String(value || '').replace(/[\s\u00a0]/gu, '').replace(',', '.');
  const match = normalized.match(/-?\d+(?:\.\d+)?/u);
  return match ? Number(match[0]) : null;
}

async function resolveOutOfStockRecommendations(connection, product, limit) {
  if (!product?.categoryId) return [];
  const candidates = await query(
    `SELECT product.id, product.external_id, product.sku, product.titles,
            product.price, product.old_price, product.currency, product.availability,
            product.visible, product.primary_image_url, product.canonical_url,
            product.popularity, product.source_data,
            modification.id AS modification_id, modification.external_id AS modification_external_id,
            modification.sku AS modification_sku, modification.titles AS modification_titles,
            modification.price AS modification_price, modification.old_price AS modification_old_price,
            modification.currency AS modification_currency, modification.availability AS modification_availability,
            modification.visible AS modification_visible, modification.image_url AS modification_image_url,
            modification.page_url AS modification_page_url, modification.source_data AS modification_source_data
     FROM search_horoshop_products AS product
     LEFT JOIN search_horoshop_modifications AS modification
       ON modification.product_id = product.id
      AND modification.connection_id = $1 AND modification.generation = $2
      AND modification.active = TRUE
     WHERE product.connection_id = $1 AND product.generation = $2
       AND product.active = TRUE AND product.visible = TRUE
       AND product.category_external_id = $3 AND product.id <> $4
     ORDER BY product.updated_at DESC, modification.updated_at DESC`,
    [connection.id, connection.generation, product.categoryId, product.id]
  );
  const grouped = new Map();
  for (const row of candidates.rows) {
    let candidate = grouped.get(row.id);
    if (!candidate) {
      candidate = { row, offers: [] };
      grouped.set(row.id, candidate);
    }
    if (row.modification_id && row.modification_visible !== false && isAvailable(row.modification_availability)) {
      candidate.offers.push({
        modificationId: row.modification_id,
        article: row.modification_sku || row.sku,
        title: localizedTitle(row.modification_titles) || localizedTitle(row.titles),
        price: row.modification_price || row.price || '',
        oldPrice: row.modification_old_price || sourceOldPrice(row.modification_source_data)
          || row.old_price || sourceOldPrice(row.source_data) || '',
        currency: row.modification_currency || row.currency || '',
        imageUrl: storefrontImageUrl(row.modification_image_url || row.primary_image_url || ''),
        pageUrl: row.modification_page_url || row.canonical_url || '',
        buyId: sourceIdentifier(row.modification_source_data, sourceIdentifier(row.source_data, row.external_id))
      });
    }
  }
  const currentPrice = numericValue(product.priceValue);
  const recommendations = [];
  for (const { row, offers } of grouped.values()) {
    if (isAvailable(row.availability)) {
      offers.push({
        modificationId: null,
        article: row.sku,
        title: localizedTitle(row.titles),
        price: row.price || '',
        oldPrice: row.old_price || sourceOldPrice(row.source_data) || '',
        currency: row.currency || '',
        imageUrl: storefrontImageUrl(row.primary_image_url || ''),
        pageUrl: row.canonical_url || '',
        buyId: sourceIdentifier(row.source_data, row.external_id)
      });
    }
    const validOffers = offers.filter((offer) => offer.title && offer.imageUrl && offer.pageUrl && offer.buyId);
    if (!validOffers.length) continue;
    validOffers.sort((left, right) => {
      const leftPrice = numericValue(left.price);
      const rightPrice = numericValue(right.price);
      if (currentPrice !== null && leftPrice !== null && rightPrice !== null) {
        return Math.abs(leftPrice - currentPrice) - Math.abs(rightPrice - currentPrice);
      }
      return (leftPrice ?? Number.MAX_SAFE_INTEGER) - (rightPrice ?? Number.MAX_SAFE_INTEGER);
    });
    recommendations.push({
      productId: row.id,
      ...validOffers[0],
      popularity: numericValue(row.popularity) || 0,
      priceDistance: currentPrice === null || numericValue(validOffers[0].price) === null
        ? Number.MAX_SAFE_INTEGER : Math.abs(numericValue(validOffers[0].price) - currentPrice)
    });
  }
  recommendations.sort((left, right) => left.priceDistance - right.priceDistance || right.popularity - left.popularity);
  return recommendations.slice(0, limit).map(({
    popularity: _popularity,
    priceDistance: _priceDistance,
    ...recommendation
  }) => recommendation);
}

export async function previewPopupCampaign(input) {
  const connectionResult = await query(
    `SELECT id, generation, store_domain FROM search_horoshop_connections
     WHERE singleton = TRUE LIMIT 1`
  );
  const connection = connectionResult.rows[0];
  if (!connection) {
    throw new AppError(409, 'HOROSHOP_NOT_CONNECTED', 'Підключіть магазин Хорошоп перед переглядом банера.');
  }

  const db = { query };
  const campaignType = normalizeCampaignType(input.campaignType, input.targeting);
  const content = normalizeContent(input.content);
  const styles = normalizeStyles(input.styles);
  const targeting = normalizeTargeting(input.targeting);
  const behavior = normalizeBehavior(input.behavior);
  const formConfig = normalizeFormConfig(input.formConfig);

  let products = [];
  if (campaignType === 'product_promo') {
    const resolution = await resolvePromoItems(input.promoItems || [], connection.id, connection.generation, db);
    products = (await loadPreviewProductsByResolvedItems(resolution.items, db)).filter((item) => (
      item.available && item.visible && item.title && item.imageUrl && item.pageUrl && item.buyId
    ));
  }

  let templateProduct = null;
  if (input.productEntries?.length) {
    const targetResolution = await resolveProductEntries(input.productEntries, connection.id, db);
    const targetProducts = await loadPreviewProductsByResolvedItems(targetResolution.targets.slice(0, 1), db);
    const target = targetProducts[0];
    if (target) {
      templateProduct = {
        title: target.title,
        sku: target.sku,
        price: [target.price, target.currency].filter(Boolean).join(' '),
        condition: '',
        stickers: []
      };
    }
  }

  const recommendations = targeting.mode === 'out_of_stock'
    ? await loadPreviewRecommendations(connection, targeting.recommendationLimit, db)
    : [];
  const selectedPromoCode = ['promo_code', 'lead_form'].includes(campaignType) && input.promoCodeId
    ? await loadPromoCodeRow(input.promoCodeId, connection.id, db)
    : null;
  const normalizedSnapshot = {
    type: campaignType,
    content,
    styles,
    targeting,
    behavior,
    formConfig,
    promoCodeId: input.promoCodeId || null,
    products: products.map((item) => [item.productExternalId, item.modificationExternalId])
  };

  return {
    campaign: {
      publicId: 'preview',
      revision: `preview-${createHash('sha256').update(JSON.stringify(normalizedSnapshot)).digest('hex').slice(0, 16)}`,
      type: campaignType,
      mode: targeting.mode,
      content: Object.fromEntries(Object.entries(content).map(([key, value]) => [key, templateText(value, templateProduct)])),
      styles,
      behavior,
      formConfig,
      promoCode: selectedPromoCode ? promoCodeSnapshot(selectedPromoCode) : null
    },
    product: templateProduct ? { article: templateProduct.sku, title: templateProduct.title } : null,
    recommendations,
    products
  };
}

export async function resolvePopupCampaign({ pageUrl: rawPageUrl, article = '', stockState = 'unknown', requestOrigin = '' }) {
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
    const campaignType = normalizeCampaignType(campaign.campaign_type, campaign.targeting);
    if (!isWithinBehaviorSchedule(campaign.behavior)) continue;
    const targets = campaign.targeting?.mode === 'products'
      ? (await query('SELECT product_id, modification_id FROM popup_banner_product_targets WHERE campaign_id = $1', [campaign.id])).rows
      : [];
    if (!matchesTargeting(campaign, product, pageUrl, targets, stockState)) continue;
    const content = normalizeContent(campaign.content);
    const targeting = normalizeTargeting(campaign.targeting);
    const recommendations = targeting.mode === 'out_of_stock'
      ? await resolveOutOfStockRecommendations(connection, product, targeting.recommendationLimit)
      : [];
    if (targeting.mode === 'out_of_stock' && recommendations.length === 0) continue;
    const promoProducts = campaignType === 'product_promo'
      ? (await loadPromoProducts(campaign.id)).map(serializePromoProduct).filter((item) => (
        item.available && item.visible && item.title && item.imageUrl && item.pageUrl && item.buyId
      ))
      : [];
    if (campaignType === 'product_promo' && promoProducts.length === 0) continue;
    const publishedPromoCode = ['promo_code', 'lead_form'].includes(campaignType)
      ? object(campaign.promo_code_published_snapshot)
      : null;
    const publishedFormConfig = campaignType === 'lead_form'
      ? normalizeFormConfig(campaign.form_published_snapshot)
      : normalizeFormConfig(null);
    if (['promo_code', 'lead_form'].includes(campaignType) && !publishedPromoCode?.code) continue;
    if (campaignType === 'lead_form' && !publishedFormConfig.fields.length) continue;
    return {
      campaign: {
        publicId: campaign.public_id,
        revision: campaign.updated_at instanceof Date
          ? campaign.updated_at.toISOString()
          : String(campaign.updated_at || ''),
        type: campaignType,
        mode: targeting.mode,
        content: Object.fromEntries(Object.entries(content).map(([key, value]) => [key, templateText(value, product)])),
        styles: normalizeStyles(campaign.styles),
        behavior: normalizeBehavior(campaign.behavior),
        formConfig: publishedFormConfig,
        promoCode: campaignType === 'promo_code' ? publishedPromoCode : null
      },
      product: product ? { article: product.sku, title: product.title } : null,
      recommendations,
      products: promoProducts
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

function contactValue(field, rawValue) {
  if (field.type === 'checkbox') return rawValue === true || rawValue === 'true' || rawValue === '1';
  const maximum = field.type === 'textarea' ? 2000 : 500;
  return String(rawValue ?? '').trim().slice(0, maximum);
}

function validatedContactValues(formConfig, suppliedValues) {
  const source = object(suppliedValues);
  const values = {};
  const details = [];
  for (const field of formConfig.fields) {
    const value = contactValue(field, source[field.id]);
    const empty = field.type === 'checkbox' ? value !== true : !value;
    if (field.required && empty) {
      details.push({ field: field.id, message: `Заповніть поле «${field.label}».` });
      continue;
    }
    if (empty) {
      values[field.id] = value;
      continue;
    }
    if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value)) {
      details.push({ field: field.id, message: `Перевірте email у полі «${field.label}».` });
    }
    if (field.type === 'phone') {
      const digits = value.replace(/\D/gu, '');
      if (digits.length < 7 || digits.length > 15) {
        details.push({ field: field.id, message: `Перевірте номер у полі «${field.label}».` });
      }
    }
    if (field.type === 'select' && !field.options.includes(value)) {
      details.push({ field: field.id, message: `Оберіть доступне значення у полі «${field.label}».` });
    }
    values[field.id] = field.type === 'email' ? value.toLocaleLowerCase('uk-UA') : value;
  }
  if (details.length) {
    throw new AppError(422, 'POPUP_CONTACT_INVALID', 'Перевірте заповнені поля форми.', details);
  }
  return values;
}

export async function submitPopupContact({ publicId, values, pageUrl, article, visitorKey, requestOrigin }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT campaign.*, connection.store_domain, connection.generation AS current_generation
       FROM popup_banner_campaigns AS campaign
       JOIN search_horoshop_connections AS connection ON connection.id = campaign.connection_id
       WHERE campaign.public_id = $1 AND campaign.status = 'active'
         AND campaign.campaign_type = 'lead_form'
         AND (campaign.starts_at IS NULL OR campaign.starts_at <= NOW())
         AND (campaign.ends_at IS NULL OR campaign.ends_at > NOW())
       FOR UPDATE`,
      [publicId]
    );
    const campaign = result.rows[0];
    if (!campaign || campaign.connection_generation !== campaign.current_generation
      || !isWithinBehaviorSchedule(campaign.behavior)) {
      throw new AppError(404, 'POPUP_FORM_NOT_AVAILABLE', 'Ця контактна форма більше не доступна.');
    }
    const parsedPage = normalizedPageUrl(pageUrl);
    const parsedOrigin = normalizedPageUrl(requestOrigin);
    if (!parsedPage || !sameStoreHost(parsedPage.hostname, campaign.store_domain)
      || (parsedOrigin && !sameStoreHost(parsedOrigin.hostname, campaign.store_domain))) {
      throw new AppError(403, 'POPUP_STORE_MISMATCH', 'Форму можна надсилати лише з підключеного магазину.');
    }
    const formConfig = normalizeFormConfig(campaign.form_published_snapshot);
    const promoCode = object(campaign.promo_code_published_snapshot);
    if (!formConfig.fields.length || !promoCode.code) {
      throw new AppError(409, 'POPUP_FORM_NOT_PUBLISHED', 'Опублікована версія форми недоступна.');
    }
    const normalizedValues = validatedContactValues(formConfig, values);
    const product = await resolveProduct({ id: campaign.connection_id, generation: campaign.current_generation }, article, parsedPage);
    const visitorKeyHash = visitorKey
      ? createHash('sha256').update(String(visitorKey).slice(0, 200)).digest('hex') : null;
    const dedupeKey = createHash('sha256')
      .update(JSON.stringify(formConfig.fields.map((field) => [field.id, normalizedValues[field.id]])))
      .digest('hex');
    const existing = await client.query(
      'SELECT id, created_at FROM popup_banner_contacts WHERE campaign_id = $1 AND dedupe_key = $2 LIMIT 1',
      [campaign.id, dedupeKey]
    );
    const inserted = existing.rows[0] ? { rows: [] } : await client.query(
      `INSERT INTO popup_banner_contacts (
         campaign_id, product_id, modification_id, values, visitor_key_hash, dedupe_key, page_url
       ) VALUES ($1, $2, $3, $4::JSONB, $5, $6, $7)
       ON CONFLICT (campaign_id, dedupe_key) DO NOTHING
       RETURNING id, created_at`,
      [campaign.id, product?.id || null, product?.modificationId || null,
        JSON.stringify(normalizedValues), visitorKeyHash, dedupeKey, parsedPage.href.slice(0, 4000)]
    );
    await client.query('COMMIT');
    return {
      duplicate: !inserted.rows[0],
      promoCode,
      submittedAt: inserted.rows[0]?.created_at || existing.rows[0]?.created_at || null
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function serializeContact(row) {
  return {
    id: row.id,
    values: object(row.values),
    pageUrl: row.page_url || '',
    createdAt: row.created_at
  };
}

export async function listPopupContacts(campaignId, { page = 1, pageSize = 50 } = {}) {
  const campaign = await loadCampaignRow(campaignId);
  if (normalizeCampaignType(campaign.campaign_type, campaign.targeting) !== 'lead_form') {
    throw new AppError(409, 'POPUP_CONTACTS_UNAVAILABLE', 'Списки контактів доступні лише для банерів із формою.');
  }
  const offset = (page - 1) * pageSize;
  const [items, total] = await Promise.all([
    query(
      `SELECT id, values, page_url, created_at
       FROM popup_banner_contacts WHERE campaign_id = $1
       ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3`,
      [campaignId, pageSize, offset]
    ),
    query('SELECT COUNT(*) AS count FROM popup_banner_contacts WHERE campaign_id = $1', [campaignId])
  ]);
  return {
    campaign: {
      id: campaign.id,
      name: campaign.name,
      formConfig: normalizeFormConfig(campaign.form_published_snapshot || campaign.form_config)
    },
    items: items.rows.map(serializeContact),
    page,
    pageSize,
    total: Number(total.rows[0]?.count || 0)
  };
}

function safeSpreadsheetValue(value) {
  const text = value === true ? 'Так' : value === false ? 'Ні' : String(value ?? '');
  return /^[=+\-@]/u.test(text) ? `'${text}` : text;
}

function safeSheetName(value, used) {
  const base = String(value || 'Контакти').replace(/[\\/?*:]/gu, ' ').replaceAll('[', ' ').replaceAll(']', ' ').trim().slice(0, 31) || 'Контакти';
  let name = base;
  let index = 2;
  while (used.has(name.toLocaleLowerCase('uk-UA'))) {
    const suffix = ` ${index++}`;
    name = `${base.slice(0, 31 - suffix.length)}${suffix}`;
  }
  used.add(name.toLocaleLowerCase('uk-UA'));
  return name;
}

export async function exportPopupContactsWorkbook(campaignId = null) {
  const campaigns = await query(
    `SELECT id, name, form_config, form_published_snapshot
     FROM popup_banner_campaigns
     WHERE campaign_type = 'lead_form' ${campaignId ? 'AND id = $1' : ''}
     ORDER BY updated_at DESC`,
    campaignId ? [campaignId] : []
  );
  if (campaignId && !campaigns.rows[0]) {
    throw new AppError(404, 'POPUP_CAMPAIGN_NOT_FOUND', 'Попап-кампанію не знайдено.');
  }
  const workbook = XLSX.utils.book_new();
  const usedNames = new Set();
  for (const campaign of campaigns.rows) {
    const formConfig = normalizeFormConfig(campaign.form_published_snapshot || campaign.form_config);
    const contacts = await query(
      `SELECT values, page_url, created_at FROM popup_banner_contacts
       WHERE campaign_id = $1 ORDER BY created_at DESC, id DESC`,
      [campaign.id]
    );
    const headers = ['Дата отримання', ...formConfig.fields.map((field) => field.label), 'Сторінка'];
    const rows = contacts.rows.map((contact) => [
      contact.created_at instanceof Date ? contact.created_at.toISOString() : String(contact.created_at || ''),
      ...formConfig.fields.map((field) => safeSpreadsheetValue(object(contact.values)[field.id])),
      safeSpreadsheetValue(contact.page_url)
    ]);
    const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    sheet['!cols'] = [{ wch: 24 }, ...formConfig.fields.map(() => ({ wch: 28 })), { wch: 64 }];
    sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, rows.length), c: headers.length - 1 } }) };
    XLSX.utils.book_append_sheet(workbook, sheet, safeSheetName(campaign.name, usedNames));
  }
  if (!workbook.SheetNames.length) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Контактних форм ще немає']]), 'Контакти');
  }
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', compression: true });
}

export async function popupBannerAnalytics({ days = 30, campaignId = null } = {}) {
  const periodDays = Math.min(90, Math.max(7, Number(days) || 30));
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - periodDays + 1);
  from.setUTCHours(0, 0, 0, 0);
  const values = [from.toISOString()];
  const campaignClause = campaignId ? 'AND campaign.id = $2' : '';
  if (campaignId) values.push(campaignId);
  if (campaignId) {
    const exists = await query('SELECT id FROM popup_banner_campaigns WHERE id = $1', [campaignId]);
    if (!exists.rows[0]) throw new AppError(404, 'POPUP_CAMPAIGN_NOT_FOUND', 'Попап-кампанію не знайдено.');
  }
  const scope = `
    FROM popup_banner_events AS event
    JOIN popup_banner_campaigns AS campaign ON campaign.id = event.campaign_id
    WHERE event.created_at >= $1 ${campaignClause}
  `;
  const [totalsResult, seriesResult, campaignsResult, pagesResult, uniqueResult] = await Promise.all([
    query(`SELECT event.event_type, COUNT(*) AS count ${scope} GROUP BY event.event_type`, values),
    query(`SELECT event.created_at AS day, event.event_type ${scope} ORDER BY event.created_at`, values),
    query(`SELECT campaign.id, campaign.public_id, campaign.name, campaign.status,
                  event.event_type, COUNT(event.id) AS count
           FROM popup_banner_campaigns AS campaign
           LEFT JOIN popup_banner_events AS event
             ON event.campaign_id = campaign.id AND event.created_at >= $1
           WHERE TRUE ${campaignClause}
           GROUP BY campaign.id, campaign.public_id, campaign.name, campaign.status, event.event_type
           ORDER BY campaign.updated_at DESC`, values),
    query(`SELECT event.page_url, event.event_type, COUNT(*) AS count ${scope}
           AND event.page_url IS NOT NULL GROUP BY event.page_url, event.event_type ORDER BY count DESC`, values),
    query(`SELECT COUNT(DISTINCT event.visitor_key_hash) AS count ${scope}
           AND event.visitor_key_hash IS NOT NULL`, values)
  ]);

  const counts = Object.fromEntries(totalsResult.rows.map((row) => [row.event_type, Number(row.count || 0)]));
  const totals = {
    impressions: Number(counts.impression || 0),
    clicks: Number(counts.click || 0),
    dismissals: Number(counts.dismiss || 0),
    acknowledgements: Number(counts.acknowledge || 0),
    copies: Number(counts.copy || 0),
    promoCtaClicks: Number(counts.promo_cta || 0),
    uniqueVisitors: Number(uniqueResult.rows[0]?.count || 0)
  };
  const dayRows = new Map();
  for (const row of seriesResult.rows) {
    const day = String(row.day instanceof Date ? row.day.toISOString().slice(0, 10) : row.day).slice(0, 10);
    const current = dayRows.get(day) || {};
    current[row.event_type] = Number(current[row.event_type] || 0) + Number(row.count || 1);
    dayRows.set(day, current);
  }
  const series = Array.from({ length: periodDays }, (_, index) => {
    const day = new Date(from);
    day.setUTCDate(from.getUTCDate() + index);
    const date = day.toISOString().slice(0, 10);
    const current = dayRows.get(date) || {};
    return {
      date,
      impression: Number(current.impression || 0),
      click: Number(current.click || 0),
      dismiss: Number(current.dismiss || 0),
      acknowledge: Number(current.acknowledge || 0),
      copy: Number(current.copy || 0),
      promo_cta: Number(current.promo_cta || 0)
    };
  });
  function group(rows, keyName, base) {
    const grouped = new Map();
    for (const row of rows) {
      const key = row[keyName];
      const item = grouped.get(key) || { ...base(row), counts: {} };
      item.counts[row.event_type] = Number(row.count || 0);
      grouped.set(key, item);
    }
    return [...grouped.values()].map((item) => ({ ...item, ...item.counts, counts: undefined }));
  }
  return {
    periodDays,
    totals: {
      ...totals,
      engagementRate: totals.impressions
        ? (totals.clicks + totals.acknowledgements + totals.copies + totals.promoCtaClicks) / totals.impressions : 0,
      dismissRate: totals.impressions ? totals.dismissals / totals.impressions : 0,
      copyRate: totals.impressions ? totals.copies / totals.impressions : 0
    },
    series,
    campaigns: group(campaignsResult.rows, 'id', (row) => ({
      id: row.id, publicId: row.public_id, name: row.name, status: row.status
    })),
    pages: group(pagesResult.rows, 'page_url', (row) => ({ pageUrl: row.page_url })).slice(0, 12)
  };
}

export function popupEmbedScript(origin) {
  return `(() => {
  if (window.__mtPopupBannersLoaded) return;
  window.__mtPopupBannersLoaded = true;
  const script = document.currentScript;
  const apiOrigin = ${JSON.stringify(origin)};
  let previewPayload = window.__MT_POPUP_PREVIEW__ || null;
  if (!previewPayload && script?.dataset.previewPayload) {
    try { previewPayload = JSON.parse(script.dataset.previewPayload); } catch {}
  }
  const previewMode = Boolean(previewPayload);
  const previewDevice = (script?.dataset.previewDevice || window.__MT_POPUP_PREVIEW_DEVICE__) === 'mobile' ? 'mobile' : 'desktop';
  const articleSelector = script?.dataset.articleSelector || '';
  let currentHost = null;
  let currentUrl = '';
  let pendingTimer = null;
  let pendingCleanup = null;
  let activeCleanup = null;
  const visitorStorageKey = 'mt-popup-visitor';
  let visitorKey = previewMode ? 'preview' : localStorage.getItem(visitorStorageKey);
  if (!previewMode && !visitorKey) {
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

  function stockState() {
    if (document.querySelector('.product-header__availability--out-of-stock, [data-availability="out-of-stock"]')) return 'out_of_stock';
    const availability = document.querySelector(
      '.product-header__availability, [itemprop="availability"], [data-product-availability], [data-availability]'
    );
    if (!availability) return 'unknown';
    const value = [availability.getAttribute('content'), availability.getAttribute('href'), availability.dataset?.availability, availability.textContent]
      .filter(Boolean).join(' ').toLocaleLowerCase('uk-UA');
    if (/(немає\\s+(?:в\\s+)?наявност|нет\\s+(?:в\\s+)?наличи|out[\\s-]*of[\\s-]*stock|not[\\s-]*available|schema\\.org\\/outofstock)/iu.test(value)) return 'out_of_stock';
    if (/(в\\s+наявност|в\\s+наличи|in[\\s-]*stock|schema\\.org\\/instock|на\\s+складі)/iu.test(value)) return 'in_stock';
    return 'unknown';
  }

  function event(publicId, eventType, productArticle, metadata = {}) {
    if (previewMode) return;
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
    return 'mt-popup:' + payload.campaign.publicId + ':' + String(payload.campaign.revision || 'legacy') + ':' + suffix;
  }

  function sessionCountKey(payload) {
    return 'mt-popup-count:' + payload.campaign.publicId + ':' + String(payload.campaign.revision || 'legacy');
  }

  function isMobileInteractionSurface() {
    if (previewMode) return previewDevice === 'mobile';
    const userAgent = String(navigator.userAgent || '');
    const mobileUserAgent = /Android|iPhone|iPod|IEMobile|Opera Mini|Mobile/iu.test(userAgent)
      || (/Macintosh/iu.test(userAgent) && Number(navigator.maxTouchPoints) > 1);
    return innerWidth <= 600 && mobileUserAgent;
  }

  function deviceAllowed(behavior) {
    const mobile = isMobileInteractionSurface();
    return behavior.device === 'all' || (behavior.device === 'mobile' ? mobile : !mobile);
  }

  function isSuppressed(payload) {
    if (previewMode) return false;
    const behavior = payload.campaign.behavior;
    const sessionCount = Number(sessionStorage.getItem(sessionCountKey(payload)) || 0);
    if (behavior.maxShowsPerSession > 0 && sessionCount >= behavior.maxShowsPerSession) return true;
    if (behavior.frequency === 'always') return false;
    const key = frequencyKey(payload);
    if (behavior.frequency === 'session') return sessionStorage.getItem(key) === '1';
    const stored = Number(localStorage.getItem(key) || 0);
    if (!stored) return false;
    if (behavior.frequency === 'hours') return Date.now() - stored < behavior.cooldownHours * 3600000;
    if (behavior.frequency === 'days') return Date.now() - stored < behavior.cooldownDays * 86400000;
    return true;
  }

  function remember(payload) {
    if (previewMode) return;
    const behavior = payload.campaign.behavior;
    const countKey = sessionCountKey(payload);
    sessionStorage.setItem(countKey, String(Number(sessionStorage.getItem(countKey) || 0) + 1));
    if (behavior.frequency === 'always') return;
    const key = frequencyKey(payload);
    if (behavior.frequency === 'session') sessionStorage.setItem(key, '1');
    else localStorage.setItem(key, String(Date.now()));
  }

  function imageUrl(value) {
    return String(value || '').replace(/_\\+[0-9a-f]{6,}(?=\\.[a-z0-9]+(?:[?#]|$))/iu, '');
  }

  function storeUrl(value) {
    try {
      const url = new URL(String(value || ''), location.href);
      const host = (hostname) => String(hostname || '').toLowerCase().replace(/^www\\./u, '');
      if (host(url.hostname) !== host(location.hostname)) return null;
      url.protocol = location.protocol;
      url.host = location.host;
      url.username = '';
      url.password = '';
      url.hash = '';
      return url;
    } catch {
      return null;
    }
  }

  function productPath(url) {
    return url.origin + (url.pathname.replace(/\\/+$/u, '') || '/') + url.search;
  }

  const nativeProductAddSelector = [
    '.product__block--orderBox [data-view-block="orderBox"] .product-card--main[itemprop="offers"] .product-card__buy-button > .j-buy-button-add[id^="j-buy-button-widget-"]',
    '.product-order__block--buy .j-buy-button-add[id^="j-buy-button-widget-"]',
    '.product-order .j-buy-button-add[id^="j-buy-button-widget-"]',
    '.product__section--order .j-buy-button-add[id^="j-buy-button-widget-"]',
    '[itemtype$="/Product"] [itemprop="offers"] .product-card__buy-button > .j-buy-button-add[id^="j-buy-button-widget-"]'
  ].join(',');
  const nativeProductRemoveSelector = [
    '.product__block--orderBox [data-view-block="orderBox"] .product-card--main[itemprop="offers"] .product-card__buy-button > .j-buy-button-remove[id^="j-buy-button-widget-"]',
    '.product-order__block--buy .j-buy-button-remove[id^="j-buy-button-widget-"]',
    '.product-order .j-buy-button-remove[id^="j-buy-button-widget-"]',
    '.product__section--order .j-buy-button-remove[id^="j-buy-button-widget-"]',
    '[itemtype$="/Product"] [itemprop="offers"] .product-card__buy-button > .j-buy-button-remove[id^="j-buy-button-widget-"]'
  ].join(',');

  function nativeBuyDescriptor(button, requireQuantity = true) {
    const match = String(button?.id || '').match(/^j-buy-button-widget-(\\d+)$/u);
    const quantity = Number(button?.dataset.quantity);
    const hasQuantity = Number.isFinite(quantity) && quantity > 0;
    if (!match || (requireQuantity && !hasQuantity)) return null;
    return {
      id: match[1],
      skin: String(button.dataset.skin || 'default'),
      quantity: hasQuantity ? String(quantity) : '',
      gift: String(button.dataset.gift || '0'),
      productType: String(button.dataset.cartproducttype || 'product')
    };
  }

  function existingNativeBuy(targetUrl, expectedId) {
    const targetPath = productPath(targetUrl);
    for (const link of document.querySelectorAll('a[href]')) {
      const linkUrl = storeUrl(link.href);
      if (!linkUrl || productPath(linkUrl) !== targetPath) continue;
      const item = link.closest('.productsSlider-i, .catalogCard-box, .j-product-container, article, li');
      const addButton = item?.querySelector('.j-buy-button-add[id^="j-buy-button-widget-"]');
      const removeButton = item?.querySelector('.j-buy-button-remove[id^="j-buy-button-widget-"]');
      const button = addButton || removeButton;
      const descriptor = nativeBuyDescriptor(button, Boolean(addButton));
      if (button && descriptor && (!expectedId || descriptor.id === expectedId) && !button.disabled) {
        return { button, descriptor, already: Boolean(removeButton && !addButton) };
      }
    }
    return null;
  }

  function pageArticle(root) {
    const node = root.querySelector('[itemprop="sku"], meta[property="product:retailer_item_id"], [data-product-article]');
    return String(node?.content || node?.dataset?.productArticle || node?.textContent || '').trim();
  }

  function nativeCartController() {
    try {
      return window.AjaxCart?.getInstance?.() || null;
    } catch {}
    return null;
  }

  function nativeCart(controller = nativeCartController()) {
    return [controller, controller?.Cart].find((candidate) => candidate
      && typeof candidate.appendProduct === 'function'
      && typeof candidate.getProductById === 'function') || null;
  }

  function desktopCartIsOpen() {
    return [...document.querySelectorAll('.popup.__cart, #cart.popup')].some((root) => {
      if (root.hidden || root.getAttribute('aria-hidden') === 'true') return false;
      const styles = window.getComputedStyle?.(root);
      return root.style.display !== 'none' && styles?.display !== 'none' && styles?.visibility !== 'hidden';
    });
  }

  function openNativeCartSurface() {
    if (desktopCartIsOpen()) return 'desktop';
    return document.querySelector('#cart-drawer.mm-opened') ? 'mobile' : '';
  }

  function refreshOpenNativeCart(controller, surface) {
    if (!surface || typeof controller?.reloadHtml !== 'function') return;
    const stillOpen = surface === 'desktop'
      ? desktopCartIsOpen()
      : Boolean(document.querySelector('#cart-drawer.mm-opened'));
    if (!stillOpen) return;
    try { controller.reloadHtml(); } catch {}
  }

  function cartProduct(cart, descriptor) {
    try {
      return cart.getProductById(descriptor.id, descriptor.productType) || null;
    } catch {
      return null;
    }
  }

  function cartQuantity(product) {
    const raw = product?.quantity ?? product?.Quantity ?? product?.qty ?? product?.count ?? 0;
    const quantity = Number(raw);
    return Number.isFinite(quantity) ? quantity : 0;
  }

  function waitForCartChange(cart, descriptor, beforeProduct) {
    const beforeQuantity = cartQuantity(beforeProduct);
    const deadline = Date.now() + 4500;
    return new Promise((resolve) => {
      const check = () => {
        const product = cartProduct(cart, descriptor);
        if (product && (!beforeProduct || cartQuantity(product) > beforeQuantity)) { resolve(true); return; }
        if (Date.now() >= deadline) { resolve(false); return; }
        setTimeout(check, 60);
      };
      check();
    });
  }

  async function clickExistingNativeBuy(entry) {
    const controller = nativeCartController();
    const cart = nativeCart(controller);
    if (!cart) return '';
    const beforeProduct = cartProduct(cart, entry.descriptor);
    if (beforeProduct) return 'already';
    const openSurface = openNativeCartSurface();
    entry.button.click();
    const added = await waitForCartChange(cart, entry.descriptor, beforeProduct);
    if (added) refreshOpenNativeCart(controller, openSurface);
    return added ? 'added' : '';
  }

  async function appendThroughNativeCart(descriptor) {
    const controller = nativeCartController();
    const cart = nativeCart(controller);
    if (!cart) return '';
    const beforeProduct = cartProduct(cart, descriptor);
    if (beforeProduct) return 'already';
    const openSurface = openNativeCartSurface();
    try {
      window.AjaxCart.openCartOnAdd = true;
      cart.appendProduct({
        type: descriptor.productType,
        quantity: Number(descriptor.quantity),
        id: descriptor.id
      }, []);
    } catch {
      return '';
    }
    const added = await waitForCartChange(cart, descriptor, beforeProduct);
    if (added) refreshOpenNativeCart(controller, openSurface);
    return added ? 'added' : '';
  }

  async function nativeBuy(recommendation, isCurrent) {
    const targetUrl = storeUrl(recommendation.pageUrl);
    if (!targetUrl) return false;
    const rawBuyId = String(recommendation.buyId || '').trim();
    const expectedId = /^\\d+$/u.test(rawBuyId) ? rawBuyId : '';
    const existing = existingNativeBuy(targetUrl, expectedId);
    if (existing) return existing.already ? 'already' : clickExistingNativeBuy(existing);

    let descriptor = null;
    let already = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    try {
      const response = await fetch(targetUrl.href, {
        credentials: 'same-origin',
        headers: { accept: 'text/html' },
        signal: controller.signal
      });
      const responseUrl = response.url ? storeUrl(response.url) : targetUrl;
      if (response.ok && responseUrl && productPath(responseUrl) === productPath(targetUrl)) {
        const page = new DOMParser().parseFromString(await response.text(), 'text/html');
        const addButton = page.querySelector(nativeProductAddSelector);
        const removeButton = page.querySelector(nativeProductRemoveSelector);
        const button = addButton || removeButton;
        already = Boolean(removeButton && !addButton);
        descriptor = nativeBuyDescriptor(button, !already);
        const expectedArticle = String(recommendation.article || '').trim().toLocaleLowerCase('uk-UA');
        const actualArticle = pageArticle(page).toLocaleLowerCase('uk-UA');
        if ((expectedId && descriptor?.id !== expectedId)
          || (expectedArticle && actualArticle && expectedArticle !== actualArticle)) {
          descriptor = null;
          already = false;
        }
      }
    } catch {
      descriptor = null;
    } finally {
      clearTimeout(timeout);
    }
    if (!descriptor || !isCurrent()) return '';
    if (already) return 'already';
    return appendThroughNativeCart(descriptor);
  }

  function money(value, currency) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const currencyText = String(currency || '').trim().toUpperCase() === 'UAH' ? 'грн' : String(currency || '').trim();
    return [raw, currencyText].filter(Boolean).join(' ');
  }

  function appendPromoCode(container, promo, campaign, productArticle, withCta) {
    const offer = document.createElement('div'); offer.className = 'promo-code-offer';
    const value = document.createElement('p'); value.className = 'promo-code-value';
    value.textContent = promo.type === 'percent_coupon'
      ? 'Знижка ' + String(promo.discountValue || '') + '%'
      : 'Сертифікат на ' + money(promo.discountValue, promo.currency);
    const row = document.createElement('div'); row.className = 'promo-code-row';
    const code = document.createElement('code'); code.className = 'promo-code'; code.textContent = promo.code || '';
    const copy = document.createElement('button'); copy.className = 'promo-code-copy'; copy.type = 'button'; copy.textContent = 'Скопіювати';
    copy.addEventListener('click', async () => {
      let copied = false;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(String(promo.code || ''));
          copied = true;
        }
      } catch {}
      if (!copied) {
        const field = document.createElement('textarea');
        field.value = String(promo.code || ''); field.setAttribute('readonly', '');
        field.style.position = 'fixed'; field.style.opacity = '0'; document.body.append(field); field.select();
        try { copied = document.execCommand('copy'); } catch {}
        field.remove();
      }
      if (!copied) return;
      event(campaign.publicId, 'copy', productArticle, { action: 'copy_promo_code' });
      copy.textContent = 'Скопійовано'; copy.classList.add('is-copied');
      setTimeout(() => { if (copy.isConnected) { copy.textContent = 'Скопіювати'; copy.classList.remove('is-copied'); } }, 1800);
    });
    row.append(code, copy); offer.append(value, row);
    if (promo.scopeNote) { const note = document.createElement('p'); note.className = 'promo-code-note'; note.textContent = promo.scopeNote; offer.append(note); }
    container.append(offer);
    if (withCta && campaign.content.primaryUrl && campaign.content.primaryLabel) {
      const cta = document.createElement('a'); cta.className = 'promo-code-cta';
      cta.href = campaign.content.primaryUrl; cta.textContent = campaign.content.primaryLabel;
      cta.addEventListener('click', (clickEvent) => {
        if (previewMode) { clickEvent.preventDefault(); return; }
        event(campaign.publicId, 'promo_cta', productArticle, { action: 'promo_cta' });
      });
      container.append(cta);
    }
    return copy;
  }

  function render(payload, productArticle) {
    if (currentHost || (!previewMode && isSuppressed(payload))) return;
    const { campaign } = payload;
    const isProductPromo = campaign.type === 'product_promo';
    const isPromoCode = campaign.type === 'promo_code';
    const isLeadForm = campaign.type === 'lead_form';
    const promoFormat = campaign.styles.promoFormat || 'notification';
    const cleanupTasks = [];
    const host = document.createElement('div');
    host.id = 'mt-popup-banner-root';
    host.style.position = 'fixed';
    host.style.zIndex = '2147482990';
    if (isProductPromo) {
      const presetWidths = { notification: 380, compact: 460, standard: 640, wide: 860 };
      const promoWidth = promoFormat === 'custom' ? campaign.styles.maxWidth : (presetWidths[promoFormat] || 380);
      const mobile = isMobileInteractionSurface();
      const position = mobile ? campaign.styles.mobilePosition : campaign.styles.desktopPosition;
      const edge = mobile ? '10px' : '18px';
      if (mobile) {
        host.style.left = '50%';
        host.style.transform = 'translateX(-50%)';
        host.style[position === 'top' ? 'top' : 'bottom'] = edge;
      } else {
        host.style[position?.startsWith('top') ? 'top' : 'bottom'] = edge;
        host.style[position?.endsWith('left') ? 'left' : 'right'] = edge;
      }
      host.style.width = 'min(calc(100vw - 20px), ' + promoWidth + 'px)';
      host.style.pointerEvents = 'none';
    } else {
      host.style.inset = '0';
    }
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = \`:host{all:initial}.backdrop{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(15,23,42,.56);font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--text)}.card{position:relative;width:min(var(--width),100%);max-height:calc(100vh - 36px);overflow:auto;border-radius:var(--radius);background:var(--bg);box-shadow:0 28px 90px rgba(15,23,42,.3);animation:enter .2s ease-out}.card:focus{outline:none}.card.is-recommendations{display:flex;flex-direction:column;overflow:hidden}.card.is-recommendations>.image{flex:0 1 auto;max-height:min(220px,24vh)}.card.is-recommendations .content{box-sizing:border-box;display:flex;flex:1 1 auto;flex-direction:column;max-height:none;min-height:0;overflow:hidden}.content{padding:30px}.image{display:block;width:100%;max-height:260px;object-fit:cover;border-radius:calc(var(--radius) - 7px) calc(var(--radius) - 7px) 0 0}.eyebrow{margin:0 0 8px;color:var(--accent);font-size:12px;font-weight:800;letter-spacing:.11em;text-transform:uppercase}.title{margin:0;color:var(--text);font-size:clamp(24px,4vw,34px);line-height:1.08}.body{margin:14px 0 0;color:var(--muted);font-size:16px;line-height:1.58;white-space:pre-line}.ack{display:grid;grid-template-columns:18px minmax(0,1fr);align-items:center;gap:10px;margin:20px 0 0;padding:14px;border-radius:14px;color:var(--checkbox-text);background:color-mix(in srgb,var(--checkbox) 9%,var(--bg));font-size:14px;line-height:1.4}.ack input{display:grid;place-content:center;width:18px;height:18px;margin:0;appearance:none;border:1.5px solid color-mix(in srgb,var(--checkbox) 55%,#fff);border-radius:5px;background:var(--bg);cursor:pointer}.ack input:before{width:8px;height:4px;border-bottom:2px solid #fff;border-left:2px solid #fff;content:'';transform:rotate(-45deg) scale(0);transition:transform .12s ease}.ack input:checked{border-color:var(--checkbox);background:var(--checkbox)}.ack input:checked:before{transform:rotate(-45deg) scale(1)}.actions{display:flex;gap:10px;justify-content:flex-end;margin-top:24px}.button{min-height:44px;border:1px solid transparent;border-radius:var(--button-radius,12px);padding:10px 18px;font:inherit;font-weight:750;cursor:pointer}.primary{border-color:var(--primary-bg);background:var(--primary-bg);color:var(--primary-text)}.primary:disabled{opacity:.45;cursor:not-allowed}.secondary{border-color:color-mix(in srgb,var(--secondary-text) 16%,transparent);background:var(--secondary-bg);color:var(--secondary-text)}.close{position:absolute;z-index:2;top:12px;right:12px;width:38px;height:38px;border:0;border-radius:50%;background:rgba(15,23,42,.72);color:#fff;font-size:24px;line-height:1;cursor:pointer}.recommendations{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:24px}.card.is-recommendations .recommendations{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable}.recommendation{display:grid;grid-template-rows:auto minmax(44px,1fr) auto auto;gap:10px;min-width:0;padding:12px;border:1px solid color-mix(in srgb,var(--text) 12%,transparent);border-radius:16px;background:color-mix(in srgb,var(--bg) 94%,var(--text));text-decoration:none}.recommendation-image{display:block;width:100%;aspect-ratio:1.2;object-fit:contain;border-radius:12px;background:#f6f7f9}.recommendation-title{display:-webkit-box;overflow:hidden;margin:0;color:var(--text);font-size:14px;font-weight:650;line-height:1.4;text-decoration:none;-webkit-box-orient:vertical;-webkit-line-clamp:2}.recommendation-price{display:flex;align-items:baseline;flex-wrap:wrap;gap:7px}.recommendation-price strong{color:var(--text);font-size:18px}.recommendation-price del{color:var(--muted);font-size:12px}.recommendation-buy{width:100%;min-height:42px;border:1px solid var(--primary-bg);border-radius:var(--button-radius,12px);background:var(--primary-bg);color:var(--primary-text);font:750 var(--button-size)/1.2 Inter,system-ui,sans-serif;cursor:pointer}.recommendation-buy:disabled{opacity:.65;cursor:wait}.corner{align-items:flex-end;justify-content:flex-end;background:transparent;pointer-events:none}.corner .card{pointer-events:auto;box-shadow:0 20px 65px rgba(15,23,42,.25)}.bottom-sheet{align-items:flex-end}.bottom-sheet .card{width:min(760px,100%);border-radius:var(--radius) var(--radius) 0 0;margin-bottom:-18px}@keyframes enter{from{opacity:0;transform:translateY(12px) scale(.98)}to{opacity:1;transform:none}}@media(max-width:760px){.recommendations{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.card.is-recommendations .recommendations{overflow-x:hidden;overflow-y:auto}.recommendation{gap:8px;padding:9px;border-radius:14px}.recommendation-image{aspect-ratio:1}.recommendation-title{font-size:13px;line-height:1.35}.recommendation-price{gap:5px}.recommendation-price strong{font-size:16px}.recommendation-price del{font-size:11px}.recommendation-buy{min-height:40px;font-size:clamp(13px,var(--button-size),15px)}}@media(max-width:600px){.backdrop{padding:10px;align-items:flex-end}.card{border-radius:20px 20px 0 0;margin-bottom:-10px}.content{padding:24px 20px}.actions{flex-direction:column-reverse}.button{width:100%}.recommendations{margin-right:0;padding-right:0}}\`;
    style.textContent += \`.eyebrow{font-size:var(--eyebrow-size)}.title{font-size:var(--title-size)}.body{font-size:var(--body-size)}.ack{font-size:var(--ack-size)}.ack input:before{border-bottom-color:var(--checkbox-check);border-left-color:var(--checkbox-check)}.button{font-size:var(--button-size)}.bottom-sheet .card{width:min(var(--width),100%)}\`;
    style.textContent += '.recommendation-image{background:#fff}';
    style.textContent += '.recommendation-price.is-discounted strong{color:#dc2626}';
    style.textContent += \`.promo-code-offer{display:grid;gap:14px;margin-top:22px;padding:18px;border:1px solid color-mix(in srgb,var(--accent) 24%,transparent);border-radius:calc(var(--radius) * .55);background:color-mix(in srgb,var(--accent) 7%,var(--bg))}.promo-code-value{margin:0;color:var(--text);font-size:15px;font-weight:800}.promo-code-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:9px}.promo-code{display:flex;align-items:center;min-width:0;min-height:52px;overflow:hidden;border:1px dashed color-mix(in srgb,var(--accent) 55%,var(--text));border-radius:var(--button-radius);padding:9px 14px;color:var(--text);background:var(--bg);font:850 20px/1.1 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.08em;overflow-wrap:anywhere}.promo-code-copy{display:inline-flex;align-items:center;justify-content:center;min-width:112px;min-height:52px;border:1px solid var(--primary-bg);border-radius:var(--button-radius);padding:9px 16px;color:var(--primary-text);background:var(--primary-bg);font:800 var(--button-size)/1.2 Inter,system-ui,sans-serif;cursor:pointer}.promo-code-copy.is-copied{filter:saturate(.75);opacity:.82}.promo-code-note{margin:0;color:var(--muted);font-size:13px;line-height:1.45}.promo-code-cta{display:flex;align-items:center;justify-content:center;min-height:44px;margin-top:14px;border:1px solid var(--primary-bg);border-radius:var(--button-radius);padding:10px 18px;color:var(--primary-text);background:var(--primary-bg);font:800 var(--button-size)/1.2 Inter,system-ui,sans-serif;text-decoration:none;cursor:pointer}@media(max-width:600px){.promo-code-offer{gap:11px;margin-top:17px;padding:14px}.promo-code-row{grid-template-columns:1fr}.promo-code-copy{width:100%}.promo-code{font-size:18px}}\`;
    style.textContent += \`.lead-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px;margin-top:22px}.lead-field{display:grid;align-content:start;gap:6px;min-width:0;color:var(--text);font:700 13px/1.35 Inter,system-ui,sans-serif}.lead-field-textarea,.lead-field-select,.lead-field-checkbox,.lead-form-error,.lead-form-submit{grid-column:1/-1}.lead-field input:not([type=checkbox]),.lead-field textarea,.lead-field select{box-sizing:border-box;width:100%;min-height:46px;border:1px solid color-mix(in srgb,var(--text) 18%,transparent);border-radius:var(--button-radius);padding:10px 12px;color:var(--text);background:var(--bg);font:500 15px/1.35 Inter,system-ui,sans-serif;outline:none}.lead-field textarea{min-height:92px;resize:vertical}.lead-field input:focus,.lead-field textarea:focus,.lead-field select:focus{border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 14%,transparent)}.lead-field input[aria-invalid=true],.lead-field textarea[aria-invalid=true],.lead-field select[aria-invalid=true]{border-color:#dc2626}.lead-field-checkbox{display:flex;align-items:flex-start;gap:9px;padding:4px 0;font-weight:550}.lead-field-checkbox input{flex:0 0 auto;width:18px;height:18px;margin:0;accent-color:var(--accent)}.lead-form-error{min-height:18px;margin:0;color:#b42318;font-size:13px;line-height:1.4}.lead-form-submit{min-height:48px;border:1px solid var(--primary-bg);border-radius:var(--button-radius);padding:10px 18px;color:var(--primary-text);background:var(--primary-bg);font:800 var(--button-size)/1.2 Inter,system-ui,sans-serif;cursor:pointer}.lead-form-submit:disabled{opacity:.6;cursor:wait}.lead-form-success{display:grid;gap:2px;margin-top:20px}.lead-form-success h3{margin:0;color:var(--text);font-size:22px;line-height:1.2}.lead-form-success>p{margin:6px 0 0;color:var(--muted);font-size:14px;line-height:1.45}.lead-form-success .promo-code-offer{margin-top:14px}@media(max-width:600px){.lead-form{grid-template-columns:1fr;gap:11px;margin-top:17px}.lead-field-textarea,.lead-field-select,.lead-field-checkbox,.lead-form-error,.lead-form-submit{grid-column:auto}.lead-form-success h3{font-size:19px}}\`;
    style.textContent += \`.product-promo-host{width:100%;font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--text);pointer-events:none}
.product-promo-host .card{width:100%;max-height:none;overflow:hidden;pointer-events:auto;border:1px solid color-mix(in srgb,var(--text) 12%,transparent);box-shadow:0 18px 52px rgba(15,23,42,.22)}
.card.is-product-promo{display:flex;flex-direction:column;cursor:pointer}
.promo-card-link{position:absolute;z-index:0;inset:0;border-radius:inherit}
.promo-card-link:focus-visible{outline:3px solid color-mix(in srgb,var(--accent) 60%,#fff);outline-offset:2px}
.card.is-product-promo .content,.promo-navigation,.promo-timeline{position:relative;z-index:1}
.card.is-product-promo .close{z-index:2;pointer-events:auto}
.card.is-product-promo .content{box-sizing:border-box;display:flex;min-height:0;flex-direction:column;padding:18px;pointer-events:none}
.card.is-product-promo .content a,.card.is-product-promo .content button{pointer-events:auto}
.card.is-product-promo .title{padding-right:38px;font-size:clamp(20px,var(--title-size),28px);line-height:1.08}
.card.is-product-promo .body{display:-webkit-box;overflow:hidden;margin-top:6px;font-size:clamp(13px,var(--body-size),15px);line-height:1.4;-webkit-box-orient:vertical;-webkit-line-clamp:2}
.card.is-product-promo .recommendations{display:block;min-height:0;margin-top:14px;padding:0;overflow:hidden}
.card.is-product-promo .recommendation{display:none;grid-template-columns:minmax(136px,40%) minmax(0,1fr);grid-template-rows:auto auto auto;align-items:start;gap:10px 16px;min-width:0;padding:12px;cursor:pointer}
.card.is-product-promo .recommendation.is-visible{display:grid;animation:promoSwap .22s ease-out}
.card.is-product-promo .recommendation-media{grid-column:1;grid-row:1/4;display:block;align-self:stretch;min-width:0}
.card.is-product-promo .recommendation-image{width:100%;height:clamp(136px,24vh,220px);aspect-ratio:1;object-fit:contain;background:#fff}
.card.is-product-promo .recommendation-title,.card.is-product-promo .recommendation-price,.card.is-product-promo .recommendation-buy{grid-column:2}
.card.is-product-promo .recommendation-title{align-self:end;-webkit-line-clamp:3}
.card.is-product-promo .recommendation-price{align-self:start}
.card.is-product-promo .recommendation-buy{align-self:end}
.card.is-product-promo.format-compact:not(.has-promo-title) .title{display:none}
.card.is-product-promo.format-compact .recommendation{grid-template-columns:128px minmax(0,1fr)}
.card.is-product-promo.format-compact .recommendation-image{height:128px}
.card.is-product-promo.format-standard .recommendation-image{height:176px}
.card.is-product-promo.format-wide .recommendation-image{height:210px}
.card.is-product-promo.format-notification{border-radius:min(var(--radius),16px)}
.card.is-product-promo.format-notification .content{padding:9px}
.card.is-product-promo.format-notification .eyebrow{display:none}
.card.is-product-promo.format-notification .title{display:-webkit-box;overflow:hidden;margin-bottom:4px;padding-right:30px;font-size:min(var(--title-size),17px);line-height:1.15;-webkit-box-orient:vertical;-webkit-line-clamp:1}
.card.is-product-promo.format-notification .body{display:-webkit-box;overflow:hidden;margin:0 0 7px;font-size:min(var(--body-size),12px);line-height:1.3;-webkit-box-orient:vertical;-webkit-line-clamp:2}
.card.is-product-promo.format-notification .recommendations{margin:0;padding:0}
.card.is-product-promo.format-notification .recommendation{grid-template-areas:"media product-title buy" "media price buy";grid-template-columns:64px minmax(0,1fr) auto;grid-template-rows:minmax(20px,auto) minmax(20px,auto);align-items:center;gap:2px 10px;padding:0;border:0;background:transparent}
.card.is-product-promo.format-notification .recommendation-media{grid-area:media;width:64px;height:64px}
.card.is-product-promo.format-notification .recommendation-image{width:64px;height:64px;border-radius:10px}
.card.is-product-promo.format-notification .recommendation-title{grid-area:product-title;align-self:end;font-size:13px;line-height:1.25;-webkit-line-clamp:2}
.card.is-product-promo.format-notification .recommendation-price{grid-area:price;align-self:start}
.card.is-product-promo.format-notification .recommendation-price strong{font-size:14px}
.card.is-product-promo.format-notification .recommendation-price del{font-size:10px}
.card.is-product-promo.format-notification .recommendation-buy{grid-area:buy;align-self:center;min-height:30px;width:auto;margin-right:30px;padding:5px 10px;font-size:11px}
.card.is-product-promo.format-notification .close{top:5px;right:5px;width:26px;height:26px;font-size:17px}
.promo-navigation{display:grid;grid-template-columns:28px minmax(0,1fr) 28px;align-items:center;gap:8px;min-height:34px;padding:3px 12px 7px;color:var(--muted);background:color-mix(in srgb,var(--text) 4%,var(--bg));pointer-events:auto}
.promo-navigation button{display:grid;place-items:center;width:28px;height:28px;padding:0;border:1px solid color-mix(in srgb,var(--text) 14%,transparent);border-radius:50%;color:var(--text);background:var(--bg);box-shadow:0 3px 10px color-mix(in srgb,var(--text) 15%,transparent);line-height:0;cursor:pointer;transition:transform .15s ease,box-shadow .15s ease}
.promo-navigation button svg{display:block;width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.promo-navigation button:hover{transform:translateY(-1px);box-shadow:0 5px 14px color-mix(in srgb,var(--text) 22%,transparent)}
.promo-navigation button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.promo-navigation-status{min-width:0;font-size:11px;font-weight:750;letter-spacing:.05em;text-align:center}
.card.is-product-promo.format-notification .promo-navigation{grid-template-columns:24px minmax(0,1fr) 24px;min-height:28px;padding:2px 9px 4px}
.card.is-product-promo.format-notification .promo-navigation button{width:24px;height:24px}
.card.is-product-promo.format-notification .promo-navigation button svg{width:13px;height:13px}
.card.is-product-promo.format-notification .promo-navigation-status{font-size:10px}
.promo-timeline{height:4px;overflow:hidden;background:var(--timeline-track);pointer-events:none}
.promo-timeline span{display:block;width:100%;height:100%;background:var(--timeline);transform:scaleX(0);transform-origin:left}
.promo-timeline span.is-running{animation:promoCountdown var(--rotation-seconds) linear forwards}
.card.is-product-promo.is-rotation-paused .promo-timeline span{animation-play-state:paused}
@keyframes promoSwap{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
@keyframes promoCountdown{to{transform:scaleX(1)}}
@media(max-width:600px){.product-promo-host .card{max-height:none;border-radius:var(--radius)}.card.is-product-promo .content{padding:12px}.card.is-product-promo .eyebrow{margin-bottom:4px}.card.is-product-promo .title{font-size:clamp(18px,var(--title-size),22px)}.card.is-product-promo .body{font-size:clamp(12px,var(--body-size),14px)}.card.is-product-promo .recommendations{margin-top:9px}.card.is-product-promo .recommendation{grid-template-columns:112px minmax(0,1fr);gap:7px 10px;padding:9px}.card.is-product-promo .recommendation-image{height:112px}.card.is-product-promo .recommendation-title{font-size:12px;line-height:1.3}.card.is-product-promo .recommendation-price strong{font-size:16px}.card.is-product-promo .recommendation-buy{min-height:38px;font-size:clamp(12px,var(--button-size),14px)}.card.is-product-promo.format-notification .content{padding:8px}.card.is-product-promo.format-notification .title{font-size:min(var(--title-size),17px)}.card.is-product-promo.format-notification .body{font-size:min(var(--body-size),12px)}.card.is-product-promo.format-notification .recommendations{margin:0}.card.is-product-promo.format-notification .recommendation{grid-template-columns:54px minmax(0,1fr) auto;grid-template-rows:minmax(19px,auto) minmax(19px,auto);gap:2px 8px;padding:0}.card.is-product-promo.format-notification .recommendation-media{width:54px;height:54px}.card.is-product-promo.format-notification .recommendation-image{width:54px;height:54px}.card.is-product-promo.format-notification .recommendation-buy{min-height:30px;width:auto;margin-right:28px;padding:5px 8px}.card.is-product-promo.format-notification .close{top:4px;right:4px}}
@media(max-width:360px),(max-height:560px){.card.is-product-promo:not(.format-notification) .body{display:none}.card.is-product-promo:not(.format-notification) .recommendation{grid-template-columns:96px minmax(0,1fr)}.card.is-product-promo:not(.format-notification) .recommendation-image{height:96px}.card.is-product-promo.format-notification .recommendation{grid-template-columns:48px minmax(0,1fr) auto}.card.is-product-promo.format-notification .recommendation-media,.card.is-product-promo.format-notification .recommendation-image{width:48px;height:48px}}\`;
    shadow.append(style);
    const backdrop = document.createElement('div');
    backdrop.className = isProductPromo ? 'product-promo-host' : 'backdrop ' + campaign.styles.layout;
    backdrop.style.setProperty('--accent', campaign.styles.accentColor);
    backdrop.style.setProperty('--bg', campaign.styles.backgroundColor);
    backdrop.style.setProperty('--text', campaign.styles.textColor);
    backdrop.style.setProperty('--muted', campaign.styles.mutedColor);
    backdrop.style.setProperty('--primary-bg', campaign.styles.primaryButtonBackgroundColor);
    backdrop.style.setProperty('--primary-text', campaign.styles.primaryButtonTextColor);
    backdrop.style.setProperty('--secondary-bg', campaign.styles.secondaryButtonBackgroundColor);
    backdrop.style.setProperty('--secondary-text', campaign.styles.secondaryButtonTextColor);
    backdrop.style.setProperty('--checkbox', campaign.styles.checkboxAccentColor);
    backdrop.style.setProperty('--checkbox-check', campaign.styles.checkboxCheckColor);
    backdrop.style.setProperty('--checkbox-text', campaign.styles.checkboxTextColor);
    backdrop.style.setProperty('--timeline', campaign.styles.timelineColor);
    backdrop.style.setProperty('--timeline-track', campaign.styles.timelineTrackColor);
    backdrop.style.setProperty('--eyebrow-size', campaign.styles.eyebrowFontSize + 'px');
    backdrop.style.setProperty('--title-size', campaign.styles.titleFontSize + 'px');
    backdrop.style.setProperty('--body-size', campaign.styles.bodyFontSize + 'px');
    backdrop.style.setProperty('--ack-size', campaign.styles.acknowledgementFontSize + 'px');
    backdrop.style.setProperty('--button-size', campaign.styles.buttonFontSize + 'px');
    backdrop.style.setProperty('--button-radius', campaign.styles.buttonBorderRadius + 'px');
    backdrop.style.setProperty('--radius', campaign.styles.borderRadius + 'px');
    backdrop.style.setProperty('--width', campaign.styles.maxWidth + 'px');
    backdrop.style.setProperty('--rotation-seconds', Math.max(2, Number(campaign.behavior.rotationSeconds) || 6) + 's');
    const card = document.createElement('section');
    card.className = isProductPromo
      ? 'card is-product-promo format-' + promoFormat
        + (promoFormat === 'compact' && campaign.styles.showPromoTitle ? ' has-promo-title' : '')
      : campaign.mode === 'out_of_stock' ? 'card is-recommendations' : 'card';
    card.tabIndex = -1;
    card.setAttribute('role', isProductPromo ? 'complementary' : 'dialog');
    card.setAttribute('aria-modal', isProductPromo ? 'false' : 'true');
    let activePromoProduct = null;
    let promoCardLink = null;
    if (isProductPromo) {
      promoCardLink = document.createElement('a');
      promoCardLink.className = 'promo-card-link';
      promoCardLink.href = '#';
      promoCardLink.addEventListener('click', (clickEvent) => {
        if (previewMode) { clickEvent.preventDefault(); return; }
        if (!activePromoProduct) return;
        event(campaign.publicId, 'click', productArticle, {
          action: 'open_recommendation',
          recommendationProductId: activePromoProduct.productId,
          modificationId: activePromoProduct.modificationId,
          article: activePromoProduct.article
        });
      });
      card.append(promoCardLink);
    }
    if (!isProductPromo) card.addEventListener('keydown', (keyEvent) => {
      if (keyEvent.key !== 'Tab') return;
      const focusable = [...card.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')];
      if (!focusable.length) { keyEvent.preventDefault(); return; }
      const first = focusable[0]; const last = focusable[focusable.length - 1]; const active = shadow.activeElement;
      if (keyEvent.shiftKey && (active === card || active === first)) { keyEvent.preventDefault(); last.focus(); }
      else if (!keyEvent.shiftKey && active === last) { keyEvent.preventDefault(); first.focus(); }
    });
    const close = (kind) => {
      event(campaign.publicId, kind, productArticle);
      for (const cleanup of cleanupTasks) cleanup();
      activeCleanup = null;
      host.remove(); currentHost = null;
    };
    if (campaign.behavior.dismissible) {
      const closeButton = document.createElement('button');
      closeButton.className = 'close'; closeButton.type = 'button'; closeButton.setAttribute('aria-label', 'Закрити'); closeButton.textContent = '×';
      closeButton.addEventListener('click', () => { if (!previewMode) close('dismiss'); }); card.append(closeButton);
      if (!isProductPromo) backdrop.addEventListener('click', (clickEvent) => { if (!previewMode && clickEvent.target === backdrop) close('dismiss'); });
    }
    if (campaign.content.imageUrl && !(isProductPromo && promoFormat === 'notification')) {
      const image = document.createElement('img'); image.className = 'image'; image.src = imageUrl(campaign.content.imageUrl); image.alt = ''; card.append(image);
    }
    const content = document.createElement('div'); content.className = 'content';
    if (campaign.content.eyebrow && !(isProductPromo && promoFormat === 'notification')) { const node = document.createElement('p'); node.className = 'eyebrow'; node.textContent = campaign.content.eyebrow; content.append(node); }
    if (campaign.content.title) {
      const title = document.createElement('h2'); title.className = 'title'; title.id = 'mt-popup-title-' + campaign.publicId; title.textContent = campaign.content.title; content.append(title);
      card.setAttribute('aria-labelledby', title.id);
    } else card.setAttribute('aria-label', isProductPromo ? 'Товарний промобанер' : isPromoCode ? 'Банер із промокодом' : isLeadForm ? 'Форма за промокод' : 'Інформаційний попап');
    if (campaign.content.body) { const body = document.createElement('p'); body.className = 'body'; body.textContent = campaign.content.body; content.append(body); }
    if (isLeadForm) {
      const formConfig = campaign.formConfig || { fields: [], submitLabel: 'Отримати промокод', successTitle: '', successBody: '' };
      const form = document.createElement('form'); form.className = 'lead-form'; form.noValidate = true;
      const bindings = [];
      for (const field of formConfig.fields || []) {
        const label = document.createElement('label'); label.className = 'lead-field lead-field-' + field.type;
        let control;
        if (field.type === 'checkbox') {
          control = document.createElement('input'); control.type = 'checkbox';
          const text = document.createElement('span'); text.textContent = field.label;
          label.append(control, text);
        } else {
          const text = document.createElement('span'); text.textContent = field.label + (field.required ? ' *' : '');
          if (field.type === 'textarea') control = document.createElement('textarea');
          else if (field.type === 'select') {
            control = document.createElement('select');
            const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = field.placeholder || 'Оберіть значення'; control.append(placeholder);
            for (const option of field.options || []) { const node = document.createElement('option'); node.value = option; node.textContent = option; control.append(node); }
          } else {
            control = document.createElement('input');
            control.type = field.type === 'phone' ? 'tel' : field.type === 'email' ? 'email' : 'text';
          }
          if (field.placeholder && field.type !== 'select') control.placeholder = field.placeholder;
          label.append(text, control);
        }
        control.name = field.id; control.required = Boolean(field.required);
        control.autocomplete = field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : field.id === 'name' ? 'name' : 'off';
        form.append(label); bindings.push({ field, control });
      }
      const formError = document.createElement('p'); formError.className = 'lead-form-error'; formError.setAttribute('role', 'alert');
      const submit = document.createElement('button'); submit.className = 'lead-form-submit'; submit.type = 'submit'; submit.textContent = formConfig.submitLabel || 'Отримати промокод';
      form.append(formError, submit);
      form.addEventListener('submit', async (submitEvent) => {
        submitEvent.preventDefault();
        formError.textContent = '';
        const values = {};
        let valid = true;
        for (const binding of bindings) {
          const value = binding.field.type === 'checkbox' ? binding.control.checked : String(binding.control.value || '').trim();
          values[binding.field.id] = value;
          binding.control.removeAttribute('aria-invalid');
          if (binding.field.required && (binding.field.type === 'checkbox' ? value !== true : !value)) {
            binding.control.setAttribute('aria-invalid', 'true'); valid = false;
          }
          if (binding.field.type === 'email' && value && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/u.test(value)) {
            binding.control.setAttribute('aria-invalid', 'true'); valid = false;
          }
          if (binding.field.type === 'phone' && value) {
            const digits = value.replace(/\\D/gu, '');
            if (digits.length < 7 || digits.length > 15) { binding.control.setAttribute('aria-invalid', 'true'); valid = false; }
          }
        }
        if (!valid) { formError.textContent = 'Перевірте обов’язкові поля.'; bindings.find((binding) => binding.control.getAttribute('aria-invalid') === 'true')?.control.focus(); return; }
        submit.disabled = true; submit.textContent = 'Надсилаємо…';
        try {
          let promo = campaign.promoCode;
          if (!previewMode) {
            const response = await fetch(new URL('/api/public/popup-banners/' + campaign.publicId + '/contacts', apiOrigin), {
              method: 'POST',
              headers: { 'content-type': 'application/json', accept: 'application/json' },
              body: JSON.stringify({ values, pageUrl: location.href, article: productArticle, visitorKey })
            });
            const envelope = await response.json().catch(() => ({}));
            if (!response.ok || !envelope.data?.promoCode?.code) throw new Error(envelope.error?.message || 'Не вдалося зберегти контакт.');
            promo = envelope.data.promoCode;
          }
          if (!promo?.code) throw new Error('Для прев’ю не вибрано промокод.');
          const success = document.createElement('div'); success.className = 'lead-form-success';
          if (formConfig.successTitle) { const title = document.createElement('h3'); title.textContent = formConfig.successTitle; success.append(title); }
          if (formConfig.successBody) { const body = document.createElement('p'); body.textContent = formConfig.successBody; success.append(body); }
          const copy = appendPromoCode(success, promo, campaign, productArticle, false);
          form.replaceWith(success);
          copy?.focus();
        } catch (error) {
          submit.disabled = false; submit.textContent = formConfig.submitLabel || 'Отримати промокод';
          formError.textContent = error instanceof Error ? error.message : 'Не вдалося надіслати форму. Спробуйте ще раз.';
        }
      });
      content.append(form);
      card.append(content); backdrop.append(card); shadow.append(backdrop); document.body.append(host);
      currentHost = host; remember(payload); event(campaign.publicId, 'impression', productArticle);
      if (!previewMode && campaign.behavior.autoCloseSeconds > 0) {
        const autoCloseTimer = setTimeout(() => { if (currentHost === host) close('dismiss'); }, campaign.behavior.autoCloseSeconds * 1000);
        cleanupTasks.push(() => clearTimeout(autoCloseTimer));
      }
      activeCleanup = () => { for (const cleanup of cleanupTasks) cleanup(); };
      requestAnimationFrame(() => bindings[0]?.control.focus());
      return;
    }
    if (isPromoCode) {
      const promo = campaign.promoCode || {};
      const copy = appendPromoCode(content, promo, campaign, productArticle, true);
      card.append(content); backdrop.append(card); shadow.append(backdrop); document.body.append(host);
      currentHost = host; remember(payload); event(campaign.publicId, 'impression', productArticle);
      if (!previewMode && campaign.behavior.autoCloseSeconds > 0) {
        const autoCloseTimer = setTimeout(() => { if (currentHost === host) close('dismiss'); }, campaign.behavior.autoCloseSeconds * 1000);
        cleanupTasks.push(() => clearTimeout(autoCloseTimer));
      }
      activeCleanup = () => { for (const cleanup of cleanupTasks) cleanup(); };
      requestAnimationFrame(() => copy.focus());
      return;
    }
    if (campaign.mode === 'out_of_stock' || isProductPromo) {
      const recommendations = document.createElement('div'); recommendations.className = 'recommendations';
      const recommendationEntries = [];
      for (const recommendation of (isProductPromo ? payload.products : payload.recommendations) || []) {
        const item = document.createElement('article'); item.className = 'recommendation';
        const imageLink = document.createElement('a'); imageLink.className = 'recommendation-media'; imageLink.href = recommendation.pageUrl;
        imageLink.addEventListener('click', (clickEvent) => {
          if (previewMode) { clickEvent.preventDefault(); return; }
          event(campaign.publicId, 'click', productArticle, { action: 'open_recommendation', recommendationProductId: recommendation.productId, modificationId: recommendation.modificationId, article: recommendation.article });
        });
        if (recommendation.imageUrl) {
          const image = document.createElement('img'); image.className = 'recommendation-image'; image.src = imageUrl(recommendation.imageUrl); image.alt = recommendation.title; image.loading = 'lazy'; imageLink.append(image);
        }
        const itemTitle = document.createElement('a'); itemTitle.className = 'recommendation-title'; itemTitle.href = recommendation.pageUrl; itemTitle.textContent = recommendation.title;
        itemTitle.addEventListener('click', (clickEvent) => {
          if (previewMode) { clickEvent.preventDefault(); return; }
          event(campaign.publicId, 'click', productArticle, { action: 'open_recommendation', recommendationProductId: recommendation.productId, modificationId: recommendation.modificationId, article: recommendation.article });
        });
        const price = document.createElement('div'); price.className = 'recommendation-price';
        const currentPrice = document.createElement('strong'); currentPrice.textContent = money(recommendation.price, recommendation.currency); price.append(currentPrice);
        if (recommendation.oldPrice && recommendation.oldPrice !== recommendation.price) { price.classList.add('is-discounted'); const oldPrice = document.createElement('del'); oldPrice.textContent = money(recommendation.oldPrice, recommendation.currency); price.append(oldPrice); }
        const buy = document.createElement('button'); buy.className = 'recommendation-buy'; buy.type = 'button'; buy.textContent = campaign.content.primaryLabel || 'Купити';
        buy.addEventListener('click', async () => {
          if (previewMode) return;
          buy.disabled = true; buy.textContent = 'Додаємо…';
          event(campaign.publicId, 'click', productArticle, { action: 'add_to_cart', recommendationProductId: recommendation.productId, modificationId: recommendation.modificationId, article: recommendation.article });
          const isCurrent = () => currentHost === host && host.isConnected;
          const result = await nativeBuy(recommendation, isCurrent);
          if (!isCurrent()) return;
          if (result === 'added' && !isProductPromo) setTimeout(() => {
            if (!isCurrent()) return;
            host.remove(); currentHost = null;
          }, 180);
          else if (result === 'added') { buy.textContent = 'У кошику'; buy.title = 'Товар додано до кошика.'; }
          else if (result === 'already') { buy.textContent = 'У кошику'; buy.title = 'Товар уже додано до кошика.'; }
          else { buy.disabled = false; buy.textContent = 'Спробувати ще'; buy.title = 'Не вдалося додати товар. Повторіть спробу.'; }
        });
        item.append(imageLink, itemTitle, price, buy);
        recommendations.append(item);
        recommendationEntries.push({ node: item, product: recommendation });
      }
      content.append(recommendations);
      card.append(content);
      if (isProductPromo && recommendationEntries.length) {
        let visibleIndex = 0;
        let navigationStatus = null;
        const showProduct = (index) => {
          visibleIndex = (index + recommendationEntries.length) % recommendationEntries.length;
          for (const entry of recommendationEntries) entry.node.classList.remove('is-visible');
          const entry = recommendationEntries[visibleIndex];
          entry.node.classList.add('is-visible');
          activePromoProduct = entry.product;
          promoCardLink.href = entry.product.pageUrl;
          promoCardLink.setAttribute('aria-label', 'Перейти до товару: ' + entry.product.title);
          if (navigationStatus) navigationStatus.textContent = (visibleIndex + 1) + ' / ' + recommendationEntries.length;
        };
        if (recommendationEntries.length > 1) {
          const createNavigationIcon = (pathData) => {
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', pathData);
            svg.append(path);
            return svg;
          };
          const navigation = document.createElement('nav'); navigation.className = 'promo-navigation'; navigation.setAttribute('aria-label', 'Навігація між товарами');
          const previous = document.createElement('button'); previous.type = 'button'; previous.setAttribute('aria-label', 'Попередній товар'); previous.append(createNavigationIcon('M15 18 9 12l6-6'));
          navigationStatus = document.createElement('span'); navigationStatus.className = 'promo-navigation-status'; navigationStatus.setAttribute('aria-live', 'polite');
          const next = document.createElement('button'); next.type = 'button'; next.setAttribute('aria-label', 'Наступний товар'); next.append(createNavigationIcon('m9 6 6 6-6 6'));
          navigation.append(previous, navigationStatus, next); card.append(navigation);
          const timeline = document.createElement('div'); timeline.className = 'promo-timeline'; timeline.setAttribute('aria-hidden', 'true');
          const timelineFill = document.createElement('span'); timelineFill.className = 'is-running'; timeline.append(timelineFill); card.append(timeline);
          const rotationDuration = Math.max(2, Number(campaign.behavior.rotationSeconds) || 6) * 1000;
          let remainingRotation = rotationDuration;
          let rotationStartedAt = 0;
          let rotationTimer = null;
          let pointerPaused = false;
          const restartTimeline = () => {
            timelineFill.classList.remove('is-running');
            void timelineFill.offsetWidth;
            timelineFill.classList.add('is-running');
          };
          const clearRotationTimer = () => {
            if (rotationTimer === null) return;
            clearTimeout(rotationTimer);
            rotationTimer = null;
          };
          const scheduleRotation = () => {
            if (pointerPaused || rotationTimer !== null) return;
            rotationStartedAt = Date.now();
            rotationTimer = setTimeout(() => {
              rotationTimer = null;
              remainingRotation = rotationDuration;
              showProduct(visibleIndex + 1);
              restartTimeline();
              scheduleRotation();
            }, Math.max(1, remainingRotation));
          };
          const syncRotationPause = () => {
            card.classList.toggle('is-rotation-paused', pointerPaused);
            if (pointerPaused) {
              if (rotationTimer !== null) {
                remainingRotation = Math.max(1, remainingRotation - (Date.now() - rotationStartedAt));
                clearRotationTimer();
              }
            } else scheduleRotation();
          };
          const moveProduct = (direction) => {
            clearRotationTimer();
            remainingRotation = rotationDuration;
            showProduct(visibleIndex + direction);
            restartTimeline();
            scheduleRotation();
          };
          const onMouseEnter = () => { pointerPaused = true; syncRotationPause(); };
          const onMouseLeave = () => { pointerPaused = false; syncRotationPause(); };
          previous.addEventListener('click', () => moveProduct(-1));
          next.addEventListener('click', () => moveProduct(1));
          card.addEventListener('mouseenter', onMouseEnter);
          card.addEventListener('mouseleave', onMouseLeave);
          showProduct(0);
          scheduleRotation();
          cleanupTasks.push(() => {
            clearRotationTimer();
            card.removeEventListener('mouseenter', onMouseEnter);
            card.removeEventListener('mouseleave', onMouseLeave);
          });
        } else showProduct(0);
      }
      backdrop.append(card); shadow.append(backdrop); document.body.append(host);
      currentHost = host; remember(payload); event(campaign.publicId, 'impression', productArticle);
      if (!previewMode && campaign.behavior.autoCloseSeconds > 0) {
        const autoCloseTimer = setTimeout(() => { if (currentHost === host) close('dismiss'); }, campaign.behavior.autoCloseSeconds * 1000);
        cleanupTasks.push(() => clearTimeout(autoCloseTimer));
      }
      activeCleanup = () => { for (const cleanup of cleanupTasks) cleanup(); };
      if (!isProductPromo) requestAnimationFrame(() => card.focus({ preventScroll: true }));
      return;
    }
    let acknowledgement = null;
    if (campaign.behavior.requireAcknowledgement) {
      const label = document.createElement('label'); label.className = 'ack';
      acknowledgement = document.createElement('input'); acknowledgement.type = 'checkbox';
      const text = document.createElement('span'); text.textContent = campaign.content.acknowledgementLabel;
      label.append(acknowledgement, text); content.append(label);
    }
    const actions = document.createElement('div'); actions.className = 'actions';
    if (campaign.behavior.buttonCount === 2) {
      const secondary = document.createElement('button'); secondary.className = 'button secondary'; secondary.type = 'button'; secondary.textContent = campaign.content.secondaryLabel || 'Закрити';
      secondary.addEventListener('click', () => { if (!previewMode) close('dismiss'); }); actions.append(secondary);
    }
    const primary = document.createElement('button'); primary.className = 'button primary'; primary.type = 'button'; primary.textContent = campaign.content.primaryLabel;
    primary.disabled = Boolean(acknowledgement && !acknowledgement.checked);
    acknowledgement?.addEventListener('change', () => { primary.disabled = !acknowledgement.checked; });
    primary.addEventListener('click', () => {
      if (previewMode) return;
      event(campaign.publicId, campaign.behavior.requireAcknowledgement ? 'acknowledge' : 'click', productArticle);
      const target = campaign.content.primaryUrl;
      host.remove(); currentHost = null;
      if (target) { try { location.assign(new URL(target, location.href).href); } catch {} }
    });
    actions.append(primary); content.append(actions); card.append(content); backdrop.append(card); shadow.append(backdrop); document.body.append(host);
    currentHost = host; remember(payload); event(campaign.publicId, 'impression', productArticle);
    if (!previewMode && campaign.behavior.autoCloseSeconds > 0) {
      const autoCloseTimer = setTimeout(() => { if (currentHost === host) close('dismiss'); }, campaign.behavior.autoCloseSeconds * 1000);
      cleanupTasks.push(() => clearTimeout(autoCloseTimer));
    }
    activeCleanup = () => { for (const cleanup of cleanupTasks) cleanup(); };
    requestAnimationFrame(() => primary.focus());
  }

  function clearPendingRender() {
    if (pendingTimer) clearTimeout(pendingTimer);
    pendingTimer = null;
    if (pendingCleanup) pendingCleanup();
    pendingCleanup = null;
  }

  function scheduleRender(payload, productArticle, evaluatedUrl) {
    const behavior = payload.campaign.behavior;
    const show = () => {
      clearPendingRender();
      if (location.href === evaluatedUrl) render(payload, productArticle);
    };
    if (behavior.trigger === 'exit_intent') {
      const mobile = isMobileInteractionSurface();
      let armed = behavior.delayMs <= 0;
      let exitPending = false;
      let maxScrollY = Math.max(0, scrollY);
      let touchStartY = null;
      let touchStartedAt = 0;
      let hiddenAt = 0;
      const signalExit = () => {
        if (armed) show();
        else exitPending = true;
      };
      const leftThroughTop = (mouseEvent) => !mobile
        && !mouseEvent.relatedTarget
        && Number(mouseEvent.clientY) <= 20;
      const onMouseOut = (mouseEvent) => {
        if (!leftThroughTop(mouseEvent)) return;
        signalExit();
      };
      const onMouseLeave = (mouseEvent) => {
        if (!leftThroughTop(mouseEvent)) return;
        signalExit();
      };
      const onScroll = () => { maxScrollY = Math.max(maxScrollY, Math.max(0, scrollY)); };
      const onTouchStart = (touchEvent) => {
        if (!mobile) return;
        const touch = touchEvent.touches?.[0];
        touchStartY = Number.isFinite(touch?.clientY) ? touch.clientY : null;
        touchStartedAt = Date.now();
      };
      const onTouchEnd = (touchEvent) => {
        if (!mobile || touchStartY === null) return;
        const touch = touchEvent.changedTouches?.[0];
        const endY = Number.isFinite(touch?.clientY) ? touch.clientY : touchStartY;
        const returnedUp = endY - touchStartY >= 70;
        const quickGesture = Date.now() - touchStartedAt <= 900;
        const nearTop = scrollY <= 80;
        const exploredPage = maxScrollY >= 140;
        touchStartY = null;
        if (returnedUp && quickGesture && nearTop && exploredPage) signalExit();
      };
      const onVisibilityChange = () => {
        if (!mobile) return;
        if (document.visibilityState === 'hidden') hiddenAt = Date.now();
        else if (hiddenAt && Date.now() - hiddenAt >= 600) signalExit();
      };
      document.addEventListener('mouseout', onMouseOut);
      document.documentElement.addEventListener('mouseleave', onMouseLeave);
      addEventListener('scroll', onScroll, { passive: true });
      document.addEventListener('touchstart', onTouchStart, { passive: true });
      document.addEventListener('touchend', onTouchEnd, { passive: true });
      document.addEventListener('visibilitychange', onVisibilityChange);
      if (!armed) pendingTimer = setTimeout(() => {
        pendingTimer = null;
        armed = true;
        if (exitPending) show();
      }, behavior.delayMs);
      pendingCleanup = () => {
        document.removeEventListener('mouseout', onMouseOut);
        document.documentElement.removeEventListener('mouseleave', onMouseLeave);
        removeEventListener('scroll', onScroll);
        document.removeEventListener('touchstart', onTouchStart);
        document.removeEventListener('touchend', onTouchEnd);
        document.removeEventListener('visibilitychange', onVisibilityChange);
      };
      return;
    }
    if (behavior.trigger === 'scroll') {
      const onScroll = () => {
        const scrollable = Math.max(document.documentElement.scrollHeight - innerHeight, 1);
        if ((scrollY / scrollable) * 100 >= behavior.scrollPercent) show();
      };
      addEventListener('scroll', onScroll, { passive: true });
      pendingCleanup = () => removeEventListener('scroll', onScroll);
      onScroll();
      return;
    }
    if (behavior.trigger === 'inactivity') {
      const activityEvents = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
      const reset = () => {
        if (pendingTimer) clearTimeout(pendingTimer);
        pendingTimer = setTimeout(show, behavior.inactivitySeconds * 1000);
      };
      for (const name of activityEvents) addEventListener(name, reset, { passive: true });
      pendingCleanup = () => { for (const name of activityEvents) removeEventListener(name, reset); };
      reset();
      return;
    }
    pendingTimer = setTimeout(show, behavior.delayMs);
  }

  async function evaluate() {
    const evaluatedUrl = location.href;
    currentUrl = evaluatedUrl;
    clearPendingRender();
    if (activeCleanup) activeCleanup();
    activeCleanup = null;
    currentHost?.remove(); currentHost = null;
    const productArticle = article();
    const productStockState = stockState();
    const url = new URL('/api/public/popup-banners/resolve', apiOrigin);
    url.searchParams.set('pageUrl', location.href);
    if (productArticle) url.searchParams.set('article', productArticle);
    url.searchParams.set('stockState', productStockState);
    try {
      const response = await fetch(url, { headers: { accept: 'application/json' } });
      if (!response.ok) return;
      const envelope = await response.json();
      if (!envelope.data || location.href !== evaluatedUrl) return;
      if (!deviceAllowed(envelope.data.campaign.behavior)) return;
      scheduleRender(envelope.data, productArticle, evaluatedUrl);
    } catch {}
  }

  if (previewMode) {
    render(previewPayload, previewPayload.product?.article || '');
    return;
  }
  evaluate();
  setInterval(() => { if (location.href !== currentUrl) evaluate(); }, 1000);
  let observedStockState = stockState();
  new MutationObserver(() => {
    const nextStockState = stockState();
    if (nextStockState === observedStockState) return;
    observedStockState = nextStockState;
    evaluate();
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'content', 'href', 'data-availability'] });
})();`;
}

export function popupEmbedCode(origin) {
  return `<script async src="${origin}/api/public/popup-banners/embed.js"></script>`;
}
