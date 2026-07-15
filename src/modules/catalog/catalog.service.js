import { query } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import { getUserToolAccess } from '../access/access.service.js';
import { cleanText, cleanUrl } from '../applications/application.service.js';

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

export function serializeCatalogProduct(row, { publicOnly = false } = {}) {
  const availability = availabilityForCounts(row.stock_count, row.incoming_count);
  const base = {
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
    updatedAt: row.updated_at
  };
  if (publicOnly) return base;
  return {
    ...base,
    normalizedName: row.normalized_name,
    internalNotes: row.internal_notes || '',
    createdBy: row.created_by ? { id: row.created_by, name: row.created_by_name || '' } : null,
    updatedBy: row.updated_by ? { id: row.updated_by, name: row.updated_by_name || '' } : null
  };
}

export async function loadCatalogProduct(productId, db = { query }) {
  const result = await db.query(`${productSelect} WHERE product.id = $1`, [productId]);
  const row = result.rows[0];
  return row ? serializeCatalogProduct(row) : null;
}

export async function loadPublicProduct(identifier, db = { query }) {
  const result = await db.query(
    `${productSelect}
     WHERE product.publication_status = 'PUBLISHED'
       AND (product.slug = $1 OR lower(product.product_code) = lower($1))
     LIMIT 1`,
    [identifier]
  );
  const row = result.rows[0];
  return row ? serializeCatalogProduct(row, { publicOnly: true }) : null;
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
    externalProductId: product.id,
    domain: context.domain || '',
    id: product.id,
    condition: product.condition,
    conditionLabel: product.conditionLabel,
    source: 'storefront_catalog',
    preview: context.preview === true
  };
}
