import { pool } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import { HoroshopCatalogRepository } from '../search/horoshop/catalog.repository.js';
import { resolveStickerEntries, titleFor } from '../search/horoshop/sticker.domain.js';
import { offerFromRow } from './product-selection.service.js';

const catalog = new HoroshopCatalogRepository();
const notFound = () => new AppError(404, 'CAMPAIGN_NOT_FOUND', 'Тематичну акцію не знайдено.');
const staleCatalog = () => new AppError(409, 'CAMPAIGN_CATALOG_CHANGED', 'Каталог змінився. Перевірте склад акції.');
const staleRevision = () => new AppError(409, 'CAMPAIGN_CHANGED', 'Акцію вже змінено. Відкрийте її повторно.');
const summary = (row) => ({ id: row.id, publicId: row.public_id, name: row.name, revision: row.revision });

export async function resolveCampaignList(entries) {
  const connection = await catalog.getConnection();
  if (!connection || !['connected', 'syncing'].includes(connection.status)) {
    throw new AppError(409, 'HOROSHOP_NOT_READY', 'Підключіть Хорошоп і синхронізуйте каталог.');
  }
  const [products, categories] = await Promise.all([
    catalog.allProductsForResolve(connection),
    pool.query(`SELECT external_id, titles FROM search_horoshop_categories
      WHERE connection_id = $1 AND generation = $2 AND active = TRUE`, [connection.id, connection.generation])
  ]);
  const result = resolveStickerEntries(entries, products);
  const byId = new Map(products.map((product) => [product.id, product]));
  const categoryNames = new Map(categories.rows.map((category) => [category.external_id, titleFor(category.titles, category.external_id)]));
  function describe(id) {
    const product = byId.get(id);
    const category = product.categoryExternalId || '';
    return { id, sku: product.sku, title: titleFor(product.titles, product.sku),
      category, categoryName: categoryNames.get(category) || category || 'Інші товари' };
  }
  return {
    generation: connection.generation, matched: result.productIds.map(describe),
    duplicates: result.duplicates, unmatched: result.unmatched,
    ambiguous: result.ambiguous.map(({ input, candidates }) => ({ input, candidates: candidates.map(({ id }) => describe(id)) }))
  };
}

export async function listCampaigns(userId) {
  const result = await pool.query('SELECT * FROM thematic_campaigns WHERE user_id = $1 ORDER BY updated_at DESC, id', [userId]);
  return result.rows.map(summary);
}

export async function readCampaign(userId, id) {
  const row = (await pool.query('SELECT * FROM thematic_campaigns WHERE id = $1 AND user_id = $2', [id, userId])).rows[0];
  if (!row) throw notFound();
  const result = await pool.query(`
    SELECT i.product_id, i.section_id, p.sku, p.titles, p.active
    FROM thematic_campaigns c LEFT JOIN thematic_campaign_items i ON i.campaign_id = c.id
    LEFT JOIN search_horoshop_products p ON p.id = i.product_id
    WHERE c.id = $1 AND c.user_id = $2 AND c.revision = $3 ORDER BY i.position`, [id, userId, row.revision]);
  if (!result.rowCount) throw staleRevision();
  const sections = row.sections.map((section) => ({ ...section, products: [] }));
  const byId = new Map(sections.map((section) => [section.id, section]));
  for (const item of result.rows) {
    if (item.product_id) byId.get(item.section_id).products.push({ id: item.product_id, sku: item.sku,
      title: titleFor(item.titles, item.sku), inactive: !item.active });
  }
  return { ...summary(row), generation: row.generation, sections };
}

export async function saveCampaign(userId, id, input) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const connection = (await db.query(`SELECT id FROM search_horoshop_connections
      WHERE generation = $1 AND status IN ('connected','syncing') FOR SHARE`, [input.generation])).rows[0];
    if (!connection) throw staleCatalog();
    const metadata = input.sections.map(({ id, name, categories }) => ({ id, name, categories }));
    const values = [userId, connection.id, input.generation, input.name, JSON.stringify(metadata)];
    const saved = id
      ? await db.query(`UPDATE thematic_campaigns SET name = $4, sections = $5::jsonb, revision = revision + 1, updated_at = NOW()
          WHERE user_id = $1 AND connection_id = $2 AND generation = $3 AND id = $6 AND revision = $7 RETURNING *`,
        [...values, id, input.revision])
      : await db.query(`INSERT INTO thematic_campaigns(user_id, connection_id, generation, name, sections)
          VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING *`, values);
    if (!saved.rowCount) throw staleRevision();
    const campaign = saved.rows[0];
    const items = input.sections.flatMap((section) => section.productIds.map((productId) => ({ productId, sectionId: section.id })));
    if (id) await db.query('DELETE FROM thematic_campaign_items WHERE campaign_id = $1', [id]);
    for (let offset = 0; offset < items.length; offset += 400) {
      const batch = items.slice(offset, offset + 400);
      const ids = batch.map((item) => item.productId);
      const placeholders = ids.map((_, index) => '$' + (index + 3));
      const valid = await db.query(`SELECT id FROM search_horoshop_products WHERE connection_id = $1
        AND generation = $2 AND active = TRUE AND id IN (${placeholders.join(',')}) FOR SHARE`, [connection.id, input.generation, ...ids]);
      if (valid.rowCount !== batch.length) throw staleCatalog();
      const params = [campaign.id];
      const tuples = batch.map((item, index) => {
        const start = params.length + 1;
        params.push(item.productId, item.sectionId, offset + index);
        return `($1, $${start}, $${start + 1}, $${start + 2})`;
      });
      await db.query(`INSERT INTO thematic_campaign_items(campaign_id, product_id, section_id, position) VALUES ${tuples.join(',')}`, params);
    }
    await db.query('COMMIT');
    return summary(campaign);
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally { db.release(); }
}

export async function removeCampaign(userId, id, revision) {
  const result = await pool.query('DELETE FROM thematic_campaigns WHERE id = $1 AND user_id = $2 AND revision = $3', [id, userId, revision]);
  if (!result.rowCount) throw staleRevision();
}

const publicJoin = `FROM thematic_campaigns c JOIN search_horoshop_connections h
  ON h.id = c.connection_id AND h.generation = c.generation AND h.status IN ('connected','syncing')`;
const publicItems = `JOIN thematic_campaign_items i ON i.campaign_id = c.id
  JOIN search_horoshop_products p ON p.id = i.product_id AND p.connection_id = h.id AND p.generation = h.generation
  AND p.active = TRUE AND p.visible = TRUE AND p.price <> '' AND p.canonical_url <> '' AND p.primary_image_url <> ''`;

export async function publicCampaign(publicId) {
  const header = await pool.query(`SELECT c.name, c.sections, c.revision ${publicJoin} WHERE c.public_id = $1`, [publicId]);
  const row = header.rows[0];
  if (!row) throw notFound();
  const totals = await pool.query(`SELECT i.section_id, p.brand, COUNT(*) AS total ${publicJoin} ${publicItems}
    WHERE c.public_id = $1 AND c.revision = $2 GROUP BY i.section_id, p.brand ORDER BY p.brand`, [publicId, row.revision]);
  const sections = row.sections.map(({ id, name }) => ({ id, name, count: 0, brands: [] }));
  const byId = new Map(sections.map((section) => [section.id, section]));
  for (const item of totals.rows) {
    const section = byId.get(item.section_id);
    section.count += Number(item.total);
    if (item.brand) section.brands.push(item.brand);
  }
  return { id: publicId, name: row.name, revision: row.revision, sections: sections.filter((section) => section.count) };
}

export async function campaignPage(publicId, { section, cursor, revision, brand = [], q = '' }) {
  const params = [publicId, revision];
  const bind = (value) => '$' + params.push(value);
  const conditions = ['c.public_id = $1', 'c.revision = $2'];
  if (section) conditions.push('i.section_id = ' + bind(section));
  if (brand.length) conditions.push(`LOWER(p.brand) IN (${brand.map(bind).join(', ')})`);
  if (q) {
    const match = bind('%' + q.replace(/[\\%_]/gu, '\\$&') + '%');
    const fields = ['p.sku', 'p.brand', ...['uk', 'ua', 'ru', 'en'].map((lang) => `(p.titles->>'${lang}')`)];
    conditions.push('(' + fields.map((field) => field + ' ILIKE ' + match).join(' OR ') + ')');
  }
  const from = `${publicJoin} ${publicItems} WHERE ${conditions.join(' AND ')}`;
  let total;
  if (cursor === 0 && (q || brand.length)) {
    const count = await pool.query('SELECT COUNT(*) AS total ' + from, params);
    total = Number(count.rows[0].total);
  }
  const result = await pool.query(`SELECT i.position, h.store_domain, p.id AS product_id, p.external_id AS product_external_id,
    p.sku AS product_sku, p.brand, p.titles AS product_titles, p.price AS product_price, p.old_price AS product_old_price,
    p.currency AS product_currency, p.availability AS product_availability, p.primary_image_url, p.canonical_url,
    p.source_data AS product_source_data ${from} AND i.position >= ${bind(cursor)}
    ORDER BY i.position LIMIT 25`, params);
  if (!result.rowCount) {
    const current = await pool.query(`SELECT c.revision ${publicJoin} WHERE c.public_id = $1`, [publicId]);
    if (!current.rowCount) throw notFound();
    if (current.rows[0].revision !== revision) throw staleRevision();
  }
  const products = result.rows.slice(0, 24).map((row) => ({ ...offerFromRow(row), brand: row.brand || '' }))
    .filter((item) => item.imageUrl && item.pageUrl).map((item) => ({
      productExternalId: item.productExternalId, article: item.sku, brand: item.brand, title: item.title || item.sku,
      imageUrl: item.imageUrl, pageUrl: item.pageUrl, price: item.price, oldPrice: item.oldPrice, currency: item.currency,
      available: item.available, availability: item.availability, buyId: item.buyId
    }));
  return { products, nextCursor: result.rows[24]?.position ?? null, total };
}
