import { query } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import { getUserToolAccess } from '../access/access.service.js';
import { cleanText, cleanUrl } from '../applications/application.service.js';
import { prepareCatalogDescription } from './catalog.content.js';

export const catalogToolId = 'used_smartphones_catalog';
export const productConditions = ['USED', 'REFURBISHED'];
export const publicationStatuses = ['DRAFT', 'PUBLISHED', 'HIDDEN', 'ARCHIVED'];

export const conditionLabels = {
  USED: 'Вживаний',
  REFURBISHED: 'Відновлений'
};

export const publicationStatusLabels = {
  DRAFT: 'Чернетка',
  PUBLISHED: 'Опубліковано',
  HIDDEN: 'Приховано',
  ARCHIVED: 'Архів'
};

export const availabilityLabels = {
  in_stock: 'В наявності',
  incoming: 'В дорозі',
  unavailable: 'Немає в наявності'
};

export const productSelect = `
  SELECT product.*,
         brand.label AS brand_label,
         creator.name AS created_by_name,
         updater.name AS updated_by_name
  FROM used_smartphone_products AS product
  LEFT JOIN used_smartphone_brands AS brand ON brand.id = product.brand_id
  LEFT JOIN users AS creator ON creator.id = product.created_by
  LEFT JOIN users AS updater ON updater.id = product.updated_by
`;

const transliteration = new Map(Object.entries({
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z',
  и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch',
  ш: 'sh', щ: 'shch', ю: 'iu', я: 'ia', ы: 'y', э: 'e', ё: 'e', ъ: '', ь: ''
}));

export function normalizeProductName(value) {
  return cleanText(value, 240)
    .normalize('NFKC')
    .toLocaleLowerCase('uk-UA')
    .replace(/[’'`]+/g, '')
    .replace(/[^\p{L}\p{N}+]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeHeader(value) {
  return cleanText(value, 120).toLocaleLowerCase('uk-UA').replace(/\s+/g, ' ').trim();
}

export function slugBase(value, fallback = 'smartphone') {
  const source = cleanText(value, 260).toLocaleLowerCase('uk-UA');
  let transliterated = '';
  for (const char of source) transliterated += transliteration.get(char) ?? char;
  return transliterated
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 180) || fallback;
}

export function availabilityForCounts(stockCount, incomingCount) {
  const stock = Number(stockCount || 0);
  const incoming = Number(incomingCount || 0);
  const status = stock > 0 ? 'in_stock' : incoming > 0 ? 'incoming' : 'unavailable';
  return { status, label: availabilityLabels[status] };
}

export function formatMoney(value) {
  const number = Number(value || 0);
  return `${Number.isInteger(number) ? number.toFixed(0) : number.toFixed(2)} грн`;
}

export async function generateProductCode(db) {
  const result = await db.query(
    `UPDATE used_smartphone_product_code_sequence
     SET next_number = next_number + 1
     WHERE scope = 'default'
     RETURNING next_number - 1 AS value`
  );
  const value = Number(result.rows[0]?.value || 0);
  if (!value || value > 999999) {
    throw new AppError(409, 'CATALOG_CODE_LIMIT', 'Ліміт кодів товарів вичерпано.');
  }
  return `SM-${String(value).padStart(6, '0')}`;
}

async function slugExists(slug, excludeId, db) {
  const result = excludeId
    ? await db.query('SELECT id FROM used_smartphone_products WHERE slug = $1 AND id <> $2', [slug, excludeId])
    : await db.query('SELECT id FROM used_smartphone_products WHERE slug = $1', [slug]);
  return Boolean(result.rows[0]);
}

export async function makeUniqueSlug(value, excludeId, db, suffixFallback = '') {
  const base = slugBase(value || suffixFallback || 'smartphone');
  let candidate = base;
  for (let index = 2; index < 1000; index += 1) {
    if (!await slugExists(candidate, excludeId, db)) return candidate;
    candidate = `${base}-${index}`;
  }
  throw new AppError(409, 'CATALOG_SLUG_UNAVAILABLE', 'Не вдалося підібрати унікальний публічний шлях.');
}

export function serializeBrand(row) {
  return {
    id: row.id,
    label: row.label,
    active: row.active === true,
    sortOrder: Number(row.sort_order || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeJsonObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function descriptionPayload(row) {
  if (row.description_safe_html || row.description_css || row.description_js) {
    return {
      descriptionHtml: row.description_safe_html || '',
      descriptionCss: row.description_css || '',
      descriptionJs: row.description_js || '',
      descriptionHasJs: row.description_has_js === true
    };
  }
  const prepared = prepareCatalogDescription(row.description || '');
  return {
    descriptionHtml: prepared.safeHtml,
    descriptionCss: prepared.css,
    descriptionJs: prepared.js,
    descriptionHasJs: prepared.hasJs
  };
}

function productCharacteristicValue(row) {
  const json = normalizeJsonObject(row.value_json);
  if (Object.hasOwn(json, 'value')) return json.value;
  if (row.type === 'number' && row.value_number !== null && row.value_number !== undefined) return Number(row.value_number);
  if (row.type === 'boolean' && row.value_boolean !== null && row.value_boolean !== undefined) return row.value_boolean === true;
  return row.value_text || '';
}

function characteristicDisplayValue(value, unit = '') {
  if (Array.isArray(value)) return value.map(String).filter(Boolean).join(', ');
  if (typeof value === 'boolean') return value ? 'Так' : 'Ні';
  if (value === null || value === undefined) return '';
  const text = String(value).trim();
  if (!text) return '';
  return unit ? `${text} ${unit}` : text;
}

export async function loadProductCharacteristicSet(productId, db = { query }) {
  const result = await db.query(
    `SELECT characteristics.*,
            COALESCE(fields.type, 'text') AS type,
            COALESCE(fields.unit, '') AS unit,
            COALESCE(fields.filterable, FALSE) AS filterable,
            COALESCE(fields.is_modifier, FALSE) AS is_modifier,
            templates.label AS template_label
     FROM used_smartphone_product_characteristics AS characteristics
     LEFT JOIN used_smartphone_characteristic_template_fields AS fields ON fields.id = characteristics.field_id
     LEFT JOIN used_smartphone_characteristic_templates AS templates ON templates.id = characteristics.template_id
     WHERE characteristics.product_id = $1
     ORDER BY characteristics.sort_order, lower(characteristics.label)`,
    [productId]
  );
  const first = result.rows[0];
  return {
    templateId: first?.template_id || null,
    templateLabel: first?.template_label || '',
    items: result.rows.map((row) => {
      const value = productCharacteristicValue(row);
      return {
        key: row.key,
        label: row.label,
        type: row.type,
        value,
        displayValue: characteristicDisplayValue(value, row.unit || ''),
        unit: row.unit || '',
        filterable: row.filterable === true,
        isModifier: row.is_modifier === true,
        sortOrder: Number(row.sort_order || 0)
      };
    }).filter((item) => item.displayValue)
  };
}

function serializeModificationProduct(row, { publicOnly = false, includeInventory = false } = {}) {
  const product = {
    id: publicOnly ? row.product_code : row.id,
    productCode: row.product_code,
    name: row.name,
    slug: row.slug,
    publicPath: `/storefront/smartphones/${encodeURIComponent(row.slug)}`,
    conditionLabel: conditionLabels[row.condition] || row.condition,
    priceUah: Number(row.price_uah || 0),
    priceLabel: formatMoney(row.price_uah),
    availability: availabilityForCounts(row.stock_count, row.incoming_count),
    mainImageUrl: row.main_image_url || ''
  };
  if (includeInventory) {
    product.stockCount = Number(row.stock_count || 0);
    product.incomingCount = Number(row.incoming_count || 0);
  }
  return product;
}

export async function loadProductModificationSet(productId, db = { query }, { publicOnly = false } = {}) {
  const groupResult = await db.query(
    `SELECT groups.*,
            main_product.publication_status AS main_publication_status
     FROM used_smartphone_product_groups AS groups
     INNER JOIN used_smartphone_product_group_items AS items ON items.group_id = groups.id
     LEFT JOIN used_smartphone_products AS main_product ON main_product.id = groups.main_product_id
     WHERE items.product_id = $1
     ORDER BY groups.updated_at DESC
     LIMIT 1`,
    [productId]
  );
  const group = groupResult.rows[0];
  if (!group || (publicOnly && group.active !== true)) {
    return { groupId: null, groupLabel: '', groupSlug: '', mainProductId: null, isMain: false, items: [], parameters: [] };
  }

  const productFilter = publicOnly && group.main_publication_status === 'PUBLISHED'
    ? "AND product.publication_status <> 'ARCHIVED'"
    : publicOnly
      ? "AND product.publication_status = 'PUBLISHED'"
      : "AND product.publication_status <> 'ARCHIVED'";
  const productsResult = await db.query(
    `SELECT group_items.group_id,
            group_items.sort_order AS group_sort_order,
            product.*,
            brand.label AS brand_label,
            creator.name AS created_by_name,
            updater.name AS updated_by_name
     FROM used_smartphone_product_group_items AS group_items
     INNER JOIN used_smartphone_products AS product ON product.id = group_items.product_id
     LEFT JOIN used_smartphone_brands AS brand ON brand.id = product.brand_id
     LEFT JOIN users AS creator ON creator.id = product.created_by
     LEFT JOIN users AS updater ON updater.id = product.updated_by
     WHERE group_items.group_id = $1
       ${productFilter}
     ORDER BY (product.id = $2) DESC, group_items.sort_order, lower(product.name)`,
    [group.id, group.main_product_id || productId]
  );
  const products = productsResult.rows;
  const productIds = products.map((row) => row.id);
  const items = products.map((row) => serializeModificationProduct(row, { publicOnly, includeInventory: !publicOnly }));
  if (!productIds.length) {
    return {
      groupId: group.id,
      groupLabel: group.label,
      groupSlug: group.slug,
      mainProductId: group.main_product_id || null,
      isMain: group.main_product_id === productId,
      items,
      parameters: []
    };
  }

  const placeholders = productIds.map((_, index) => `$${index + 1}`).join(', ');
  const characteristicsResult = await db.query(
    `SELECT characteristics.*,
            COALESCE(fields.type, 'text') AS type,
            COALESCE(fields.unit, '') AS unit,
            COALESCE(fields.is_modifier, FALSE) AS is_modifier
     FROM used_smartphone_product_characteristics AS characteristics
     LEFT JOIN used_smartphone_characteristic_template_fields AS fields ON fields.id = characteristics.field_id
     WHERE characteristics.product_id IN (${placeholders})
       AND COALESCE(fields.is_modifier, FALSE) = TRUE
     ORDER BY characteristics.sort_order, lower(characteristics.label)`,
    productIds
  );

  const valuesByProduct = new Map();
  const parametersByKey = new Map();
  characteristicsResult.rows.forEach((row) => {
    const value = productCharacteristicValue(row);
    const displayValue = characteristicDisplayValue(value, row.unit || '');
    if (!displayValue) return;
    const item = {
      key: row.key,
      label: row.label,
      value,
      displayValue,
      unit: row.unit || '',
      sortOrder: Number(row.sort_order || 0)
    };
    const productValues = valuesByProduct.get(row.product_id) || new Map();
    productValues.set(row.key, item);
    valuesByProduct.set(row.product_id, productValues);
    if (!parametersByKey.has(row.key)) parametersByKey.set(row.key, { key: row.key, label: row.label, sortOrder: Number(row.sort_order || 0) });
  });

  const currentValues = valuesByProduct.get(productId) || new Map();
  const findVariantForOption = (parameterKey, displayValue) => {
    const strict = products.find((product) => {
      const values = valuesByProduct.get(product.id) || new Map();
      if (values.get(parameterKey)?.displayValue !== displayValue) return false;
      return [...parametersByKey.keys()].every((key) => (
        key === parameterKey
          || !currentValues.get(key)?.displayValue
          || values.get(key)?.displayValue === currentValues.get(key)?.displayValue
      ));
    });
    const fallback = strict || products.find((product) => (valuesByProduct.get(product.id) || new Map()).get(parameterKey)?.displayValue === displayValue);
    return fallback ? serializeModificationProduct(fallback, { publicOnly }) : null;
  };

  const parameters = [...parametersByKey.values()]
    .sort((left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label))
    .map((parameter) => {
      const optionValues = new Map();
      products.forEach((product) => {
        const value = (valuesByProduct.get(product.id) || new Map()).get(parameter.key);
        if (value && !optionValues.has(value.displayValue)) optionValues.set(value.displayValue, value);
      });
      const current = currentValues.get(parameter.key);
      return {
        id: parameter.key,
        key: parameter.key,
        label: parameter.label,
        currentValueId: current?.displayValue || null,
        currentValueLabel: current?.displayValue || '',
        options: [...optionValues.values()].map((option) => ({
          id: `${parameter.key}:${option.displayValue}`,
          value: String(option.value ?? option.displayValue),
          label: option.displayValue,
          selected: current?.displayValue === option.displayValue,
          product: findVariantForOption(parameter.key, option.displayValue)
        }))
      };
    });

  return {
    groupId: group.id,
    groupLabel: group.label,
    groupSlug: group.slug,
    mainProductId: group.main_product_id || null,
    isMain: group.main_product_id === productId,
    items,
    parameters
  };
}

export function serializePublicCatalogProduct(row, { detail = false } = {}) {
  const availability = availabilityForCounts(row.stock_count, row.incoming_count);
  const product = {
    id: row.product_code,
    productCode: row.product_code,
    name: row.name,
    condition: row.condition,
    conditionLabel: conditionLabels[row.condition] || row.condition,
    availability,
    priceUah: Number(row.price_uah || 0),
    priceLabel: formatMoney(row.price_uah),
    slug: row.slug,
    publicPath: `/storefront/smartphones/${encodeURIComponent(row.slug)}`,
    brand: row.brand_id ? { id: row.brand_id, label: row.brand_label || '' } : null,
    mainImageUrl: row.main_image_url || '',
    shortDescription: row.short_description || ''
  };
  Object.defineProperty(product, 'internalId', { value: row.id, enumerable: false });
  if (!detail) return product;
  const detailed = {
    ...product,
    gallery: normalizeJsonArray(row.gallery),
    ...descriptionPayload(row),
    bodyCondition: row.body_condition || '',
    displayCondition: row.display_condition || '',
    batteryHealth: row.battery_health || '',
    warranty: row.warranty || '',
    includedAccessories: row.included_accessories || '',
    seoTitle: row.seo_title || '',
    seoDescription: row.seo_description || '',
    socialDescription: row.social_description || ''
  };
  Object.defineProperty(detailed, 'internalId', { value: row.id, enumerable: false });
  return detailed;
}

export function serializeCatalogProduct(row) {
  const availability = availabilityForCounts(row.stock_count, row.incoming_count);
  return {
    id: row.id,
    productCode: row.product_code,
    name: row.name,
    condition: row.condition,
    conditionLabel: conditionLabels[row.condition] || row.condition,
    stockCount: Number(row.stock_count || 0),
    incomingCount: Number(row.incoming_count || 0),
    availability,
    priceUah: Number(row.price_uah || 0),
    priceLabel: formatMoney(row.price_uah),
    publicationStatus: row.publication_status,
    publicationStatusLabel: publicationStatusLabels[row.publication_status] || row.publication_status,
    slug: row.slug,
    publicPath: `/storefront/smartphones/${encodeURIComponent(row.slug)}`,
    brand: row.brand_id ? { id: row.brand_id, label: row.brand_label || '' } : null,
    mainImageUrl: row.main_image_url || '',
    gallery: normalizeJsonArray(row.gallery),
    shortDescription: row.short_description || '',
    description: row.description || '',
    ...descriptionPayload(row),
    seoTitle: row.seo_title || '',
    seoDescription: row.seo_description || '',
    socialDescription: row.social_description || '',
    bodyCondition: row.body_condition || '',
    displayCondition: row.display_condition || '',
    batteryHealth: row.battery_health || '',
    warranty: row.warranty || '',
    includedAccessories: row.included_accessories || '',
    diagnostics: normalizeJsonObject(row.diagnostics),
    version: Number(row.version || 1),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    normalizedName: row.normalized_name,
    internalNotes: row.internal_notes || '',
    createdBy: row.created_by ? { id: row.created_by, name: row.created_by_name || '' } : null,
    updatedBy: row.updated_by ? { id: row.updated_by, name: row.updated_by_name || '' } : null
  };
}

export async function attachCatalogProductGroups(products, db = { query }) {
  const productIds = products.map((product) => product.id).filter(Boolean);
  if (!productIds.length) return products;
  const placeholders = productIds.map((_, index) => `$${index + 1}`).join(', ');
  const groupsResult = await db.query(
    `SELECT DISTINCT groups.*
     FROM used_smartphone_product_groups AS groups
     LEFT JOIN used_smartphone_product_group_items AS items ON items.group_id = groups.id
     WHERE groups.main_product_id IN (${placeholders})
        OR items.product_id IN (${placeholders})`,
    productIds
  );
  const groups = groupsResult.rows;
  const groupIds = groups.map((group) => group.id);
  if (!groupIds.length) return products;
  const groupPlaceholders = groupIds.map((_, index) => `$${index + 1}`).join(', ');
  const itemsResult = await db.query(
    `SELECT group_items.group_id,
            group_items.sort_order AS group_sort_order,
            product.*,
            brand.label AS brand_label,
            creator.name AS created_by_name,
            updater.name AS updated_by_name
     FROM used_smartphone_product_group_items AS group_items
     INNER JOIN used_smartphone_products AS product ON product.id = group_items.product_id
     LEFT JOIN used_smartphone_brands AS brand ON brand.id = product.brand_id
     LEFT JOIN users AS creator ON creator.id = product.created_by
     LEFT JOIN users AS updater ON updater.id = product.updated_by
     WHERE group_items.group_id IN (${groupPlaceholders})
       AND product.publication_status <> 'ARCHIVED'
     ORDER BY group_items.sort_order, lower(product.name)`,
    groupIds
  );
  const groupsById = new Map(groups.map((group) => [group.id, group]));
  const itemsByGroup = new Map();
  const groupByProduct = new Map();
  itemsResult.rows.forEach((row) => {
    const list = itemsByGroup.get(row.group_id) || [];
    list.push(row);
    itemsByGroup.set(row.group_id, list);
    groupByProduct.set(row.id, groupsById.get(row.group_id));
  });
  products.forEach((product) => {
    const group = groupByProduct.get(product.id);
    if (!group) return;
    const rows = itemsByGroup.get(group.id) || [];
    const childRows = rows.filter((row) => row.id !== group.main_product_id);
    product.modificationGroup = {
      groupId: group.id,
      groupLabel: group.label,
      mainProductId: group.main_product_id || null,
      isMain: group.main_product_id === product.id,
      childCount: childRows.length
    };
    product.modificationChildren = group.main_product_id === product.id
      ? childRows.map((row) => serializeCatalogProduct(row))
      : [];
  });
  return products;
}

export async function loadCatalogProduct(productId, db = { query }) {
  const result = await db.query(`${productSelect} WHERE product.id = $1`, [productId]);
  const row = result.rows[0];
  return row ? serializeCatalogProduct(row) : null;
}

export async function loadPublicProduct(identifier, db = { query }) {
  const result = await db.query(
    `${productSelect}
     WHERE product.publication_status <> 'ARCHIVED'
       AND (
         product.publication_status = 'PUBLISHED'
         OR product.id IN (
           SELECT public_group_items.product_id
           FROM used_smartphone_product_group_items AS public_group_items
           INNER JOIN used_smartphone_product_groups AS public_groups ON public_groups.id = public_group_items.group_id
           INNER JOIN used_smartphone_products AS public_main ON public_main.id = public_groups.main_product_id
           WHERE public_groups.active = TRUE
             AND public_main.publication_status = 'PUBLISHED'
         )
       )
       AND (product.slug = $1 OR lower(product.product_code) = lower($1))
     LIMIT 1`,
    [identifier]
  );
  const row = result.rows[0];
  if (!row) return null;
  const product = serializePublicCatalogProduct(row, { detail: true });
  product.characteristics = await loadProductCharacteristicSet(row.id, db);
  product.modifications = await loadProductModificationSet(row.id, db, { publicOnly: true });
  return product;
}

export async function loadPreviewProduct(identifier, db = { query }) {
  const result = await db.query(
    `${productSelect}
     WHERE product.publication_status <> 'ARCHIVED'
       AND (product.slug = $1 OR lower(product.product_code) = lower($1))
     LIMIT 1`,
    [identifier]
  );
  const row = result.rows[0];
  if (!row) return null;
  const product = serializePublicCatalogProduct(row, { detail: true });
  product.characteristics = await loadProductCharacteristicSet(row.id, db);
  product.modifications = await loadProductModificationSet(row.id, db, { publicOnly: false });
  return product;
}

export function validatePublicationReady(input) {
  const errors = [];
  if (!cleanText(input.name, 240)) errors.push({ field: 'name', message: 'Вкажіть назву товару.' });
  if (!productConditions.includes(input.condition)) errors.push({ field: 'condition', message: 'Вкажіть стан товару.' });
  if (Number(input.priceUah ?? input.price_uah ?? 0) <= 0) errors.push({ field: 'priceUah', message: 'Ціна має бути більшою за 0.' });
  if (!cleanText(input.mainImageUrl ?? input.main_image_url ?? '', 4000)) errors.push({ field: 'mainImageUrl', message: 'Додайте головне фото.' });
  if (!cleanText(input.slug || '', 260)) errors.push({ field: 'slug', message: 'Вкажіть публічний шлях.' });
  if (errors.length) throw new AppError(422, 'CATALOG_PUBLICATION_NOT_READY', 'Товар ще не готовий до публікації.', errors);
}

export async function logCatalogAudit(db, { productId, actorId, action, changes = {} }) {
  await db.query(
    `INSERT INTO used_smartphone_audit_log (product_id, actor_id, action, changes)
     VALUES ($1, $2, $3, $4::JSONB)`,
    [productId || null, actorId || null, action, JSON.stringify(changes)]
  );
}

export async function getCatalogRecipientIds(db = { query }) {
  const result = await db.query(
    `SELECT users.id
     FROM users
     LEFT JOIN user_tool_access AS access
       ON access.user_id = users.id AND access.tool_id = $1
     WHERE users.status = 'approved'
       AND (users.role = 'admin' OR access.user_id IS NOT NULL)
     ORDER BY users.id`,
    [catalogToolId]
  );
  return result.rows.map((row) => row.id);
}

function pickColumn(row, columns) {
  const lookup = new Map(Object.entries(row || {}).map(([key, value]) => [normalizeHeader(key), value]));
  for (const column of columns) {
    const value = lookup.get(normalizeHeader(column));
    if (value !== undefined) return value;
  }
  return '';
}

export function parseImportCondition(value) {
  const text = normalizeHeader(value);
  if (['used', 'вживаний', 'б/у', 'бу', 'u'].includes(text)) return 'USED';
  if (['refurbished', 'відновлений', 'відновленний', 'відновлена', 'r'].includes(text)) return 'REFURBISHED';
  return '';
}

export function parseNonNegativeInteger(value) {
  if (value === null || value === undefined || value === '') return NaN;
  const number = Number(String(value).replace(/\s+/g, '').replace(',', '.'));
  return Number.isInteger(number) && number >= 0 ? number : NaN;
}

export function parseMoney(value) {
  if (value === null || value === undefined || value === '') return NaN;
  const normalized = String(value)
    .replace(/\s|\u00a0/g, '')
    .replace(/[^0-9,.-]/g, '')
    .replace(',', '.');
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) / 100 : NaN;
}

function serializeImportRow(row, index) {
  const name = cleanText(pickColumn(row, ['Назва', 'Назва товару', 'Name', 'Модель']), 240);
  const condition = parseImportCondition(pickColumn(row, ['Статус', 'Стан', 'Condition']));
  const stockCount = parseNonNegativeInteger(pickColumn(row, ['Залишок', 'Stock', 'Кількість']));
  const incomingCount = parseNonNegativeInteger(pickColumn(row, ['В дорозі', 'Incoming', 'В дорозi']));
  const priceUah = parseMoney(pickColumn(row, ['Ціна', 'Цена', 'Price', 'Цiна']));
  const normalizedName = normalizeProductName(name);
  const errors = [];
  if (!name) errors.push('Не заповнено назву.');
  if (!condition) errors.push('Стан має бути USED/REFURBISHED або Вживаний/Відновлений.');
  if (!Number.isInteger(stockCount)) errors.push('Залишок має бути невідʼємним цілим числом.');
  if (!Number.isInteger(incomingCount)) errors.push('В дорозі має бути невідʼємним цілим числом.');
  if (!Number.isFinite(priceUah)) errors.push('Ціна має бути невідʼємним числом.');
  return {
    rowNumber: index + 2,
    name,
    normalizedName,
    condition,
    conditionLabel: conditionLabels[condition] || '',
    stockCount: Number.isInteger(stockCount) ? stockCount : null,
    incomingCount: Number.isInteger(incomingCount) ? incomingCount : null,
    priceUah: Number.isFinite(priceUah) ? priceUah : null,
    action: errors.length ? 'error' : 'pending',
    result: errors.length ? 'error' : 'pending',
    reason: errors.join(' ')
  };
}

function importSummary(rows) {
  return rows.reduce((summary, row) => {
    const key = row.action === 'create' ? 'create'
      : row.action === 'update' ? 'update'
        : row.action === 'conflict' ? 'conflict'
          : row.action === 'error' ? 'error'
            : row.action === 'skipped' ? 'skipped'
              : 'pending';
    summary[key] += 1;
    summary.total += 1;
    return summary;
  }, { total: 0, create: 0, update: 0, conflict: 0, error: 0, skipped: 0, pending: 0 });
}

export async function analyzeImportRows(rawRows, db = { query }) {
  const rows = (Array.isArray(rawRows) ? rawRows : []).map(serializeImportRow);
  const keyCounts = new Map();
  for (const row of rows) {
    if (row.result === 'error') continue;
    const key = `${row.normalizedName}:${row.condition}`;
    keyCounts.set(key, (keyCounts.get(key) || 0) + 1);
  }
  for (const row of rows) {
    if (row.result === 'error') continue;
    const key = `${row.normalizedName}:${row.condition}`;
    if (keyCounts.get(key) > 1) {
      row.action = 'conflict';
      row.result = 'conflict';
      row.reason = 'Дублікат у файлі імпорту. Рядки не агрегуються.';
    }
  }

  const validRows = rows.filter((row) => row.result === 'pending');
  for (const row of validRows) {
    const existing = await db.query(
      `SELECT id, product_code, publication_status
       FROM used_smartphone_products
       WHERE normalized_name = $1 AND condition = $2`,
      [row.normalizedName, row.condition]
    );
    const product = existing.rows[0];
    row.productId = product?.id || null;
    row.productCode = product?.product_code || '';
    row.currentPublicationStatus = product?.publication_status || null;
    row.action = product ? 'update' : 'create';
    row.result = 'ready';
  }
  return { rows, summary: importSummary(rows) };
}

export async function commitImportRows(rawRows, options, actorId, db) {
  const importOptions = {
    importNew: options.importNew !== false,
    updateExisting: options.updateExisting !== false
  };
  const analysis = await analyzeImportRows(rawRows, db);
  const committedRows = [];

  const importResult = await db.query(
    `INSERT INTO used_smartphone_imports (created_by, options, summary)
     VALUES ($1, $2::JSONB, $3::JSONB)
     RETURNING id`,
    [actorId, JSON.stringify(importOptions), JSON.stringify(analysis.summary)]
  );
  const importId = importResult.rows[0].id;

  for (const row of analysis.rows) {
    const committed = { ...row };
    try {
      if (row.action === 'create' && !importOptions.importNew) {
        committed.action = 'skipped';
        committed.result = 'skipped';
        committed.reason = 'Створення нових товарів вимкнено для цього імпорту.';
      } else if (row.action === 'update' && !importOptions.updateExisting) {
        committed.action = 'skipped';
        committed.result = 'skipped';
        committed.reason = 'Оновлення наявних товарів вимкнено для цього імпорту.';
      } else if (row.action === 'create') {
        const productCode = await generateProductCode(db);
        const slug = await makeUniqueSlug(row.name, null, db, productCode.toLowerCase());
        const created = await db.query(
          `INSERT INTO used_smartphone_products (
             product_code, name, normalized_name, condition, stock_count,
             incoming_count, price_uah, publication_status, slug, created_by, updated_by
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'DRAFT', $8, $9, $9)
           RETURNING id, product_code`,
          [
            productCode,
            row.name,
            row.normalizedName,
            row.condition,
            row.stockCount,
            row.incomingCount,
            row.priceUah,
            slug,
            actorId
          ]
        );
        committed.productId = created.rows[0].id;
        committed.productCode = created.rows[0].product_code;
        committed.result = 'created';
        await logCatalogAudit(db, {
          productId: committed.productId,
          actorId,
          action: 'import_create',
          changes: { stockCount: row.stockCount, incomingCount: row.incomingCount, priceUah: row.priceUah }
        });
      } else if (row.action === 'update') {
        await db.query(
          `UPDATE used_smartphone_products
           SET stock_count = $1,
               incoming_count = $2,
               price_uah = $3,
               updated_by = $4,
               updated_at = NOW(),
               version = version + 1
           WHERE id = $5`,
          [row.stockCount, row.incomingCount, row.priceUah, actorId, row.productId]
        );
        committed.result = 'updated';
        await logCatalogAudit(db, {
          productId: row.productId,
          actorId,
          action: 'import_update',
          changes: { stockCount: row.stockCount, incomingCount: row.incomingCount, priceUah: row.priceUah }
        });
      }
    } catch (error) {
      committed.action = 'error';
      committed.result = 'error';
      committed.reason = error instanceof AppError ? error.message : 'Не вдалося застосувати рядок імпорту.';
    }
    await db.query(
      `INSERT INTO used_smartphone_import_rows (
         import_id, row_number, action, result, reason, product_id,
         name, condition, stock_count, incoming_count, price_uah
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        importId,
        committed.rowNumber,
        committed.action,
        committed.result,
        committed.reason || '',
        committed.productId || null,
        committed.name || '',
        committed.condition || '',
        committed.stockCount,
        committed.incomingCount,
        committed.priceUah
      ]
    );
    committedRows.push(committed);
  }

  const summary = importSummary(committedRows);
  await db.query(
    'UPDATE used_smartphone_imports SET summary = $1::JSONB WHERE id = $2',
    [JSON.stringify(summary), importId]
  );
  return { importId, rows: committedRows, summary };
}

export async function loadCatalogChatPreview(reference, viewer, db = { query }) {
  const access = await getUserToolAccess(viewer, db);
  if (!access.includes(catalogToolId)) return { ...reference, available: false };
  const product = await loadCatalogProduct(reference.id, db);
  if (!product) return { ...reference, available: false };
  return {
    ...reference,
    available: true,
    data: {
      name: product.name,
      productCode: product.productCode,
      conditionLabel: product.conditionLabel,
      publicationStatusLabel: product.publicationStatusLabel,
      availabilityLabel: product.availability.label,
      priceLabel: product.priceLabel,
      imageUrl: product.mainImageUrl,
      publicPath: product.publicPath,
      updatedAt: product.updatedAt
    }
  };
}

export function catalogProductSnapshot(product, context = {}) {
  return {
    title: product.name,
    url: cleanUrl(context.sourceUrl || `${context.origin || ''}${product.publicPath}`),
    imageUrl: product.mainImageUrl,
    price: product.priceLabel,
    oldPrice: '',
    currency: 'UAH',
    sku: product.productCode,
    productCode: product.productCode,
    availability: product.availability.label,
    externalProductId: product.internalId || product.id,
    domain: context.domain || '',
    id: product.id,
    condition: product.condition,
    conditionLabel: product.conditionLabel,
    source: 'storefront_catalog',
    preview: context.preview === true
  };
}
