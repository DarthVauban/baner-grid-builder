import { randomUUID } from 'node:crypto';
import { pool, query } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import { getUserToolAccess } from '../access/access.service.js';

export const applicationStatuses = ['new', 'in_progress', 'rejected', 'closed'];
export const applicationStatusLabels = {
  new: 'Нова',
  in_progress: 'В обробці',
  rejected: 'Відхилена',
  closed: 'Закрита'
};

const systemFields = [
  { key: 'first_name', label: 'Імʼя', type: 'text', systemFieldType: 'first_name', sortOrder: 10 },
  { key: 'last_name', label: 'Прізвище', type: 'text', systemFieldType: 'last_name', sortOrder: 20 },
  { key: 'phone', label: 'Телефон', type: 'phone', systemFieldType: 'phone', sortOrder: 30 },
  { key: 'bank', label: 'Банк', type: 'select', systemFieldType: 'bank', sortOrder: 40 }
];

export function cleanText(value, max = 1000) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim()
    .slice(0, max);
}

export function cleanUrl(value, max = 4000) {
  const text = cleanText(value, max);
  if (!text) return '';
  try {
    const url = new URL(text);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return url.toString().slice(0, max);
  } catch {
    return '';
  }
}

function isLikelyImagePath(pathname) {
  return /\.(?:avif|gif|jpe?g|png|svg|webp)(?:[?#].*)?$/i.test(pathname || '');
}

export function cleanImageUrl(value, baseUrl = '', max = 4000) {
  const text = cleanText(value, max);
  if (!text) return '';
  try {
    const url = new URL(text, baseUrl || undefined);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    if (!isLikelyImagePath(`${url.pathname}${url.search}`)) return '';
    return url.toString().slice(0, max);
  } catch {
    return '';
  }
}

export function cleanDomain(value, max = 255) {
  const text = cleanText(value, max);
  if (text) return text;
  try {
    const url = new URL(value);
    return url.hostname.slice(0, max);
  } catch {
    return '';
  }
}

export function normalizeSlug(value, fallback = 'field') {
  const normalized = cleanText(value, 80)
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  return normalized || `${fallback}_${randomUUID().slice(0, 8)}`;
}

export function serializeBank(row) {
  return {
    id: row.id,
    label: row.label,
    value: row.value,
    active: row.active === true,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function serializeField(row, options = []) {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    type: row.type,
    placeholder: row.placeholder,
    helpText: row.help_text,
    defaultValue: row.default_value,
    required: row.required === true,
    active: row.active === true,
    system: row.system === true,
    systemFieldType: row.system_field_type || null,
    sortOrder: row.sort_order,
    validation: row.validation || {},
    options: options.map((option) => ({
      id: option.id,
      label: option.label,
      value: option.value,
      sortOrder: option.sort_order,
      active: option.active === true
    }))
  };
}

export function serializeForm(row, fields = []) {
  return {
    id: row.id,
    publicId: row.public_id,
    name: row.name,
    title: row.title,
    description: row.description,
    buttonText: row.button_text,
    successMessage: row.success_message,
    status: row.status,
    settings: row.settings || {},
    styles: row.styles || {},
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    fields
  };
}

export function serializeButtonConfig(row) {
  return {
    id: row.id,
    name: row.name,
    formId: row.form_id,
    selector: row.selector,
    insertPosition: row.insert_position,
    text: row.text,
    styles: row.styles || {},
    cssClass: row.css_class,
    fullWidth: row.full_width === true,
    active: row.active === true,
    productSelectors: row.product_selectors || {},
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function ensureSystemFields(db, formId) {
  for (const field of systemFields) {
    await db.query(
      `INSERT INTO application_form_fields (
         form_id, key, label, type, required, active, system, system_field_type, sort_order
       ) VALUES ($1, $2, $3, $4, TRUE, TRUE, TRUE, $5, $6)
       ON CONFLICT (form_id, key) DO UPDATE SET
         required = TRUE,
         active = TRUE,
         system = TRUE,
         system_field_type = EXCLUDED.system_field_type,
         type = EXCLUDED.type,
         sort_order = EXCLUDED.sort_order,
         updated_at = NOW()`,
      [formId, field.key, field.label, field.type, field.systemFieldType, field.sortOrder]
    );
  }
}

export async function loadFields(formId, db = pool) {
  const fieldsResult = await db.query(
    `SELECT *
     FROM application_form_fields
     WHERE form_id = $1
     ORDER BY sort_order, created_at`,
    [formId]
  );
  const fieldIds = fieldsResult.rows.map((field) => field.id);
  const optionsByField = new Map(fieldIds.map((id) => [id, []]));
  if (fieldIds.length) {
    const placeholders = fieldIds.map((_, index) => `$${index + 1}`).join(', ');
    const optionsResult = await db.query(
      `SELECT *
       FROM application_form_field_options
       WHERE field_id IN (${placeholders})
       ORDER BY sort_order, label`,
      fieldIds
    );
    for (const option of optionsResult.rows) {
      optionsByField.get(option.field_id)?.push(option);
    }
  }
  return fieldsResult.rows.map((field) => serializeField(field, optionsByField.get(field.id) || []));
}

export async function loadForm(formId, db = pool) {
  const result = await db.query(
    'SELECT * FROM application_forms WHERE id = $1 AND status <> $2',
    [formId, 'archived']
  );
  const form = result.rows[0];
  if (!form) return null;
  return serializeForm(form, await loadFields(form.id, db));
}

export async function loadPublishedForm(publicId, db = pool) {
  const result = await db.query(
    'SELECT * FROM application_forms WHERE public_id = $1 AND status = $2',
    [publicId, 'published']
  );
  const form = result.rows[0];
  if (!form) return null;
  const fields = await loadFields(form.id, db);
  const banks = await db.query(
    `SELECT *
     FROM application_banks
     WHERE active = TRUE
     ORDER BY sort_order, lower(label)`,
    []
  );
  return { ...serializeForm(form, fields.filter((field) => field.active)), banks: banks.rows.map(serializeBank) };
}

export async function generateApplicationNumber(db) {
  const result = await db.query(
    `UPDATE application_number_sequence
     SET next_number = next_number + 1
     WHERE scope = 'default'
     RETURNING next_number - 1 AS value`
  );
  const value = Number(result.rows[0]?.value || 0);
  if (!value || value > 99999) {
    throw new AppError(409, 'APPLICATION_NUMBER_LIMIT', 'Ліміт пʼятизначних номерів заявок вичерпано.');
  }
  return String(value).padStart(5, '0');
}

export async function getApplicationRecipientIds(db = { query }) {
  const result = await db.query(
    `SELECT users.id
     FROM users
     LEFT JOIN user_tool_access AS access
       ON access.user_id = users.id AND access.tool_id = 'applications'
     WHERE users.status = 'approved'
       AND (users.role = 'admin' OR access.user_id IS NOT NULL)
     ORDER BY users.id`
  );
  return result.rows.map((row) => row.id);
}

export async function canAccessApplications(user, db = { query }) {
  return (await getUserToolAccess(user, db)).includes('applications');
}

export function mapApplicationValues(values) {
  const system = {};
  const additional = [];
  for (const value of values) {
    const item = {
      id: value.id,
      fieldId: value.field_id,
      key: value.field_key_snapshot,
      label: value.field_label_snapshot,
      type: value.field_type_snapshot,
      systemFieldType: value.system_field_type || null,
      value: value.value,
      optionLabel: value.option_label_snapshot,
      sortOrder: value.sort_order
    };
    if (item.systemFieldType) system[item.systemFieldType] = item;
    else additional.push(item);
  }
  return {
    customer: {
      firstName: system.first_name?.value || '',
      lastName: system.last_name?.value || '',
      phone: system.phone?.value || '',
      bankValue: system.bank?.value || '',
      bankLabel: system.bank?.optionLabel || system.bank?.value || ''
    },
    values: additional
  };
}

export function serializeApplication(row, values = [], product = null, history = [], comments = []) {
  const mapped = mapApplicationValues(values);
  return {
    id: row.id,
    number: row.application_number,
    status: row.status,
    statusLabel: applicationStatusLabels[row.status] || row.status,
    formId: row.form_id,
    formPublicId: row.form_public_id,
    formName: row.form_name_snapshot,
    sourceUrl: row.source_url,
    canonicalUrl: row.canonical_url,
    pageTitle: row.page_title,
    referrer: row.referrer,
    utm: row.utm || {},
    source: row.source,
    version: row.version,
    lastChangedBy: row.last_changed_by ? {
      id: row.last_changed_by,
      name: row.last_changed_by_name || ''
    } : null,
    customer: mapped.customer,
    values: mapped.values,
    product: product ? {
      title: product.title,
      url: product.url,
      imageUrl: product.image_url,
      imageProxyUrl: product.image_url ? `/api/applications/${row.id}/product-image` : '',
      price: product.price,
      oldPrice: product.old_price,
      currency: product.currency,
      sku: product.sku,
      productCode: product.product_code,
      availability: product.availability,
      externalProductId: product.external_product_id,
      domain: product.domain,
      rawSafeData: product.raw_safe_data || {},
      capturedAt: product.captured_at
    } : null,
    history: history.map((item) => ({
      id: item.id,
      previousStatus: item.previous_status,
      newStatus: item.new_status,
      newStatusLabel: applicationStatusLabels[item.new_status] || item.new_status,
      changedBy: item.changed_by ? { id: item.changed_by, name: item.changed_by_name || '' } : null,
      comment: item.comment,
      createdAt: item.created_at
    })),
    comments: comments.map((comment) => ({
      id: comment.id,
      user: { id: comment.user_id, name: comment.user_name || '' },
      text: comment.text,
      createdAt: comment.created_at,
      updatedAt: comment.updated_at
    })),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function loadApplicationView(applicationId, viewer, db = pool) {
  if (!await canAccessApplications(viewer, db)) return null;
  const result = await db.query(
    `SELECT applications.*, changer.name AS last_changed_by_name
     FROM applications
     LEFT JOIN users AS changer ON changer.id = applications.last_changed_by
     WHERE applications.id = $1`,
    [applicationId]
  );
  const application = result.rows[0];
  if (!application) return null;
  const [values, product, history, comments] = await Promise.all([
    db.query(
      `SELECT *
       FROM application_values
       WHERE application_id = $1
       ORDER BY sort_order, created_at`,
      [applicationId]
    ),
    db.query('SELECT * FROM application_product_snapshots WHERE application_id = $1', [applicationId]),
    db.query(
      `SELECT history.*, users.name AS changed_by_name
       FROM application_status_history AS history
       LEFT JOIN users ON users.id = history.changed_by
       WHERE history.application_id = $1
       ORDER BY history.created_at DESC`,
      [applicationId]
    ),
    db.query(
      `SELECT comments.*, users.name AS user_name
       FROM application_comments AS comments
       JOIN users ON users.id = comments.user_id
       WHERE comments.application_id = $1
       ORDER BY comments.created_at`,
      [applicationId]
    )
  ]);
  return serializeApplication(application, values.rows, product.rows[0] || null, history.rows, comments.rows);
}

export async function loadApplicationChatPreview(reference, viewer, db = pool) {
  const application = await loadApplicationView(reference.id, viewer, db);
  if (!application) return { ...reference, available: false };
  return {
    ...reference,
    available: true,
    data: {
      number: application.number,
      status: application.status,
      statusLabel: application.statusLabel,
      formName: application.formName,
      customerName: [application.customer.firstName, application.customer.lastName].filter(Boolean).join(' '),
      bankLabel: application.customer.bankLabel,
      productTitle: application.product?.title || application.pageTitle || 'Товар не визначено',
      productImageUrl: application.product?.imageProxyUrl || application.product?.imageUrl || '',
      sourceUrl: application.sourceUrl,
      version: application.version,
      createdAt: application.createdAt,
      updatedAt: application.updatedAt
    }
  };
}

export function buildSafeProductSnapshot(product = {}, context = {}) {
  const sourceUrl = cleanUrl(context.sourceUrl || context.url || product.url || '');
  let domain = cleanDomain(product.domain || context.domain || '');
  if (!domain && sourceUrl) {
    try { domain = new URL(sourceUrl).hostname; } catch { domain = ''; }
  }
  const snapshot = {
    title: cleanText(product.title || context.productTitle || context.pageTitle || '', 500),
    url: cleanUrl(product.url || sourceUrl),
    imageUrl: cleanImageUrl(product.imageUrl || product.image || '', sourceUrl),
    price: cleanText(product.price, 120),
    oldPrice: cleanText(product.oldPrice, 120),
    currency: cleanText(product.currency, 20),
    sku: cleanText(product.sku, 160),
    productCode: cleanText(product.productCode, 160),
    availability: cleanText(product.availability, 160),
    externalProductId: cleanText(product.externalProductId, 180),
    domain,
    rawSafeData: {}
  };
  for (const [key, value] of Object.entries(product || {})) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      snapshot.rawSafeData[cleanText(key, 60)] = cleanText(value, 500);
    }
  }
  return snapshot;
}

export function buildUtm(context = {}) {
  const source = context.utm || context;
  return Object.fromEntries(['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']
    .map((key) => [key, cleanText(source?.[key], 180)])
    .filter(([, value]) => value));
}

function scriptJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003C');
}

function htmlAttribute(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

export function buildButtonScriptBody(config, publicOrigin = '') {
  const origin = cleanText(publicOrigin, 500).replace(/\/+$/, '');
  const loaderUrl = `${origin}/api/public/application-forms/loader.js`;
  const payload = {
    formId: config.form_public_id || config.formPublicId,
    selector: config.selector,
    insertPosition: config.insert_position || config.insertPosition || 'after',
    text: config.text,
    cssClass: config.css_class || config.cssClass || '',
    fullWidth: config.full_width === true || config.fullWidth === true,
    active: config.active !== false,
    styles: config.styles || {},
    productSelectors: config.product_selectors || config.productSelectors || {}
  };
  return `(function(){
  "use strict";
  var config = ${scriptJson(payload)};
  var loaderUrl = ${scriptJson(loaderUrl)};
  var buttonNode = null;
  var pendingInsert = false;
  function warn(message){ if (window.console && console.warn) console.warn("[MT forms] " + message); }
  function unique(list){
    var seen = {};
    return list.filter(function(item){
      if (!item || !item.selector || seen[item.selector + "|" + (item.source || "")]) return false;
      seen[item.selector + "|" + (item.source || "")] = true;
      return true;
    });
  }
  function normalizeConfig(value, fallbackSource){
    if (!value) return null;
    if (typeof value === "string") return { selector: value, source: fallbackSource || "textContent" };
    if (typeof value === "object" && value.selector) return { selector: value.selector, source: value.source || fallbackSource || "textContent" };
    return null;
  }
  function absoluteUrl(value){
    if (!value) return "";
    try { return new URL(value, window.location.href).toString(); } catch (error) { return value; }
  }
  function readElement(element, source){
    if (source === "textContent") return (element.textContent || "").trim();
    if (source === "src") return absoluteUrl(element.currentSrc || element.src || element.getAttribute("src") || "");
    if (source === "data-src") return absoluteUrl(element.getAttribute("data-src") || "");
    if (source === "data-href") return absoluteUrl(element.getAttribute("data-href") || "");
    if (source === "href") return absoluteUrl(element.href || element.getAttribute("href") || "");
    if (source === "value") return element.value || "";
    if (source === "content") return element.getAttribute("content") || "";
    return element.getAttribute(source) || "";
  }
  function read(selectorConfig, fallbacks, validator){
    var candidates = [];
    var normalized = normalizeConfig(selectorConfig);
    if (normalized) candidates.push(normalized);
    (fallbacks || []).forEach(function(fallback){ var item = normalizeConfig(fallback); if (item) candidates.push(item); });
    candidates = unique(candidates);
    for (var i = 0; i < candidates.length; i += 1) {
      var candidate = candidates[i];
      var elements;
      try { elements = document.querySelectorAll(candidate.selector); } catch (error) { warn("Некоректний селектор: " + candidate.selector); continue; }
      for (var index = 0; index < elements.length; index += 1) {
        var value = readElement(elements[index], candidate.source || "textContent").trim();
        if (value && (!validator || validator(value))) return value;
      }
    }
    return "";
  }
  function isImageUrl(value){ return /\\.(?:avif|gif|jpe?g|png|svg|webp)(?:[?#].*)?$/i.test(value); }
  function readGalleryImage(){
    var gallery = document.querySelector(".gallery");
    if (!gallery) return "";
    var candidates = [
      { selector: ".gallery__photos-list img[src*='/content/images/']", source: "src" },
      { selector: ".gallery__photos-list img[src]", source: "src" },
      { selector: ".gallery__photos img.gallery__photo-img[src]", source: "src" },
      { selector: "img.gallery__photo-img[src]", source: "src" },
      { selector: "img[src*='/content/images/']", source: "src" },
      { selector: ".gallery__link[data-href*='/content/images/']", source: "data-href" },
      { selector: ".gallery__thumb-link[data-href*='/content/images/']", source: "data-href" }
    ];
    for (var i = 0; i < candidates.length; i += 1) {
      var candidate = candidates[i];
      var elements;
      try { elements = gallery.querySelectorAll(candidate.selector); } catch (error) { continue; }
      for (var index = 0; index < elements.length; index += 1) {
        var value = readElement(elements[index], candidate.source).trim();
        if (value && isImageUrl(value)) return value;
      }
    }
    var match = String(gallery.innerHTML || "").match(/(?:https?:\\/\\/[^"'<>\\s]+|\\/content\\/images\\/[^"'<>\\s]+)\\.(?:avif|gif|jpe?g|png|svg|webp)(?:[?#][^"'<>\\s]*)?/i);
    return match ? absoluteUrl(match[0]) : "";
  }
  function collectProduct(){
    var selectors = config.productSelectors || {};
    var galleryImageUrl = readGalleryImage();
    var fallbacks = {
      title: [
        { selector: "h1.product-title", source: "textContent" },
        { selector: ".product-title", source: "textContent" },
        { selector: ".product h1", source: "textContent" },
        { selector: "h1", source: "textContent" },
        { selector: "meta[property='og:title']", source: "content" }
      ],
      imageUrl: [
        { selector: ".gallery__photos-list > li.gallery__item.swiper-slide-active .gallery__link[data-href]", source: "data-href" },
        { selector: ".gallery__photos-list > li.gallery__item.is-active .gallery__link[data-href]", source: "data-href" },
        { selector: ".gallery__photos-list > li.gallery__item:first-child .gallery__link[data-href]", source: "data-href" },
        { selector: ".gallery__thumbnails-list > li.gallery__thumb.is-active .gallery__thumb-link[data-href]", source: "data-href" },
        { selector: ".gallery__photos-list .gallery__link[data-href]", source: "data-href" },
        { selector: ".gallery__thumbnails-list .gallery__thumb-link[data-href]", source: "data-href" },
        { selector: ".gallery__photos-list > li.gallery__item.swiper-slide-active .zoomPhoto", source: "href" },
        { selector: ".gallery__photos-list > li.gallery__item:first-child .zoomPhoto", source: "href" },
        { selector: ".gallery__photos-list > li.gallery__item.swiper-slide-active .gallery__photo-img", source: "src" },
        { selector: ".gallery__photos-list > li.gallery__item:first-child .gallery__photo-img", source: "src" },
        { selector: ".gallery__photo-img", source: "src" },
        { selector: ".gallery img[itemprop='image']", source: "src" },
        { selector: "img[itemprop='image']", source: "src" },
        { selector: "meta[property='og:image']", source: "content" },
        { selector: ".product-gallery img", source: "src" },
        { selector: ".product-photo img", source: "src" },
        { selector: ".product__gallery img", source: "src" }
      ],
      price: [
        { selector: ".product-price__item--new", source: "textContent" },
        { selector: ".product-price__item", source: "textContent" },
        { selector: ".product-price__current", source: "textContent" },
        { selector: "[itemprop='price']", source: "content" },
        { selector: "meta[property='product:price:amount']", source: "content" }
      ],
      oldPrice: [
        { selector: ".product-price__old-price", source: "textContent" },
        { selector: ".product-price__item--old", source: "textContent" },
        { selector: ".product__price-old", source: "textContent" }
      ],
      productCode: [
        { selector: "[data-product-code]", source: "textContent" },
        { selector: ".product-code", source: "textContent" },
        { selector: "[itemprop='sku']", source: "content" }
      ]
    };
    return {
      title: read(selectors.title, fallbacks.title),
      imageUrl: galleryImageUrl || read(selectors.imageUrl, fallbacks.imageUrl, isImageUrl),
      price: read(selectors.price, fallbacks.price),
      oldPrice: read(selectors.oldPrice, fallbacks.oldPrice),
      productCode: read(selectors.productCode, fallbacks.productCode),
      url: window.location.href,
      domain: window.location.hostname
    };
  }
  function ensureLoader(callback){
    if (window.MTApplicationForms && typeof window.MTApplicationForms.open === "function") { callback(); return; }
    var existing = document.querySelector('script[data-mt-application-loader="true"]');
    if (existing) { existing.addEventListener("load", callback, { once: true }); return; }
    var script = document.createElement("script");
    script.src = loaderUrl;
    script.async = true;
    script.dataset.mtApplicationLoader = "true";
    script.onload = callback;
    script.onerror = function(){ warn("Loader не завантажився."); };
    document.head.appendChild(script);
  }
  function makeButton(){
    var button = document.createElement("button");
    button.type = "button";
    button.textContent = config.text || "Залишити заявку";
    button.className = ((config.cssClass || "") + " mt-application-button").trim();
    button.setAttribute("data-mt-application-button", "true");
    button.setAttribute("data-mt-application-form-id", String(config.formId || ""));
    button.style.display = config.fullWidth ? "flex" : "inline-flex";
    button.style.alignItems = "center";
    button.style.justifyContent = "center";
    button.style.gap = "6px";
    button.style.border = "0";
    button.style.cursor = "pointer";
    button.style.fontFamily = "inherit";
    button.style.fontSize = "inherit";
    button.style.fontStyle = "inherit";
    button.style.fontWeight = "700";
    button.style.lineHeight = "1.2";
    button.style.textDecoration = "none";
    if (config.fullWidth) button.style.width = "100%";
    var styles = config.styles || {};
    Object.keys(styles).forEach(function(key){ if (styles[key] !== "") button.style[key] = styles[key]; });
    button.addEventListener("click", function(){
      ensureLoader(function(){
        window.MTApplicationForms.open({
          formId: config.formId,
          product: collectProduct(),
          context: {
            sourceUrl: window.location.href,
            pageTitle: document.title,
            referrer: document.referrer
          }
        });
      });
    });
    return button;
  }
  function isUsable(element){
    if (!element || !document.documentElement.contains(element)) return false;
    var rect = element.getBoundingClientRect();
    var style = window.getComputedStyle ? window.getComputedStyle(element) : null;
    return rect.width > 0 && rect.height > 0 && (!style || (style.display !== "none" && style.visibility !== "hidden"));
  }
  function hasBuyControl(element){
    if (!element) return false;
    if (element.querySelector(".j-buy-button-add, .product-order__block--buy, [data-qaid='product_buy_button'], [data-qaid='buy-button']")) return true;
    return /купити|купить|buy/i.test(element.textContent || "");
  }
  function normalizeTarget(element){
    if (!element) return null;
    if (element.matches && element.matches(".j-buy-button-add, [data-qaid='product_buy_button'], [data-qaid='buy-button']")) {
      return element.closest(".product-order__row, .product-order, .product__section--order, .product-actions, .product__actions") || element.parentElement;
    }
    return element;
  }
  function targetSelectors(){
    return unique([
      normalizeConfig(config.selector),
      { selector: ".product-order__row" },
      { selector: ".product-order" },
      { selector: ".product__section--order" },
      { selector: ".product-actions" },
      { selector: ".product__actions" },
      { selector: ".product-buttons" },
      { selector: ".product__buttons" },
      { selector: ".product-order__block--buy" },
      { selector: ".j-buy-button-add" },
      { selector: "[data-qaid='product_buy_button']" },
      { selector: "[data-qaid='buy-button']" }
    ]);
  }
  function findTarget(){
    var targets = [];
    targetSelectors().forEach(function(candidate){
      var elements;
      try { elements = document.querySelectorAll(candidate.selector); } catch (error) { warn("Некоректний селектор контейнера: " + candidate.selector); return; }
      Array.prototype.forEach.call(elements, function(element){
        var target = normalizeTarget(element);
        if (target && targets.indexOf(target) === -1) targets.push(target);
      });
    });
    for (var i = 0; i < targets.length; i += 1) if (isUsable(targets[i]) && hasBuyControl(targets[i])) return targets[i];
    for (var j = 0; j < targets.length; j += 1) if (isUsable(targets[j])) return targets[j];
    return targets[0] || null;
  }
  function existingButton(){
    var formId = String(config.formId || "");
    var buttons = document.querySelectorAll('[data-mt-application-button="true"]');
    for (var i = 0; i < buttons.length; i += 1) {
      if (buttons[i].getAttribute("data-mt-application-form-id") === formId) return buttons[i];
    }
    return null;
  }
  function isPlaced(button, target){
    if (!button || !target || !document.documentElement.contains(button)) return false;
    if (config.insertPosition === "start" || config.insertPosition === "end") return button.parentNode === target;
    if (config.insertPosition === "before") return button.nextSibling === target;
    return target.nextSibling === button;
  }
  function placeButton(target, button){
    if (config.insertPosition === "start") target.insertBefore(button, target.firstChild);
    else if (config.insertPosition === "end") target.appendChild(button);
    else if (config.insertPosition === "before") target.parentNode && target.parentNode.insertBefore(button, target);
    else target.parentNode && target.parentNode.insertBefore(button, target.nextSibling);
  }
  function insert(){
    if (config.active === false) return false;
    var target = findTarget();
    if (!target) return false;
    var button = existingButton() || buttonNode || makeButton();
    buttonNode = button;
    if (isPlaced(button, target)) return true;
    placeButton(target, button);
    return document.documentElement.contains(button);
  }
  function scheduleInsert(){
    if (pendingInsert) return;
    pendingInsert = true;
    window.setTimeout(function(){ pendingInsert = false; insert(); }, 50);
  }
  function ready(){
    insert();
    window.setTimeout(insert, 500);
    window.setTimeout(insert, 2000);
    window.setTimeout(insert, 5000);
    if (window.MutationObserver) {
      var observer = new MutationObserver(scheduleInsert);
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready, { once: true }); else ready();
})();
`;
}

export function buildButtonScript(config, publicOrigin = '') {
  return `<script>
${buildButtonScriptBody(config, publicOrigin)}</script>`;
}

export function buildCompactButtonScript(config, publicOrigin = '') {
  const origin = cleanText(publicOrigin, 500).replace(/\/+$/, '');
  const url = `${origin}/api/public/application-forms/buttons/${encodeURIComponent(config.id)}/embed.js`;
  return `<script async src="${htmlAttribute(url)}"></script>`;
}
