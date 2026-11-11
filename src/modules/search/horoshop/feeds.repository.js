import { pool as defaultPool } from '../../../db/pool.js';
import { AppError } from '../../../lib/app-error.js';
import { HoroshopCatalogRepository } from './catalog.repository.js';
import { maximumFeedSelection, marketplaceNames, feedState } from './feeds.domain.js';

function objectValue(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  try { return JSON.parse(value || '{}'); } catch { return {}; }
}

function arrayValue(value) {
  if (Array.isArray(value)) return value;
  try { return JSON.parse(value || '[]'); } catch { return []; }
}

function titleOf(titles, fallback) {
  const source = objectValue(titles);
  return String(source.uk || source.ua || source.ru || source.en || Object.values(source)[0] || fallback || '').trim();
}

function itemFromRow(row) {
  return {
    id: row.id, productId: row.product_id, externalId: row.external_id,
    article: row.article, title: row.title, articles: arrayValue(row.articles),
    before: arrayValue(row.before_value), target: arrayValue(row.target_value),
    resolvedBefore: row.resolved_before == null ? null : arrayValue(row.resolved_before),
    resolvedTarget: row.resolved_target == null ? null : arrayValue(row.resolved_target),
    observed: row.observed_value === null ? null : arrayValue(row.observed_value),
    status: row.status, message: row.message
  };
}

export function countFeedItems(items) {
  return items.reduce((counts, item) => {
    counts[item.status] = (counts[item.status] || 0) + 1;
    return counts;
  }, {});
}

export class HoroshopFeedRepository {
  constructor(pool = defaultPool) {
    this.pool = pool;
    this.catalogRepository = new HoroshopCatalogRepository(pool);
  }

  async connection({ readOnly = false } = {}) {
    const connection = await this.catalogRepository.getConnection();
    if (!connection) throw new AppError(409, 'HOROSHOP_NOT_CONNECTED', 'Спочатку підключіть магазин Хорошоп.');
    if (!readOnly && connection.status !== 'connected') {
      throw new AppError(409, 'HOROSHOP_CONNECTION_NOT_READY', 'Дочекайтеся завершення синхронізації каталогу Хорошоп.');
    }
    return connection;
  }

  predicate(connection, filters = {}, scopeIds = null) {
    const values = [connection.id, connection.generation];
    const clauses = ['product.connection_id = $1', 'product.generation = $2', 'product.active = TRUE'];
    const add = (value) => { values.push(value); return `$${values.length}`; };
    if (scopeIds !== null) {
      const uniqueIds = [...new Set(scopeIds)];
      clauses.push(uniqueIds.length
        ? `product.id IN (${uniqueIds.map((id) => add(id)).join(', ')})`
        : 'FALSE');
    }
    if (filters.category) clauses.push(`product.category_external_id = ${add(filters.category)}`);
    if (filters.brands?.length) {
      const matches = filters.brands.map((brand) => add(brand.toLocaleLowerCase('uk-UA')));
      clauses.push(`LOWER(COALESCE(product.brand, '')) IN (${matches.join(', ')})`);
    }
    if (filters.availability) {
      const match = add(filters.availability.toLocaleLowerCase('uk-UA'));
      clauses.push(`(LOWER(COALESCE(product.availability, '')) = ${match} OR EXISTS (
        SELECT 1 FROM search_horoshop_modifications AS modification
        WHERE modification.product_id = product.id AND modification.connection_id = $1
          AND modification.generation = $2 AND modification.active = TRUE
          AND LOWER(COALESCE(modification.availability, '')) = ${match}))`);
    }
    if (filters.search) {
      const match = add(`%${filters.search.toLocaleLowerCase('uk-UA')}%`);
      clauses.push(`(LOWER(COALESCE(product.sku, '')) LIKE ${match}
        OR LOWER(product.titles::text) LIKE ${match}
        OR EXISTS (SELECT 1 FROM search_horoshop_modifications AS modification
          WHERE modification.product_id = product.id AND modification.connection_id = $1
            AND modification.generation = $2 AND modification.active = TRUE
            AND (LOWER(COALESCE(modification.sku, '')) LIKE ${match}
              OR LOWER(modification.titles::text) LIKE ${match})))`);
    }
    return { values, where: clauses.join(' AND ') };
  }

  async facets(connection) {
    const values = [connection.id, connection.generation];
    const [categories, brands, availability] = await Promise.all([
      this.pool.query(`SELECT external_id, titles FROM search_horoshop_categories
        WHERE connection_id = $1 AND generation = $2 AND active = TRUE ORDER BY titles::text`, values),
      this.pool.query(`SELECT DISTINCT brand FROM search_horoshop_products
        WHERE connection_id = $1 AND generation = $2 AND active = TRUE AND brand IS NOT NULL AND brand <> ''
        ORDER BY brand`, values),
      this.pool.query(`SELECT DISTINCT availability FROM (
        SELECT availability FROM search_horoshop_products WHERE connection_id = $1 AND generation = $2 AND active = TRUE
        UNION SELECT availability FROM search_horoshop_modifications WHERE connection_id = $1 AND generation = $2 AND active = TRUE
      ) AS statuses WHERE availability IS NOT NULL AND availability <> '' ORDER BY availability`, values)
    ]);
    return {
      categories: categories.rows.map((row) => ({ externalId: row.external_id, title: titleOf(row.titles, row.external_id) })),
      brands: brands.rows.map((row) => row.brand),
      availabilityOptions: availability.rows.map((row) => row.availability)
    };
  }

  async catalog(connection, filters = {}, page = 1, pageSize = 25) {
    const { values, where } = this.predicate(connection, filters);
    const [count, rows, facets] = await Promise.all([
      this.pool.query(`SELECT COUNT(*)::integer AS total FROM search_horoshop_products AS product WHERE ${where}`, values),
      this.pool.query(`SELECT product.id FROM search_horoshop_products AS product WHERE ${where}
        ORDER BY product.sku, product.id LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pageSize, (page - 1) * pageSize]),
      this.facets(connection)
    ]);
    const ids = rows.rows.map((row) => row.id);
    const products = await this.productsByIds(connection, ids);
    const byId = new Map(products.map((product) => [product.id, product]));
    const total = Number(count.rows[0]?.total || 0);
    return {
      items: ids.map((id) => byId.get(id)).filter(Boolean), ...facets,
      total, page, pageSize, pageCount: Math.ceil(total / pageSize)
    };
  }

  async catalogSelection(connection, productIds, filters = {}, page = 1, pageSize = 25) {
    const { values, where } = this.predicate(connection, filters, productIds);
    const [rows, facets] = await Promise.all([
      this.pool.query(`SELECT product.id FROM search_horoshop_products AS product WHERE ${where}
        ORDER BY product.sku, product.id`, values),
      this.facets(connection)
    ]);
    const matchingProductIds = rows.rows.map((row) => row.id);
    const ids = matchingProductIds.slice((page - 1) * pageSize, page * pageSize);
    return {
      items: await this.productsByIds(connection, ids), ...facets,
      matchingProductIds, total: matchingProductIds.length, page, pageSize,
      pageCount: Math.ceil(matchingProductIds.length / pageSize)
    };
  }

  async selectedIds(connection, filters, scopeIds = null) {
    const { values, where } = this.predicate(connection, filters, scopeIds);
    const result = await this.pool.query(`SELECT product.id FROM search_horoshop_products AS product
      WHERE ${where} ORDER BY product.sku, product.id LIMIT ${maximumFeedSelection + 1}`, values);
    if (result.rows.length > maximumFeedSelection) {
      throw new AppError(422, 'HOROSHOP_FEEDS_SELECTION_LIMIT', `За один раз можна змінити не більш ніж ${maximumFeedSelection} товарів.`);
    }
    return result.rows.map((row) => row.id);
  }

  async productsByIds(connection, ids) {
    if (!ids.length) return [];
    const products = [];
    const modifications = [];
    for (let offset = 0; offset < ids.length; offset += 500) {
      const batch = ids.slice(offset, offset + 500);
      const values = [connection.id, connection.generation, ...batch];
      const matches = batch.map((_, index) => `$${index + 3}`).join(', ');
      const [parents, children] = await Promise.all([
        this.pool.query(`SELECT id, external_id, sku, titles, brand, category_external_id, availability,
          source_data, primary_image_url, canonical_url FROM search_horoshop_products
          WHERE connection_id = $1 AND generation = $2 AND active = TRUE AND id IN (${matches})`, values),
        this.pool.query(`SELECT id, product_id, sku, titles, source_data FROM search_horoshop_modifications
          WHERE connection_id = $1 AND generation = $2 AND active = TRUE AND product_id IN (${matches})
          ORDER BY sku, id`, values)
      ]);
      products.push(...parents.rows);
      modifications.push(...children.rows);
    }
    const byProduct = new Map();
    for (const row of modifications) {
      const list = byProduct.get(row.product_id) || [];
      const source = objectValue(row.source_data);
      list.push({ id: row.id, sku: row.sku, titles: objectValue(row.titles),
        inheritsMarketplaces: !Object.hasOwn(source, 'export_to_marketplace'),
        marketplaces: marketplaceNames(source.export_to_marketplace) });
      byProduct.set(row.product_id, list);
    }
    const byId = new Map(products.map((row) => [row.id, {
      id: row.id, externalId: row.external_id, sku: row.sku, titles: objectValue(row.titles),
      title: titleOf(row.titles, row.sku), brand: row.brand, categoryExternalId: row.category_external_id,
      availability: row.availability, marketplaces: marketplaceNames(objectValue(row.source_data).export_to_marketplace),
      imageUrl: row.primary_image_url, pageUrl: row.canonical_url,
      modifications: byProduct.get(row.id) || []
    }]));
    return ids.map((id) => byId.get(id)).filter(Boolean).map((product) => {
      const offers = product.modifications.length ? product.modifications.map((offer) => ({
        ...offer, marketplaces: offer.inheritsMarketplaces ? product.marketplaces : offer.marketplaces
      })) : [{ marketplaces: product.marketplaces }];
      return { ...product, modifications: product.modifications.map((offer) => ({
        id: offer.id, sku: offer.sku, titles: offer.titles,
        marketplaces: offer.inheritsMarketplaces ? product.marketplaces : offer.marketplaces
      })), google: feedState(offers, 'google'), facebook: feedState(offers, 'facebook') };
    });
  }

  async allProductsForResolve(connection) {
    const [products, modifications] = await Promise.all([
      this.pool.query(`SELECT id, sku, titles FROM search_horoshop_products
        WHERE connection_id = $1 AND generation = $2 AND active = TRUE ORDER BY sku, id`,
      [connection.id, connection.generation]),
      this.pool.query(`SELECT product_id, sku, titles FROM search_horoshop_modifications
        WHERE connection_id = $1 AND generation = $2 AND active = TRUE`, [connection.id, connection.generation])
    ]);
    const byProduct = new Map();
    for (const row of modifications.rows) {
      const offers = byProduct.get(row.product_id) || [];
      offers.push({ sku: row.sku, titles: objectValue(row.titles) });
      byProduct.set(row.product_id, offers);
    }
    return products.rows.map((row) => ({ id: row.id, sku: row.sku,
      titles: objectValue(row.titles), modifications: byProduct.get(row.id) || [] }));
  }

  async createDraft(connection, actorId, action, items) {
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      const created = await db.query(`INSERT INTO search_horoshop_feed_operations
        (connection_id, generation, actor_user_id, action)
        VALUES ($1, $2, $3, $4::jsonb) RETURNING id`,
      [connection.id, connection.generation, actorId, JSON.stringify(action)]);
      const id = created.rows[0].id;
      for (let offset = 0; offset < items.length; offset += 100) {
        const batch = items.slice(offset, offset + 100);
        const values = [];
        const rows = batch.map((item) => {
          const start = values.length + 1;
          values.push(id, item.productId, item.externalId, item.article,
            item.title, JSON.stringify(item.articles), JSON.stringify(item.before), JSON.stringify(item.target));
          return `($${start}, $${start + 1}, $${start + 2}, $${start + 3}, $${start + 4}, $${start + 5}::jsonb, $${start + 6}::jsonb, $${start + 7}::jsonb)`;
        });
        await db.query(`INSERT INTO search_horoshop_feed_operation_items
          (operation_id, product_id, external_id, article, title, articles, before_value, target_value)
          VALUES ${rows.join(', ')}`, values);
      }
      await db.query('COMMIT');
      return this.operation(id, connection);
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally { db.release(); }
  }

  async operation(id, connection) {
    const operation = await this.pool.query(`SELECT * FROM search_horoshop_feed_operations
      WHERE id = $1 AND connection_id = $2 AND generation = $3`, [id, connection.id, connection.generation]);
    if (!operation.rows[0]) throw new AppError(404, 'HOROSHOP_FEEDS_OPERATION_NOT_FOUND', 'Операцію не знайдено.');
    const items = await this.pool.query(`SELECT * FROM search_horoshop_feed_operation_items
      WHERE operation_id = $1 ORDER BY article, id`, [id]);
    const row = operation.rows[0];
    const mapped = items.rows.map(itemFromRow);
    return {
      id: row.id, action: objectValue(row.action), status: row.status,
      errorMessage: row.error_message, actorUserId: row.actor_user_id,
      createdAt: row.created_at, startedAt: row.started_at, completedAt: row.completed_at,
      counts: countFeedItems(mapped), total: mapped.length, items: mapped
    };
  }

  async history(connection) {
    const result = await this.pool.query(`SELECT * FROM search_horoshop_feed_operations
      WHERE connection_id = $1 AND generation = $2 AND status <> 'draft'
      ORDER BY created_at DESC LIMIT 50`,
    [connection.id, connection.generation]);
    if (!result.rows.length) return [];
    const ids = result.rows.map((row) => row.id);
    const totals = await this.pool.query(`SELECT operation_id, status, COUNT(*)::integer AS total
      FROM search_horoshop_feed_operation_items
      WHERE operation_id IN (${ids.map((_, index) => `$${index + 1}`).join(', ')}) GROUP BY operation_id, status`, ids);
    const byId = new Map();
    for (const row of totals.rows) {
      const counts = byId.get(row.operation_id) || { total: 0, confirmed: 0, problems: 0 };
      const count = Number(row.total);
      counts.total += count;
      if (['succeeded', 'unchanged'].includes(row.status)) counts.confirmed += count;
      if (['failed', 'conflict'].includes(row.status)) counts.problems += count;
      byId.set(row.operation_id, counts);
    }
    return result.rows.map((row) => ({
      id: row.id, action: objectValue(row.action), status: row.status,
      actorUserId: row.actor_user_id, createdAt: row.created_at, startedAt: row.started_at,
      completedAt: row.completed_at, total: byId.get(row.id)?.total || 0,
      confirmed: byId.get(row.id)?.confirmed || 0, problems: byId.get(row.id)?.problems || 0
    }));
  }

  async queue(id, connection) {
    const result = await this.pool.query(`UPDATE search_horoshop_feed_operations SET status = 'queued'
      WHERE id = $1 AND connection_id = $2 AND generation = $3 AND status = 'draft'
        AND created_at > NOW() - INTERVAL '1 hour' RETURNING id`, [id, connection.id, connection.generation]);
    if (!result.rows[0]) throw new AppError(409, 'HOROSHOP_FEEDS_PREVIEW_STALE', 'Перегляд застарів або операцію вже запущено. Створіть новий перегляд.');
  }

  async setItem(id, status, message = '', observed = null) {
    await this.pool.query(`UPDATE search_horoshop_feed_operation_items
      SET status = $2, message = $3, observed_value = $4::jsonb, updated_at = NOW() WHERE id = $1`,
    [id, status, message, observed === null ? null : JSON.stringify(observed)]);
  }

  async resolveItem(id, before, target) {
    await this.pool.query(`UPDATE search_horoshop_feed_operation_items
      SET resolved_before = $2::jsonb, resolved_target = $3::jsonb, updated_at = NOW()
      WHERE id = $1 AND status = 'pending'`, [id, JSON.stringify(before), JSON.stringify(target)]);
  }

  async finish(id, status, message = '') {
    await this.pool.query(`UPDATE search_horoshop_feed_operations
      SET status = $2, error_message = $3, completed_at = NOW() WHERE id = $1`, [id, status, message]);
  }

  async cacheFeeds(connection, item) {
    const rows = await this.pool.query(`SELECT id, sku, source_data FROM search_horoshop_products
      WHERE connection_id = $1 AND generation = $2 AND id = $3`,
    [connection.id, connection.generation, item.productId]);
    const targets = new Map(item.target.map((offer) => [offer.article, offer.marketplaces.join(';')]));
    const patch = (source, sku) => {
      const value = { ...objectValue(source) };
      if (targets.has(sku)) value.export_to_marketplace = targets.get(sku);
      for (const key of ['modifications', 'variants']) {
        if (Array.isArray(value[key])) value[key] = value[key].map((offer) => patch(offer, String(offer.article ?? offer.sku ?? '')));
      }
      return value;
    };
    for (const row of rows.rows) await this.pool.query(`UPDATE search_horoshop_products
      SET source_data = $2::jsonb, updated_at = NOW() WHERE id = $1`,
    [row.id, JSON.stringify(patch(row.source_data, row.sku))]);
    const children = await this.pool.query(`SELECT id, sku, source_data FROM search_horoshop_modifications
      WHERE connection_id = $1 AND generation = $2 AND product_id = $3 AND active = TRUE`,
    [connection.id, connection.generation, item.productId]);
    for (const row of children.rows) if (targets.has(row.sku)) await this.pool.query(`UPDATE search_horoshop_modifications
      SET source_data = $2::jsonb, updated_at = NOW() WHERE id = $1`,
    [row.id, JSON.stringify(patch(row.source_data, row.sku))]);
  }
}
