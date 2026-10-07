import { pool as defaultPool } from '../../../db/pool.js';
import { AppError } from '../../../lib/app-error.js';
import { HoroshopCatalogRepository } from './catalog.repository.js';
import { maximumPopularitySelection } from './popularity.domain.js';

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
    before: row.before_value, target: row.target_value, observed: row.observed_value,
    status: row.status, message: row.message
  };
}

export function countPopularityItems(items) {
  return items.reduce((counts, item) => {
    counts[item.status] = (counts[item.status] || 0) + 1;
    return counts;
  }, {});
}

export class HoroshopPopularityRepository {
  constructor(pool = defaultPool) {
    this.pool = pool;
    this.catalogRepository = new HoroshopCatalogRepository(pool);
  }

  async connection() {
    const connection = await this.catalogRepository.getConnection();
    if (!connection) throw new AppError(409, 'HOROSHOP_NOT_CONNECTED', 'Спочатку підключіть магазин Хорошоп.');
    if (connection.status !== 'connected') {
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
    if (filters.popularity !== 'all') {
      const number = `CASE WHEN product.popularity = '' THEN 0 ELSE COALESCE(product.popularity::numeric, 0) END`;
      if (filters.popularity === 'zero') clauses.push(`(${number}) = 0`);
      if (filters.popularity === 'positive') clauses.push(`(${number}) > 0`);
      if (filters.popularity === 'range') {
        clauses.push(`(${number}) >= ${add(filters.popularityMin)}`);
        clauses.push(`(${number}) <= ${add(filters.popularityMax)}`);
      }
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
    const [categories, brands, availability, popularity] = await Promise.all([
      this.pool.query(`SELECT external_id, titles FROM search_horoshop_categories
        WHERE connection_id = $1 AND generation = $2 AND active = TRUE ORDER BY titles::text`, values),
      this.pool.query(`SELECT DISTINCT brand FROM search_horoshop_products
        WHERE connection_id = $1 AND generation = $2 AND active = TRUE AND brand IS NOT NULL AND brand <> ''
        ORDER BY brand`, values),
      this.pool.query(`SELECT DISTINCT availability FROM (
        SELECT availability FROM search_horoshop_products WHERE connection_id = $1 AND generation = $2 AND active = TRUE
        UNION SELECT availability FROM search_horoshop_modifications WHERE connection_id = $1 AND generation = $2 AND active = TRUE
      ) AS statuses WHERE availability IS NOT NULL AND availability <> '' ORDER BY availability`, values),
      this.pool.query(`SELECT MAX(CASE WHEN popularity = '' THEN 0 ELSE COALESCE(popularity::numeric, 0) END) AS maximum
        FROM search_horoshop_products WHERE connection_id = $1 AND generation = $2 AND active = TRUE`, values)
    ]);
    return {
      categories: categories.rows.map((row) => ({ externalId: row.external_id, title: titleOf(row.titles, row.external_id) })),
      brands: brands.rows.map((row) => row.brand),
      availabilityOptions: availability.rows.map((row) => row.availability),
      maximumPopularity: Math.max(0, Number(popularity.rows[0]?.maximum || 0))
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

  async selectedIds(connection, filters) {
    const { values, where } = this.predicate(connection, filters);
    const result = await this.pool.query(`SELECT product.id FROM search_horoshop_products AS product
      WHERE ${where} ORDER BY product.sku, product.id LIMIT ${maximumPopularitySelection + 1}`, values);
    if (result.rows.length > maximumPopularitySelection) {
      throw new AppError(422, 'HOROSHOP_POPULARITY_SELECTION_LIMIT', `За один раз можна змінити не більш ніж ${maximumPopularitySelection} товарів.`);
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
          popularity, primary_image_url, canonical_url FROM search_horoshop_products
          WHERE connection_id = $1 AND generation = $2 AND active = TRUE AND id IN (${matches})`, values),
        this.pool.query(`SELECT id, product_id, sku, titles FROM search_horoshop_modifications
          WHERE connection_id = $1 AND generation = $2 AND active = TRUE AND product_id IN (${matches})
          ORDER BY sku, id`, values)
      ]);
      products.push(...parents.rows);
      modifications.push(...children.rows);
    }
    const byProduct = new Map();
    for (const row of modifications) {
      const list = byProduct.get(row.product_id) || [];
      list.push({ id: row.id, sku: row.sku, titles: objectValue(row.titles) });
      byProduct.set(row.product_id, list);
    }
    const byId = new Map(products.map((row) => [row.id, {
      id: row.id, externalId: row.external_id, sku: row.sku, titles: objectValue(row.titles),
      title: titleOf(row.titles, row.sku), brand: row.brand, categoryExternalId: row.category_external_id,
      availability: row.availability, popularity: row.popularity,
      imageUrl: row.primary_image_url, pageUrl: row.canonical_url,
      modifications: byProduct.get(row.id) || []
    }]));
    return ids.map((id) => byId.get(id)).filter(Boolean);
  }

  async allProductsForResolve(connection) {
    const result = await this.pool.query(`SELECT id FROM search_horoshop_products
      WHERE connection_id = $1 AND generation = $2 AND active = TRUE ORDER BY sku, id`,
    [connection.id, connection.generation]);
    return this.productsByIds(connection, result.rows.map((row) => row.id));
  }

  async createDraft(connection, actorId, action, actionValue, items) {
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      const created = await db.query(`INSERT INTO search_horoshop_popularity_operations
        (connection_id, generation, actor_user_id, action, action_value)
        VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [connection.id, connection.generation, actorId, action, actionValue]);
      const id = created.rows[0].id;
      for (let offset = 0; offset < items.length; offset += 100) {
        const batch = items.slice(offset, offset + 100);
        const values = [];
        const rows = batch.map((item) => {
          const start = values.length + 1;
          values.push(id, item.productId, item.externalId, item.article,
            item.title, JSON.stringify(item.articles), item.before, item.target);
          return `($${start}, $${start + 1}, $${start + 2}, $${start + 3}, $${start + 4}, $${start + 5}::jsonb, $${start + 6}, $${start + 7})`;
        });
        await db.query(`INSERT INTO search_horoshop_popularity_operation_items
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
    const operation = await this.pool.query(`SELECT * FROM search_horoshop_popularity_operations
      WHERE id = $1 AND connection_id = $2 AND generation = $3`, [id, connection.id, connection.generation]);
    if (!operation.rows[0]) throw new AppError(404, 'HOROSHOP_POPULARITY_OPERATION_NOT_FOUND', 'Операцію не знайдено.');
    const items = await this.pool.query(`SELECT * FROM search_horoshop_popularity_operation_items
      WHERE operation_id = $1 ORDER BY article, id`, [id]);
    const row = operation.rows[0];
    const mapped = items.rows.map(itemFromRow);
    return {
      id: row.id, action: row.action, value: row.action_value, status: row.status,
      errorMessage: row.error_message, actorUserId: row.actor_user_id,
      createdAt: row.created_at, startedAt: row.started_at, completedAt: row.completed_at,
      counts: countPopularityItems(mapped), total: mapped.length, items: mapped
    };
  }

  async history(connection) {
    const result = await this.pool.query(`SELECT operation.id, operation.action, operation.action_value,
      operation.status, operation.actor_user_id, operation.created_at, operation.started_at,
      operation.completed_at, COUNT(item.id)::integer AS total,
      COUNT(item.id) FILTER (WHERE item.status IN ('succeeded', 'unchanged'))::integer AS confirmed,
      COUNT(item.id) FILTER (WHERE item.status IN ('failed', 'conflict'))::integer AS problems
      FROM search_horoshop_popularity_operations AS operation
      LEFT JOIN search_horoshop_popularity_operation_items AS item ON item.operation_id = operation.id
      WHERE operation.connection_id = $1 AND operation.generation = $2 AND operation.status <> 'draft'
      GROUP BY operation.id ORDER BY operation.created_at DESC LIMIT 50`,
    [connection.id, connection.generation]);
    return result.rows.map((row) => ({
      id: row.id, action: row.action, value: row.action_value, status: row.status,
      actorUserId: row.actor_user_id, createdAt: row.created_at, startedAt: row.started_at,
      completedAt: row.completed_at, total: row.total, confirmed: row.confirmed, problems: row.problems
    }));
  }

  async queue(id, connection) {
    const result = await this.pool.query(`UPDATE search_horoshop_popularity_operations SET status = 'queued'
      WHERE id = $1 AND connection_id = $2 AND generation = $3 AND status = 'draft'
        AND created_at > NOW() - INTERVAL '1 hour' RETURNING id`, [id, connection.id, connection.generation]);
    if (!result.rows[0]) throw new AppError(409, 'HOROSHOP_POPULARITY_PREVIEW_STALE', 'Перегляд застарів або операцію вже запущено. Створіть новий перегляд.');
  }

  async setItem(id, status, message = '', observed = null) {
    await this.pool.query(`UPDATE search_horoshop_popularity_operation_items
      SET status = $2, message = $3, observed_value = $4, updated_at = NOW() WHERE id = $1`,
    [id, status, message, observed]);
  }

  async finish(id, status, message = '') {
    await this.pool.query(`UPDATE search_horoshop_popularity_operations
      SET status = $2, error_message = $3, completed_at = NOW() WHERE id = $1`, [id, status, message]);
  }

  async cachePopularity(connection, item) {
    await this.pool.query(`UPDATE search_horoshop_products
      SET popularity = $4, updated_at = NOW()
      WHERE connection_id = $1 AND generation = $2 AND id = $3`,
    [connection.id, connection.generation, item.productId, String(item.target)]);
  }
}
