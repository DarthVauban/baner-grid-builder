import { createHash } from 'node:crypto';
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
         brand.directory_id AS brand_directory_id,
         brand_directory.label AS brand_directory_label,
         brand.logo_url AS brand_logo_url,
         creator.name AS created_by_name,
         updater.name AS updated_by_name
  FROM used_smartphone_products AS product
  LEFT JOIN used_smartphone_brands AS brand ON brand.id = product.brand_id
  LEFT JOIN used_smartphone_brand_directories AS brand_directory ON brand_directory.id = brand.directory_id
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
    directoryId: row.directory_id,
    directoryLabel: row.directory_label || row.brand_directory_label || '',
    label: row.label,
    logoUrl: row.logo_url || '',
    active: row.active === true,
    sortOrder: Number(row.sort_order || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function serializeBrandDirectory(row) {
  return {
    id: row.id,
    label: row.label,
    description: row.description || '',
    active: row.active === true,
    sortOrder: Number(row.sort_order || 0),
    brandCount: Number(row.brand_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function serializeProductBrand(row) {
  return row.brand_id
    ? {
        id: row.brand_id,
        label: row.brand_label || '',
        directoryId: row.brand_directory_id || '',
        directoryLabel: row.brand_directory_label || '',
        logoUrl: row.brand_logo_url || ''
      }
    : null;
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
  if (value && typeof value === 'object') {
    return String(value.name || value.label || value.hex || '').trim();
  }
  const text = String(value).trim();
  if (!text) return '';
  return unit ? `${text} ${unit}` : text;
}

function characteristicFilterOptions(value, unit = '') {
  if (Array.isArray(value)) {
    return value.map((item) => {
      const text = String(item).trim();
      return text ? { value: text, label: unit ? `${text} ${unit}` : text } : null;
    }).filter(Boolean);
  }
  if (typeof value === 'boolean') {
    return [{ value: String(value), label: characteristicDisplayValue(value, unit) }];
  }
  if (value && typeof value === 'object') {
    const raw = String(value.name || value.label || value.hex || '').trim();
    const label = characteristicDisplayValue(value, unit);
    return raw && label ? [{ value: raw, label, colorHex: value.hex || '' }] : [];
  }
  const text = value === null || value === undefined ? '' : String(value).trim();
  return text ? [{ value: text, label: characteristicDisplayValue(value, unit) }] : [];
}

function appendWhereClause(whereSql, clause) {
  return whereSql ? `${whereSql} AND ${clause}` : `WHERE ${clause}`;
}

export function normalizeStorefrontCharacteristicFilters(value) {
  if (!value) return {};
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return {};
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  return Object.fromEntries(Object.entries(parsed).map(([key, values]) => [
    String(key).trim().slice(0, 120),
    (Array.isArray(values) ? values : [values])
      .map((item) => String(item ?? '').trim())
      .filter(Boolean)
      .slice(0, 80)
  ]).filter(([key, values]) => key && values.length));
}

export function appendStorefrontProductFilters(input, params, where) {
  if (input.brandId) {
    params.push(input.brandId);
    where.push(`product.brand_id = $${params.length}`);
  }
  const priceMin = Number(input.priceMin);
  if (Number.isFinite(priceMin) && priceMin >= 0) {
    params.push(priceMin);
    where.push(`product.price_uah >= $${params.length}`);
  }
  const priceMax = Number(input.priceMax);
  if (Number.isFinite(priceMax) && priceMax >= 0) {
    params.push(priceMax);
    where.push(`product.price_uah <= $${params.length}`);
  }
  const characteristicFilters = input.characteristicFilters || {};
  Object.entries(characteristicFilters).forEach(([key, values]) => {
    if (!key || !values.length) return;
    params.push(key);
    const keyIndex = params.length;
    const valueClauses = values.map((value) => {
      params.push(value);
      const valueIndex = params.length;
      params.push(`%${value}%`);
      const likeIndex = params.length;
      return `(
        filter_characteristic.value_text = $${valueIndex}
        OR filter_characteristic.value_text LIKE $${likeIndex}
        OR filter_characteristic.value_json->>'value' = $${valueIndex}
        OR filter_characteristic.value_json->'value'->>'name' = $${valueIndex}
        OR filter_characteristic.value_json->'value'->>'label' = $${valueIndex}
        OR filter_characteristic.value_json->'value'->>'hex' = $${valueIndex}
        OR CASE
          WHEN filter_characteristic.value_boolean = TRUE THEN 'true'
          WHEN filter_characteristic.value_boolean = FALSE THEN 'false'
          ELSE ''
        END = $${valueIndex}
      )`;
    });
    where.push(`product.id IN (
      SELECT filter_characteristic.product_id
      FROM used_smartphone_product_characteristics AS filter_characteristic
      LEFT JOIN used_smartphone_characteristic_template_fields AS filter_fields
        ON filter_fields.id = filter_characteristic.field_id
      WHERE filter_characteristic.key = $${keyIndex}
        AND COALESCE(filter_fields.filterable, FALSE) = TRUE
        AND (${valueClauses.join(' OR ')})
    )`);
  });
}

export async function loadStorefrontProductFilters(whereSql, params, db = { query }) {
  const scopedParams = [...params];
  const brandsResult = await db.query(
    `SELECT brand.id, brand.label, COUNT(*)::INTEGER AS count
     FROM used_smartphone_products AS product
     INNER JOIN used_smartphone_brands AS brand ON brand.id = product.brand_id
     ${whereSql}
     GROUP BY brand.id, brand.label
     ORDER BY lower(brand.label)`,
    scopedParams
  );
  const priceResult = await db.query(
    `SELECT COALESCE(MIN(product.price_uah), 0)::NUMERIC AS min,
            COALESCE(MAX(product.price_uah), 0)::NUMERIC AS max
     FROM used_smartphone_products AS product
     ${whereSql}`,
    scopedParams
  );
  const characteristicWhereSql = appendWhereClause(whereSql, 'COALESCE(fields.filterable, FALSE) = TRUE');
  const characteristicsResult = await db.query(
    `SELECT characteristics.product_id,
            characteristics.*,
            COALESCE(fields.label, characteristics.label) AS field_label,
            COALESCE(fields.type, 'text') AS type,
            COALESCE(fields.unit, '') AS unit,
            COALESCE(fields.sort_order, characteristics.sort_order) AS field_sort_order
     FROM used_smartphone_products AS product
     INNER JOIN used_smartphone_product_characteristics AS characteristics
       ON characteristics.product_id = product.id
     LEFT JOIN used_smartphone_characteristic_template_fields AS fields
       ON fields.id = characteristics.field_id
     ${characteristicWhereSql}
     ORDER BY COALESCE(fields.sort_order, characteristics.sort_order),
              lower(COALESCE(fields.label, characteristics.label))`,
    scopedParams
  );
  const characteristicsByKey = new Map();
  characteristicsResult.rows.forEach((row) => {
    const key = row.key;
    if (!key) return;
    if (!characteristicsByKey.has(key)) {
      characteristicsByKey.set(key, {
        key,
        label: row.field_label || row.label,
        type: row.type || 'text',
        unit: row.unit || '',
        sortOrder: Number(row.field_sort_order || row.sort_order || 0),
        options: new Map()
      });
    }
    const field = characteristicsByKey.get(key);
    characteristicFilterOptions(productCharacteristicValue(row), row.unit || '').forEach((option) => {
      const current = field.options.get(option.value) || { ...option, productIds: new Set() };
      current.productIds.add(row.product_id);
      if (option.colorHex) current.colorHex = option.colorHex;
      field.options.set(option.value, current);
    });
  });
  const characteristics = [...characteristicsByKey.values()]
    .map((field) => ({
      key: field.key,
      label: field.label,
      type: field.type,
      unit: field.unit,
      options: [...field.options.values()]
        .map((option) => ({
          value: option.value,
          label: option.label,
          colorHex: option.colorHex || '',
          count: option.productIds.size
        }))
        .sort((left, right) => {
          if (field.type === 'number') return Number(left.value) - Number(right.value);
          return left.label.localeCompare(right.label, 'uk');
        })
    }))
    .filter((field) => field.options.length)
    .sort((left, right) => {
      const leftField = characteristicsByKey.get(left.key);
      const rightField = characteristicsByKey.get(right.key);
      return (leftField.sortOrder - rightField.sortOrder) || left.label.localeCompare(right.label, 'uk');
    });

  return {
    brands: brandsResult.rows.map((row) => ({
      value: row.id,
      label: row.label,
      count: Number(row.count || 0)
    })),
    price: {
      min: Number(priceResult.rows[0]?.min || 0),
      max: Number(priceResult.rows[0]?.max || 0)
    },
    characteristics
  };
}

export async function attachPublicCatalogProductListDetails(products, db = { query }, { publicOnly = true } = {}) {
  await Promise.all(products.map(async (product) => {
    if (!product.internalId) return;
    product.characteristics = await loadProductCharacteristicSet(product.internalId, db);
    product.modifications = await loadProductModificationSet(product.internalId, db, { publicOnly });
  }));
  return products;
}

export async function loadProductCharacteristicSet(productId, db = { query }) {
  const result = await db.query(
    `SELECT characteristics.*,
            COALESCE(fields_by_id.label, fields_by_key.label, characteristics.label) AS field_label,
            COALESCE(fields_by_id.type, fields_by_key.type, 'text') AS type,
            COALESCE(fields_by_id.unit, fields_by_key.unit, '') AS unit,
            COALESCE(fields_by_id.filterable, fields_by_key.filterable, FALSE) AS filterable,
            COALESCE(fields_by_id.is_modifier, fields_by_key.is_modifier, FALSE) AS is_modifier,
            COALESCE(fields_by_id.sort_order, fields_by_key.sort_order, characteristics.sort_order) AS field_sort_order,
            templates.label AS template_label
     FROM used_smartphone_product_characteristics AS characteristics
     LEFT JOIN used_smartphone_characteristic_template_fields AS fields_by_id ON fields_by_id.id = characteristics.field_id
     LEFT JOIN used_smartphone_characteristic_template_fields AS fields_by_key
       ON fields_by_key.template_id = characteristics.template_id AND fields_by_key.key = characteristics.key
     LEFT JOIN used_smartphone_characteristic_templates AS templates ON templates.id = characteristics.template_id
     WHERE characteristics.product_id = $1
     ORDER BY COALESCE(fields_by_id.sort_order, fields_by_key.sort_order, characteristics.sort_order),
              lower(COALESCE(fields_by_id.label, fields_by_key.label, characteristics.label))`,
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
        label: row.field_label || row.label,
        type: row.type,
        value,
        displayValue: characteristicDisplayValue(value, row.unit || ''),
        unit: row.unit || '',
        filterable: row.filterable === true,
        isModifier: row.is_modifier === true,
        sortOrder: Number(row.field_sort_order || row.sort_order || 0)
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
            COALESCE(fields_by_id.label, fields_by_key.label, characteristics.label) AS field_label,
            COALESCE(fields_by_id.type, fields_by_key.type, 'text') AS type,
            COALESCE(fields_by_id.unit, fields_by_key.unit, '') AS unit,
            COALESCE(fields_by_id.is_modifier, fields_by_key.is_modifier, FALSE) AS is_modifier,
            COALESCE(fields_by_id.sort_order, fields_by_key.sort_order, characteristics.sort_order) AS field_sort_order
     FROM used_smartphone_product_characteristics AS characteristics
     LEFT JOIN used_smartphone_characteristic_template_fields AS fields_by_id ON fields_by_id.id = characteristics.field_id
     LEFT JOIN used_smartphone_characteristic_template_fields AS fields_by_key
       ON fields_by_key.template_id = characteristics.template_id AND fields_by_key.key = characteristics.key
     WHERE characteristics.product_id IN (${placeholders})
       AND COALESCE(fields_by_id.is_modifier, fields_by_key.is_modifier, FALSE) = TRUE
     ORDER BY COALESCE(fields_by_id.sort_order, fields_by_key.sort_order, characteristics.sort_order),
              lower(COALESCE(fields_by_id.label, fields_by_key.label, characteristics.label))`,
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
      label: row.field_label || row.label,
      value,
      displayValue,
      unit: row.unit || '',
      sortOrder: Number(row.field_sort_order || row.sort_order || 0)
    };
    const productValues = valuesByProduct.get(row.product_id) || new Map();
    productValues.set(row.key, item);
    valuesByProduct.set(row.product_id, productValues);
    if (!parametersByKey.has(row.key)) parametersByKey.set(row.key, { key: row.key, label: row.field_label || row.label, sortOrder: Number(row.field_sort_order || row.sort_order || 0) });
  });

  const currentValues = valuesByProduct.get(productId) || new Map();
  const currentProduct = products.find((product) => product.id === productId) || null;

  const findVariantForOption = (parameterKey, displayValue) => {
    const currentMatch = currentProduct && (valuesByProduct.get(currentProduct.id) || new Map()).get(parameterKey)?.displayValue === displayValue
      ? currentProduct
      : null;
    const strictMatch = products.find((product) => {
      const values = valuesByProduct.get(product.id) || new Map();
      if (values.get(parameterKey)?.displayValue !== displayValue) return false;
      return [...parametersByKey.keys()].every((key) => {
        if (key === parameterKey) return true;
        const current = currentValues.get(key);
        if (!current?.displayValue) return true;
        return values.get(key)?.displayValue === current.displayValue;
      });
    });
    const fallbackMatch = products.find((product) => (valuesByProduct.get(product.id) || new Map()).get(parameterKey)?.displayValue === displayValue);
    const match = currentMatch || strictMatch || fallbackMatch;
    return {
      product: match ? serializeModificationProduct(match, { publicOnly }) : null,
      compatible: Boolean(currentMatch || strictMatch)
    };
  };

  const parameters = [...parametersByKey.values()]
    .sort((left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label))
    .map((parameter) => {
      const current = currentValues.get(parameter.key);
      const optionValues = new Map();
      products.forEach((product) => {
        const value = (valuesByProduct.get(product.id) || new Map()).get(parameter.key);
        if (value && !optionValues.has(value.displayValue)) {
          optionValues.set(value.displayValue, value);
        }
      });
      const options = [...optionValues.values()].map((option) => {
        const variant = findVariantForOption(parameter.key, option.displayValue);
        return {
          id: `${parameter.key}:${option.displayValue}`,
          value: String(option.value ?? option.displayValue),
          label: option.displayValue,
          selected: current?.displayValue === option.displayValue,
          compatible: variant.compatible,
          product: variant.product
        };
      });
      return {
        id: parameter.key,
        key: parameter.key,
        label: parameter.label,
        currentValueId: current?.displayValue || null,
        currentValueLabel: current?.displayValue || '',
        options
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
    brand: serializeProductBrand(row),
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
    brand: serializeProductBrand(row),
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

const importSource = 'xlsx_catalog';
const importClearToken = '#CLEAR';
const characteristicHeaderPattern = /\[([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}):([a-z0-9_]+)\]\s*$/i;

const importCoreColumns = [
  { key: 'productCode', label: 'Код товару', aliases: ['Код товару', 'Product code', 'SKU'], width: 18, example: '', description: 'Необовʼязковий внутрішній код SM-XXXXXX. Має найвищий пріоритет під час зіставлення.' },
  { key: 'name', label: 'Назва', aliases: ['Назва', 'Назва товару', 'Name', 'Модель'], width: 38, example: 'iPhone 13 128GB Midnight', required: true, description: 'Стабільна назва товару. Разом зі станом використовується як резервний ключ імпорту.' },
  { key: 'condition', label: 'Стан', aliases: ['Статус', 'Стан', 'Condition'], width: 16, example: 'Вживаний', required: true, description: 'Вживаний або Відновлений. Також підтримуються USED і REFURBISHED.' },
  { key: 'brandDirectory', label: 'Довідник брендів', aliases: ['Довідник брендів', 'Brand directory'], width: 24, example: 'Бренди смартфонів', description: 'Потрібен, якщо однакова назва бренду існує в декількох довідниках.' },
  { key: 'brand', label: 'Бренд', aliases: ['Бренд', 'Brand'], width: 20, example: 'Apple', description: `Точна назва бренду з аркуша «Довідники». ${importClearToken} очищає бренд.` },
  { key: 'stockCount', label: 'Залишок', aliases: ['Залишок', 'Stock', 'Кількість'], width: 12, example: 1, required: true, description: 'Невідʼємне ціле число.' },
  { key: 'incomingCount', label: 'В дорозі', aliases: ['В дорозі', 'Incoming', 'В дорозi'], width: 12, example: 0, required: true, description: 'Невідʼємне ціле число.' },
  { key: 'priceUah', label: 'Ціна', aliases: ['Ціна', 'Цена', 'Price', 'Цiна'], width: 14, example: 18999, required: true, description: 'Роздрібна ціна у гривнях.' },
  { key: 'purchasePriceUah', label: 'Закупівельна ціна', aliases: ['Закупівельна ціна', 'Purchase price'], width: 18, example: 15000, description: 'Необовʼязкова закупівельна ціна у гривнях.' },
  { key: 'conditionGrade', label: 'Грейд', aliases: ['Грейд', 'Grade'], width: 14, example: 'A', description: `Внутрішній грейд товару. ${importClearToken} очищає значення.` },
  { key: 'bodyCondition', label: 'Стан корпусу', aliases: ['Стан корпусу', 'Body condition'], width: 22, example: 'Незначні сліди використання', description: `Опис стану корпусу. ${importClearToken} очищає значення.` },
  { key: 'displayCondition', label: 'Стан дисплея', aliases: ['Стан дисплея', 'Display condition'], width: 22, example: 'Без подряпин', description: `Опис стану дисплея. ${importClearToken} очищає значення.` },
  { key: 'batteryHealth', label: 'Акумулятор', aliases: ['Акумулятор', 'Battery health'], width: 16, example: '91%', description: `Стан акумулятора. ${importClearToken} очищає значення.` },
  { key: 'warranty', label: 'Гарантія', aliases: ['Гарантія', 'Warranty'], width: 18, example: '3 місяці', description: `Умови гарантії. ${importClearToken} очищає значення.` },
  { key: 'includedAccessories', label: 'Комплектація', aliases: ['Комплектація', 'Included accessories'], width: 28, example: 'Смартфон, кабель', description: `Комплектація товару. ${importClearToken} очищає значення.` },
  { key: 'technicianName', label: 'Технік', aliases: ['Технік', 'Technician'], width: 20, example: '', description: `Імʼя відповідального техніка. ${importClearToken} очищає значення.` },
  { key: 'inspectionDate', label: 'Дата перевірки', aliases: ['Дата перевірки', 'Inspection date'], width: 16, example: '2026-07-21', description: `Дата у форматі YYYY-MM-DD. ${importClearToken} очищає значення.` },
  { key: 'accountingStatus', label: 'Обліковий статус', aliases: ['Обліковий статус', 'Accounting status'], width: 20, example: '', description: `Внутрішній обліковий статус. ${importClearToken} очищає значення.` },
  { key: 'imeiSerial', label: 'IMEI / Серійний номер', aliases: ['IMEI / Серійний номер', 'IMEI', 'Серійний номер', 'Serial'], width: 24, example: '', description: `Стабільний ідентифікатор із найвищим пріоритетом після коду товару. ${importClearToken} очищає значення.` },
  { key: 'shortDescription', label: 'Короткий опис', aliases: ['Короткий опис', 'Short description'], width: 36, example: '', description: `Короткий опис для картки. ${importClearToken} очищає значення.` },
  { key: 'internalNotes', label: 'Внутрішні нотатки', aliases: ['Внутрішні нотатки', 'Internal notes'], width: 36, example: '', description: `Приватні нотатки. ${importClearToken} очищає значення.` },
  { key: 'template', label: 'Шаблон характеристик', aliases: ['Шаблон характеристик', 'Characteristic template'], width: 28, example: '', description: 'Точна назва актуального шаблону з аркуша «Характеристики».' },
  { key: 'groupLabel', label: 'Група модифікацій', aliases: ['Група модифікацій', 'Modification group'], width: 28, example: '', description: 'Однакова назва обʼєднує рядки в групу модифікацій.' },
  { key: 'groupMain', label: 'Основна модифікація', aliases: ['Основна модифікація', 'Main modification'], width: 20, example: '', description: 'Так/Ні. У межах групи основною може бути лише одна модифікація.' }
];

function importCharacteristicHeader(template, field) {
  const suffix = field.isModifier ? ' · параметр модифікації' : '';
  return `${template.label} · ${field.label}${suffix} [${template.id}:${field.key}]`;
}

export async function loadCatalogImportSchema(db = { query }) {
  const [templatesResult, fieldsResult, brandsResult] = await Promise.all([
    db.query(
      `SELECT * FROM used_smartphone_characteristic_templates
       WHERE active = TRUE
       ORDER BY sort_order, lower(label)`
    ),
    db.query(
      `SELECT fields.*
       FROM used_smartphone_characteristic_template_fields AS fields
       INNER JOIN used_smartphone_characteristic_templates AS templates ON templates.id = fields.template_id
       WHERE templates.active = TRUE
       ORDER BY templates.sort_order, fields.sort_order, fields.created_at`
    ),
    db.query(
      `SELECT brands.id, brands.label, brands.directory_id, directories.label AS directory_label
       FROM used_smartphone_brands AS brands
       INNER JOIN used_smartphone_brand_directories AS directories ON directories.id = brands.directory_id
       WHERE brands.active = TRUE AND directories.active = TRUE
       ORDER BY directories.sort_order, lower(directories.label), lower(brands.label)`
    )
  ]);
  const fieldsByTemplate = new Map();
  fieldsResult.rows.forEach((row) => {
    const fields = fieldsByTemplate.get(row.template_id) || [];
    fields.push({
      id: row.id,
      templateId: row.template_id,
      key: row.key,
      label: row.label,
      type: row.type,
      unit: row.unit || '',
      options: normalizeJsonArray(row.options),
      required: row.required === true,
      filterable: row.filterable === true,
      isModifier: row.is_modifier === true,
      sortOrder: Number(row.sort_order || 0)
    });
    fieldsByTemplate.set(row.template_id, fields);
  });
  const templates = templatesResult.rows.map((row) => {
    const template = {
      id: row.id,
      label: row.label,
      description: row.description || '',
      updatedAt: row.updated_at,
      fields: fieldsByTemplate.get(row.id) || []
    };
    template.fields = template.fields.map((field) => ({
      ...field,
      header: importCharacteristicHeader(template, field)
    }));
    return template;
  });
  return {
    version: 1,
    source: importSource,
    clearToken: importClearToken,
    columns: importCoreColumns.map(({ aliases, ...column }) => column),
    templates,
    brands: brandsResult.rows.map((row) => ({
      id: row.id,
      label: row.label,
      directoryId: row.directory_id,
      directoryLabel: row.directory_label
    }))
  };
}

function importReferenceData(schema) {
  const templatesById = new Map(schema.templates.map((template) => [template.id, template]));
  const templatesByLabel = new Map(schema.templates.map((template) => [normalizeHeader(template.label), template]));
  const brandsByLabel = new Map();
  schema.brands.forEach((brand) => {
    const key = normalizeHeader(brand.label);
    const brands = brandsByLabel.get(key) || [];
    brands.push(brand);
    brandsByLabel.set(key, brands);
  });
  return { schema, templatesById, templatesByLabel, brandsByLabel };
}

function rowLookup(row) {
  return new Map(Object.entries(row || {}).map(([key, value]) => [normalizeHeader(key), { key, value }]));
}

function findColumn(lookup, columns) {
  for (const column of columns) {
    const found = lookup.get(normalizeHeader(column));
    if (found) return { found: true, value: found.value, key: found.key };
  }
  return { found: false, value: '', key: '' };
}

function pickColumn(row, columns) {
  return findColumn(rowLookup(row), columns).value;
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

function normalizeImportSerial(value) {
  return String(value || '').normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 160);
}

function stableImportValue(value) {
  if (Array.isArray(value)) return value.map(stableImportValue).sort().join(',');
  if (value && typeof value === 'object') return Object.keys(value).sort().map((key) => `${key}:${stableImportValue(value[key])}`).join(',');
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase('uk-UA').trim();
}

function importTextCell(lookup, aliases, maxLength) {
  const cell = findColumn(lookup, aliases);
  if (!cell.found) return { provided: false, value: '' };
  const raw = String(cell.value ?? '').trim();
  if (!raw) return { provided: false, value: '' };
  if (raw.toUpperCase() === importClearToken) return { provided: true, value: '' };
  return { provided: true, value: cleanText(raw, maxLength) };
}

function parseImportDate(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000);
    return date.toISOString().slice(0, 10);
  }
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(`${text}T00:00:00Z`))) return text;
  return '';
}

function parseImportBoolean(value) {
  if (typeof value === 'boolean') return { valid: true, value };
  const normalized = normalizeHeader(value);
  if (['так', 'yes', 'true', '1', '+'].includes(normalized)) return { valid: true, value: true };
  if (['ні', 'нет', 'no', 'false', '0', '-'].includes(normalized)) return { valid: true, value: false };
  return { valid: false, value: false };
}

function emptyCharacteristicValue(field) {
  if (field.type === 'boolean') return false;
  if (field.type === 'number') return null;
  if (field.type === 'multiselect') return [];
  if (field.type === 'color') return { name: '', hex: '' };
  return '';
}

function characteristicImportValue(field, raw) {
  const text = String(raw ?? '').trim();
  if (text.toUpperCase() === importClearToken) return { provided: true, valid: true, value: emptyCharacteristicValue(field) };
  if (!text) return { provided: false, valid: true, value: emptyCharacteristicValue(field) };
  if (field.type === 'number') {
    const number = Number(text.replace(/\s+/g, '').replace(',', '.'));
    return Number.isFinite(number)
      ? { provided: true, valid: true, value: number }
      : { provided: true, valid: false, value: null, reason: 'має бути числом' };
  }
  if (field.type === 'boolean') {
    const parsed = parseImportBoolean(raw);
    return parsed.valid
      ? { provided: true, valid: true, value: parsed.value }
      : { provided: true, valid: false, value: false, reason: 'має бути Так або Ні' };
  }
  if (field.type === 'multiselect') {
    const values = text.split(';').map((item) => item.trim()).filter(Boolean);
    const allowed = new Map(field.options.map((option) => [normalizeHeader(option), option]));
    const invalid = values.filter((value) => field.options.length && !allowed.has(normalizeHeader(value)));
    if (invalid.length) return { provided: true, valid: false, value: [], reason: `містить невідомі значення: ${invalid.join(', ')}` };
    return { provided: true, valid: true, value: values.map((value) => allowed.get(normalizeHeader(value)) || value) };
  }
  if (field.type === 'select') {
    const allowed = new Map(field.options.map((option) => [normalizeHeader(option), option]));
    if (field.options.length && !allowed.has(normalizeHeader(text))) {
      return { provided: true, valid: false, value: '', reason: `має одне зі значень: ${field.options.join(', ')}` };
    }
    return { provided: true, valid: true, value: allowed.get(normalizeHeader(text)) || text };
  }
  if (field.type === 'color') {
    const parts = text.split('|').map((item) => item.trim()).filter(Boolean);
    const hex = parts.find((item) => /^#[0-9a-f]{6}$/i.test(item))?.toLowerCase() || '';
    const name = parts.find((item) => !/^#[0-9a-f]{6}$/i.test(item)) || '';
    return { provided: true, valid: true, value: { name: name.slice(0, 160), hex } };
  }
  return { provided: true, valid: true, value: cleanText(text, 2000) };
}

function characteristicHasValue(field, value) {
  if (field.type === 'boolean') return value === true || value === false;
  if (field.type === 'number') return Number.isFinite(value);
  if (field.type === 'multiselect') return Array.isArray(value) && value.length > 0;
  if (field.type === 'color') return Boolean(value?.name || value?.hex);
  return Boolean(String(value ?? '').trim());
}

function importIdentityKeys(row) {
  const keys = [];
  if (row.productCode) keys.push(`code:${row.productCode.toLocaleLowerCase('uk-UA')}`);
  const serial = normalizeImportSerial(row.imeiSerial);
  if (serial) keys.push(`imei:${serial}`);
  const modifierParts = row.template?.fields
    .filter((field) => field.isModifier && row.characteristicProvidedKeys.includes(field.key) && characteristicHasValue(field, row.characteristics[field.key]))
    .map((field) => `${field.key}=${stableImportValue(row.characteristics[field.key])}`)
    .sort() || [];
  if (row.template && modifierParts.length) {
    const variantScope = normalizeProductName(row.groupLabel || row.name);
    const modifierSignature = createHash('sha256').update(modifierParts.join('|')).digest('hex');
    keys.push(`variant:${variantScope}|${row.condition}|${row.brandId || ''}|${row.template.id}|${modifierSignature}`);
  }
  if (row.normalizedName && row.condition) keys.push(`name:${row.normalizedName}|condition:${row.condition}`);
  return [...new Set(keys)];
}

function serializeImportRow(row, index, reference) {
  const lookup = rowLookup(row);
  const name = cleanText(findColumn(lookup, importCoreColumns.find((column) => column.key === 'name').aliases).value, 240);
  const condition = parseImportCondition(findColumn(lookup, importCoreColumns.find((column) => column.key === 'condition').aliases).value);
  const stockCount = parseNonNegativeInteger(findColumn(lookup, importCoreColumns.find((column) => column.key === 'stockCount').aliases).value);
  const incomingCount = parseNonNegativeInteger(findColumn(lookup, importCoreColumns.find((column) => column.key === 'incomingCount').aliases).value);
  const priceUah = parseMoney(findColumn(lookup, importCoreColumns.find((column) => column.key === 'priceUah').aliases).value);
  const productCode = cleanText(findColumn(lookup, importCoreColumns.find((column) => column.key === 'productCode').aliases).value, 20).toUpperCase();
  const normalizedName = normalizeProductName(name);
  const errors = [];
  if (!name) errors.push('Не заповнено назву.');
  if (!condition) errors.push('Стан має бути USED/REFURBISHED або Вживаний/Відновлений.');
  if (!Number.isInteger(stockCount)) errors.push('Залишок має бути невідʼємним цілим числом.');
  if (!Number.isInteger(incomingCount)) errors.push('В дорозі має бути невідʼємним цілим числом.');
  if (!Number.isFinite(priceUah)) errors.push('Ціна має бути невідʼємним числом.');
  if (productCode && !/^SM-\d{6}$/.test(productCode)) errors.push('Код товару має формат SM-000001.');

  const brandDirectory = importTextCell(lookup, importCoreColumns.find((column) => column.key === 'brandDirectory').aliases, 180);
  const brandCell = importTextCell(lookup, importCoreColumns.find((column) => column.key === 'brand').aliases, 160);
  let brandId = null;
  let brandLabel = '';
  if (brandCell.provided && brandCell.value) {
    let candidates = reference.brandsByLabel.get(normalizeHeader(brandCell.value)) || [];
    if (brandDirectory.provided && brandDirectory.value) {
      candidates = candidates.filter((brand) => normalizeHeader(brand.directoryLabel) === normalizeHeader(brandDirectory.value));
    }
    if (candidates.length === 1) {
      brandId = candidates[0].id;
      brandLabel = candidates[0].label;
    } else if (!candidates.length) {
      errors.push(`Бренд «${brandCell.value}» не знайдено в активних довідниках.`);
    } else {
      errors.push(`Бренд «${brandCell.value}» є в декількох довідниках. Заповніть колонку «Довідник брендів».`);
    }
  }

  const templateCell = importTextCell(lookup, importCoreColumns.find((column) => column.key === 'template').aliases, 180);
  let template = null;
  if (templateCell.provided && templateCell.value) {
    template = reference.templatesById.get(templateCell.value) || reference.templatesByLabel.get(normalizeHeader(templateCell.value)) || null;
    if (!template) errors.push(`Шаблон характеристик «${templateCell.value}» не знайдено. Завантажте актуальний XLSX-шаблон.`);
  }

  const characteristics = {};
  const characteristicProvidedKeys = [];
  const referencedTemplateIds = new Set();
  Object.entries(row || {}).forEach(([header, raw]) => {
    const match = header.match(characteristicHeaderPattern);
    if (!match) return;
    const columnTemplate = reference.templatesById.get(match[1]);
    const field = columnTemplate?.fields.find((item) => item.key === match[2]);
    const hasValue = String(raw ?? '').trim() !== '';
    if (!columnTemplate || !field) {
      if (hasValue) errors.push(`Колонка «${header}» застаріла. Завантажте актуальний XLSX-шаблон.`);
      return;
    }
    if (!hasValue) return;
    referencedTemplateIds.add(columnTemplate.id);
    const parsed = characteristicImportValue(field, raw);
    if (!parsed.valid) {
      errors.push(`Характеристика «${field.label}» ${parsed.reason}.`);
      return;
    }
    characteristics[field.key] = parsed.value;
    characteristicProvidedKeys.push(field.key);
  });
  if (!template && referencedTemplateIds.size === 1) template = reference.templatesById.get([...referencedTemplateIds][0]) || null;
  if (referencedTemplateIds.size > 1) errors.push('В одному рядку заповнені характеристики з різних шаблонів.');
  if (template && [...referencedTemplateIds].some((templateId) => templateId !== template.id)) {
    errors.push('Заповнені характеристики не належать вибраному шаблону.');
  }

  const textFieldLengths = {
    conditionGrade: 40,
    bodyCondition: 120,
    displayCondition: 120,
    batteryHealth: 120,
    warranty: 160,
    includedAccessories: 10000,
    technicianName: 160,
    accountingStatus: 80,
    imeiSerial: 160,
    shortDescription: 1200,
    internalNotes: 10000
  };
  const textFields = {};
  for (const [key, maxLength] of Object.entries(textFieldLengths)) {
    const column = importCoreColumns.find((item) => item.key === key);
    textFields[key] = importTextCell(lookup, column.aliases, maxLength);
  }
  const purchaseCell = findColumn(lookup, importCoreColumns.find((column) => column.key === 'purchasePriceUah').aliases);
  let purchasePriceUah = { provided: false, value: null };
  if (purchaseCell.found && String(purchaseCell.value ?? '').trim()) {
    if (String(purchaseCell.value).trim().toUpperCase() === importClearToken) {
      purchasePriceUah = { provided: true, value: null };
    } else {
      const parsed = parseMoney(purchaseCell.value);
      if (!Number.isFinite(parsed)) errors.push('Закупівельна ціна має бути невідʼємним числом.');
      else purchasePriceUah = { provided: true, value: parsed };
    }
  }
  const inspectionCell = findColumn(lookup, importCoreColumns.find((column) => column.key === 'inspectionDate').aliases);
  let inspectionDate = { provided: false, value: null };
  if (inspectionCell.found && String(inspectionCell.value ?? '').trim()) {
    if (String(inspectionCell.value).trim().toUpperCase() === importClearToken) inspectionDate = { provided: true, value: null };
    else {
      const parsed = parseImportDate(inspectionCell.value);
      if (!parsed) errors.push('Дата перевірки має формат YYYY-MM-DD.');
      else inspectionDate = { provided: true, value: parsed };
    }
  }
  const groupLabel = importTextCell(lookup, importCoreColumns.find((column) => column.key === 'groupLabel').aliases, 240);
  const groupMainCell = findColumn(lookup, importCoreColumns.find((column) => column.key === 'groupMain').aliases);
  let groupMain = false;
  if (groupMainCell.found && String(groupMainCell.value ?? '').trim()) {
    const parsed = parseImportBoolean(groupMainCell.value);
    if (!parsed.valid) errors.push('Основна модифікація має бути Так або Ні.');
    groupMain = parsed.value;
  }

  const serialized = {
    rowNumber: index + 2,
    name,
    normalizedName,
    condition,
    conditionLabel: conditionLabels[condition] || '',
    stockCount: Number.isInteger(stockCount) ? stockCount : null,
    incomingCount: Number.isInteger(incomingCount) ? incomingCount : null,
    priceUah: Number.isFinite(priceUah) ? priceUah : null,
    productCode,
    brandId,
    brandLabel,
    brandProvided: brandCell.provided,
    templateId: template?.id || null,
    templateLabel: template?.label || '',
    characteristics,
    characteristicProvidedKeys,
    characteristicCount: characteristicProvidedKeys.length,
    purchasePriceUah,
    inspectionDate,
    textFields,
    imeiSerial: textFields.imeiSerial.value,
    groupLabel: groupLabel.value,
    groupMain,
    action: errors.length ? 'error' : 'pending',
    result: errors.length ? 'error' : 'pending',
    reason: errors.join(' ')
  };
  Object.defineProperty(serialized, 'template', { value: template, writable: true, enumerable: false });
  serialized.identityKeys = importIdentityKeys(serialized);
  serialized.identityKey = serialized.identityKeys.find((key) => key.startsWith('imei:'))
    || serialized.identityKeys.find((key) => key.startsWith('variant:'))
    || serialized.identityKeys.find((key) => key.startsWith('name:'))
    || '';
  return serialized;
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

async function findImportProduct(row, db) {
  const candidates = new Map();
  const remember = (product, reason, priority) => {
    if (!product?.id) return;
    const current = candidates.get(product.id);
    if (!current || priority > current.matchPriority) {
      candidates.set(product.id, { ...product, matchReason: reason, matchPriority: priority });
    }
  };
  for (const identityKey of row.identityKeys) {
    const mapped = await db.query(
      `SELECT product.id, product.product_code, product.publication_status, product.brand_id,
              product.normalized_name, product.condition, product.imei_serial
       FROM used_smartphone_product_import_keys AS keys
       INNER JOIN used_smartphone_products AS product ON product.id = keys.product_id
       WHERE keys.source = $1 AND keys.identity_key = $2`,
      [importSource, identityKey]
    );
    const identityLabel = identityKey.startsWith('imei:') ? 'IMEI / серійним номером'
      : identityKey.startsWith('code:') ? 'кодом товару'
        : identityKey.startsWith('variant:') ? 'параметрами модифікації'
          : 'назвою та станом';
    remember(mapped.rows[0], `Збережена відповідність попереднього імпорту за ${identityLabel}.`, 5);
  }
  if (row.productCode) {
    const byCode = await db.query(
      `SELECT id, product_code, publication_status, brand_id, normalized_name, condition, imei_serial
       FROM used_smartphone_products WHERE lower(product_code) = lower($1)`,
      [row.productCode]
    );
    if (!byCode.rows[0]) return { conflict: `Товар із кодом ${row.productCode} не знайдено.` };
    remember(byCode.rows[0], 'Збіг за кодом товару.', 4);
  }
  if (row.imeiSerial) {
    const bySerial = await db.query(
      `SELECT id, product_code, publication_status, brand_id, normalized_name, condition, imei_serial
       FROM used_smartphone_products WHERE lower(imei_serial) = lower($1)`,
      [row.imeiSerial]
    );
    bySerial.rows.forEach((product) => remember(product, 'Збіг за IMEI або серійним номером.', 4));
  }
  if (row.normalizedName && row.condition) {
    const byName = await db.query(
      `SELECT id, product_code, publication_status, brand_id, normalized_name, condition, imei_serial
       FROM used_smartphone_products WHERE normalized_name = $1 AND condition = $2`,
      [row.normalizedName, row.condition]
    );
    remember(byName.rows[0], 'Збіг за стабільною назвою та станом.', 1);
  }
  if (candidates.size > 1) {
    return { conflict: `Рядок відповідає декільком товарам: ${[...candidates.values()].map((product) => product.product_code).join(', ')}.` };
  }
  return { product: [...candidates.values()][0] || null };
}

async function currentCharacteristicValues(productId, db) {
  const result = await db.query(
    `SELECT template_id, key, value_text, value_number, value_boolean, value_json
     FROM used_smartphone_product_characteristics
     WHERE product_id = $1`,
    [productId]
  );
  const values = {};
  result.rows.forEach((characteristic) => {
    const json = normalizeJsonObject(characteristic.value_json);
    values[characteristic.key] = Object.hasOwn(json, 'value') ? json.value : characteristic.value_text;
  });
  return { templateId: result.rows[0]?.template_id || null, values };
}

async function validateImportCharacteristics(row, product, db) {
  if (!row.template) return;
  const existing = product ? await currentCharacteristicValues(product.id, db) : { templateId: null, values: {} };
  const sameTemplate = existing.templateId === row.template.id;
  const finalValues = sameTemplate ? { ...existing.values } : {};
  row.characteristicProvidedKeys.forEach((key) => {
    finalValues[key] = row.characteristics[key];
  });
  const missing = row.template.fields.filter((field) => field.required && !characteristicHasValue(field, finalValues[field.key]));
  if (missing.length) {
    row.action = 'error';
    row.result = 'error';
    row.reason = `${row.reason ? `${row.reason} ` : ''}Не заповнені обовʼязкові характеристики: ${missing.map((field) => field.label).join(', ')}.`;
  }
  Object.defineProperty(row, 'finalCharacteristicValues', { value: finalValues, writable: true, enumerable: false });
}

function markImportGroupConflicts(rows) {
  const groups = new Map();
  rows.filter((row) => row.groupLabel && row.result !== 'error' && row.result !== 'conflict').forEach((row) => {
    const key = normalizeHeader(row.groupLabel);
    const groupRows = groups.get(key) || [];
    groupRows.push(row);
    groups.set(key, groupRows);
  });
  groups.forEach((groupRows) => {
    if (groupRows.filter((row) => row.groupMain).length <= 1) return;
    groupRows.forEach((row) => {
      row.action = 'conflict';
      row.result = 'conflict';
      row.reason = 'У групі модифікацій позначено декілька основних товарів.';
    });
  });
}

export async function analyzeImportRows(rawRows, db = { query }) {
  const schema = await loadCatalogImportSchema(db);
  const reference = importReferenceData(schema);
  const rows = (Array.isArray(rawRows) ? rawRows : []).map((row, index) => serializeImportRow(row, index, reference));
  const keyCounts = new Map();
  for (const row of rows) {
    if (row.result === 'error') continue;
    const key = row.identityKey;
    keyCounts.set(key, (keyCounts.get(key) || 0) + 1);
  }
  for (const row of rows) {
    if (row.result === 'error') continue;
    const key = row.identityKey;
    if (keyCounts.get(key) > 1) {
      row.action = 'conflict';
      row.result = 'conflict';
      row.reason = 'Дублікат у файлі імпорту. Рядки не агрегуються.';
    }
  }

  const validRows = rows.filter((row) => row.result === 'pending');
  for (const row of validRows) {
    const match = await findImportProduct(row, db);
    if (match.conflict) {
      row.action = 'conflict';
      row.result = 'conflict';
      row.reason = match.conflict;
      continue;
    }
    const product = match.product;
    row.productId = product?.id || null;
    row.productCode = product?.product_code || '';
    row.currentPublicationStatus = product?.publication_status || null;
    row.matchReason = product?.matchReason || '';
    await validateImportCharacteristics(row, product, db);
    if (row.result === 'error') continue;
    row.action = product ? 'update' : 'create';
    row.result = 'ready';
  }
  markImportGroupConflicts(rows);
  return { rows, summary: importSummary(rows) };
}

function importCharacteristicTextValue(value) {
  if (Array.isArray(value)) return value.map(String).join(', ');
  if (value && typeof value === 'object') return String(value.name || value.label || value.hex || '').trim();
  return value == null ? '' : String(value);
}

async function applyImportCharacteristics(db, productId, row, actorId) {
  if (!row.template) return;
  await db.query('DELETE FROM used_smartphone_product_characteristics WHERE product_id = $1', [productId]);
  for (const [index, field] of row.template.fields.entries()) {
    const value = Object.hasOwn(row.finalCharacteristicValues || {}, field.key)
      ? row.finalCharacteristicValues[field.key]
      : emptyCharacteristicValue(field);
    await db.query(
      `INSERT INTO used_smartphone_product_characteristics (
         product_id, template_id, field_id, key, label, value_text,
         value_number, value_boolean, value_json, sort_order, updated_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::JSONB, $10, $11)`,
      [
        productId,
        row.template.id,
        field.id,
        field.key,
        field.label,
        importCharacteristicTextValue(value),
        typeof value === 'number' ? value : null,
        typeof value === 'boolean' ? value : null,
        JSON.stringify({ value }),
        field.sortOrder ?? index,
        actorId
      ]
    );
  }
}

async function saveImportIdentityKeys(db, productId, row) {
  const snapshot = {
    name: row.name,
    condition: row.condition,
    brandId: row.brandId || null,
    templateId: row.templateId || null,
    modifierValues: row.template?.fields
      .filter((field) => field.isModifier)
      .reduce((values, field) => ({ ...values, [field.key]: row.finalCharacteristicValues?.[field.key] ?? null }), {}) || {}
  };
  for (const identityKey of importIdentityKeys(row)) {
    const existing = await db.query(
      'SELECT product_id FROM used_smartphone_product_import_keys WHERE source = $1 AND identity_key = $2',
      [importSource, identityKey]
    );
    if (existing.rows[0] && existing.rows[0].product_id !== productId) {
      throw new AppError(409, 'CATALOG_IMPORT_IDENTITY_CONFLICT', `Ключ імпорту вже належить іншому товару: ${identityKey}.`);
    }
    await db.query(
      `INSERT INTO used_smartphone_product_import_keys (source, identity_key, product_id, identity_snapshot)
       VALUES ($1, $2, $3, $4::JSONB)
       ON CONFLICT (source, identity_key)
       DO UPDATE SET identity_snapshot = EXCLUDED.identity_snapshot, updated_at = NOW()`,
      [importSource, identityKey, productId, JSON.stringify(snapshot)]
    );
  }
}

async function makeUniqueImportGroupSlug(label, db) {
  const base = slugBase(label, 'modifications');
  let slug = base;
  for (let index = 2; index < 1000; index += 1) {
    const existing = await db.query('SELECT id FROM used_smartphone_product_groups WHERE slug = $1', [slug]);
    if (!existing.rows[0]) return slug;
    slug = `${base}-${index}`;
  }
  throw new AppError(409, 'CATALOG_GROUP_SLUG_UNAVAILABLE', 'Не вдалося створити адресу групи модифікацій.');
}

async function syncImportedGroups(db, rows, actorId) {
  const grouped = new Map();
  rows.filter((row) => ['created', 'updated'].includes(row.result) && row.groupLabel && row.productId).forEach((row) => {
    const key = normalizeHeader(row.groupLabel);
    const groupRows = grouped.get(key) || [];
    groupRows.push(row);
    grouped.set(key, groupRows);
  });
  for (const groupRows of grouped.values()) {
    const label = groupRows[0].groupLabel;
    const groups = await db.query(
      'SELECT * FROM used_smartphone_product_groups WHERE lower(label) = lower($1) ORDER BY updated_at DESC',
      [label]
    );
    if (groups.rows.length > 1) throw new AppError(409, 'CATALOG_IMPORT_GROUP_CONFLICT', `Знайдено декілька груп із назвою «${label}».`);
    let group = groups.rows[0];
    if (!group) {
      const created = await db.query(
        `INSERT INTO used_smartphone_product_groups (label, slug, active, created_by, updated_by)
         VALUES ($1, $2, TRUE, $3, $3)
         RETURNING *`,
        [label, await makeUniqueImportGroupSlug(label, db), actorId]
      );
      group = created.rows[0];
    }
    const productIds = [...new Set(groupRows.map((row) => row.productId))];
    const productPlaceholders = productIds.map((_, index) => `$${index + 1}`).join(', ');
    await db.query(
      `DELETE FROM used_smartphone_product_group_items
       WHERE product_id IN (${productPlaceholders}) AND group_id <> $${productIds.length + 1}`,
      [...productIds, group.id]
    );
    await db.query(
      `UPDATE used_smartphone_product_groups
       SET main_product_id = NULL, updated_at = NOW()
       WHERE main_product_id IN (${productPlaceholders}) AND id <> $${productIds.length + 1}`,
      [...productIds, group.id]
    );
    for (const [index, row] of groupRows.entries()) {
      await db.query(
        `INSERT INTO used_smartphone_product_group_items (group_id, product_id, sort_order)
         VALUES ($1, $2, $3)
         ON CONFLICT (group_id, product_id) DO UPDATE SET sort_order = EXCLUDED.sort_order`,
        [group.id, row.productId, index]
      );
    }
    const selectedMain = groupRows.find((row) => row.groupMain)?.productId || group.main_product_id || groupRows[0].productId;
    await db.query(
      `UPDATE used_smartphone_product_groups
       SET main_product_id = $1, label = $2, active = TRUE, updated_by = $3, updated_at = NOW()
       WHERE id = $4`,
      [selectedMain, label, actorId, group.id]
    );
  }
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
             incoming_count, price_uah, publication_status, slug, brand_id,
             short_description, body_condition, display_condition, battery_health,
             warranty, included_accessories, internal_notes, condition_grade,
             technician_name, inspection_date, purchase_price_uah, accounting_status,
             imei_serial, created_by, updated_by
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, 'DRAFT', $8, $9,
             $10, $11, $12, $13, $14, $15, $16, $17,
             $18, $19, $20, $21, $22, $23, $23
           )
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
            row.brandProvided ? row.brandId : null,
            row.textFields.shortDescription.value,
            row.textFields.bodyCondition.value,
            row.textFields.displayCondition.value,
            row.textFields.batteryHealth.value,
            row.textFields.warranty.value,
            row.textFields.includedAccessories.value,
            row.textFields.internalNotes.value,
            row.textFields.conditionGrade.value,
            row.textFields.technicianName.value,
            row.inspectionDate.value,
            row.purchasePriceUah.value,
            row.textFields.accountingStatus.value,
            row.textFields.imeiSerial.value,
            actorId
          ]
        );
        committed.productId = created.rows[0].id;
        committed.productCode = created.rows[0].product_code;
        committed.result = 'created';
        await applyImportCharacteristics(db, committed.productId, row, actorId);
        await saveImportIdentityKeys(db, committed.productId, {
          ...row,
          productCode: committed.productCode,
          template: row.template,
          finalCharacteristicValues: row.finalCharacteristicValues
        });
        await logCatalogAudit(db, {
          productId: committed.productId,
          actorId,
          action: 'import_create',
          changes: { stockCount: row.stockCount, incomingCount: row.incomingCount, priceUah: row.priceUah }
        });
      } else if (row.action === 'update') {
        await db.query(
          `UPDATE used_smartphone_products
           SET name = $1,
               normalized_name = $2,
               condition = $3,
               stock_count = $4,
               incoming_count = $5,
               price_uah = $6,
               brand_id = CASE WHEN $7 THEN $8 ELSE brand_id END,
               short_description = CASE WHEN $9 THEN $10 ELSE short_description END,
               body_condition = CASE WHEN $11 THEN $12 ELSE body_condition END,
               display_condition = CASE WHEN $13 THEN $14 ELSE display_condition END,
               battery_health = CASE WHEN $15 THEN $16 ELSE battery_health END,
               warranty = CASE WHEN $17 THEN $18 ELSE warranty END,
               included_accessories = CASE WHEN $19 THEN $20 ELSE included_accessories END,
               internal_notes = CASE WHEN $21 THEN $22 ELSE internal_notes END,
               condition_grade = CASE WHEN $23 THEN $24 ELSE condition_grade END,
               technician_name = CASE WHEN $25 THEN $26 ELSE technician_name END,
               inspection_date = CASE WHEN $27 THEN $28::DATE ELSE inspection_date END,
               purchase_price_uah = CASE WHEN $29 THEN $30 ELSE purchase_price_uah END,
               accounting_status = CASE WHEN $31 THEN $32 ELSE accounting_status END,
               imei_serial = CASE WHEN $33 THEN $34 ELSE imei_serial END,
               updated_by = $35,
               updated_at = NOW(),
               version = version + 1
           WHERE id = $36`,
          [
            row.name,
            row.normalizedName,
            row.condition,
            row.stockCount,
            row.incomingCount,
            row.priceUah,
            row.brandProvided,
            row.brandId,
            row.textFields.shortDescription.provided,
            row.textFields.shortDescription.value,
            row.textFields.bodyCondition.provided,
            row.textFields.bodyCondition.value,
            row.textFields.displayCondition.provided,
            row.textFields.displayCondition.value,
            row.textFields.batteryHealth.provided,
            row.textFields.batteryHealth.value,
            row.textFields.warranty.provided,
            row.textFields.warranty.value,
            row.textFields.includedAccessories.provided,
            row.textFields.includedAccessories.value,
            row.textFields.internalNotes.provided,
            row.textFields.internalNotes.value,
            row.textFields.conditionGrade.provided,
            row.textFields.conditionGrade.value,
            row.textFields.technicianName.provided,
            row.textFields.technicianName.value,
            row.inspectionDate.provided,
            row.inspectionDate.value,
            row.purchasePriceUah.provided,
            row.purchasePriceUah.value,
            row.textFields.accountingStatus.provided,
            row.textFields.accountingStatus.value,
            row.textFields.imeiSerial.provided,
            row.textFields.imeiSerial.value,
            actorId,
            row.productId
          ]
        );
        await applyImportCharacteristics(db, row.productId, row, actorId);
        await saveImportIdentityKeys(db, row.productId, row);
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
         name, condition, stock_count, incoming_count, price_uah,
         identity_key, brand_id, template_id, payload
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::JSONB)`,
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
        committed.priceUah,
        committed.identityKey || '',
        committed.brandId || null,
        committed.templateId || null,
        JSON.stringify({
          brandLabel: committed.brandLabel || '',
          templateLabel: committed.templateLabel || '',
          characteristics: committed.characteristics || {},
          groupLabel: committed.groupLabel || '',
          groupMain: committed.groupMain === true
        })
      ]
    );
    committedRows.push(committed);
  }

  await syncImportedGroups(db, committedRows, actorId);

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
