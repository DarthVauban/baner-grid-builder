import { randomUUID } from 'node:crypto';
import { pool as defaultPool } from '../../../db/pool.js';
import { AppError } from '../../../lib/app-error.js';
import { HoroshopCatalogRepository } from './catalog.repository.js';
import { manualStickerDirectory, sameStickers, titleFor } from './sticker.domain.js';
import { normalizeHoroshopBrand } from './catalog.normalizer.js';

export const arrayValue = (value) => Array.isArray(value) ? value : JSON.parse(value || '[]');
const objectValue = (value) => typeof value === 'string' ? JSON.parse(value) : value || {};
export const itemFromRow = (row) => ({
  id: row.id, productId: row.product_id, externalId: row.external_id, article: row.article, title: row.title,
  membership: arrayValue(row.membership), before: arrayValue(row.before_stickers), after: arrayValue(row.after_stickers),
  addIds: arrayValue(row.add_ids), removeIds: arrayValue(row.remove_ids), status: row.status, message: row.message
});
export const countItems = (items) => items.reduce((counts, item) => ({ ...counts, [item.status]: (counts[item.status] || 0) + 1 }), {});

export class HoroshopStickerRepository {
  constructor(pool = defaultPool) { this.pool = pool; this.catalogRepository = new HoroshopCatalogRepository(pool); }

  async connection() {
    const connection = await this.catalogRepository.getConnection();
    if (!connection) throw new AppError(409, 'HOROSHOP_NOT_CONNECTED', 'Спочатку підключіть магазин Хорошоп.');
    if (connection.status !== 'connected') throw new AppError(409, 'HOROSHOP_CONNECTION_NOT_READY', 'Дочекайтеся успішної синхронізації каталогу Хорошоп.');
    return connection;
  }

  async catalog(connection) {
    const params = [connection.id, connection.generation];
    const [products, modifications, categories, stickers] = await Promise.all([
      this.pool.query(`SELECT id, external_id, sku, titles, brand, category_external_id, price, availability,
        source_data->'brand' AS source_brand,
        visible, primary_image_url, canonical_url, stickers, COALESCE(horoshop_created_at, created_at) AS creation_time
        FROM search_horoshop_products WHERE connection_id = $1 AND generation = $2 AND active = TRUE ORDER BY sku, id`, params),
      this.pool.query(`SELECT id, product_id, sku, titles, price, availability, visible, stickers, source_data->'brand' AS source_brand
        FROM search_horoshop_modifications WHERE connection_id = $1 AND generation = $2 AND active = TRUE ORDER BY sku, id`, params),
      this.pool.query(`SELECT external_id, parent_external_id, titles FROM search_horoshop_categories
        WHERE connection_id = $1 AND generation = $2 AND active = TRUE`, params),
      this.pool.query(`SELECT external_id, title, enabled FROM search_horoshop_stickers
        WHERE connection_id = $1 AND generation = $2 AND active = TRUE ORDER BY title`, params)
    ]);
    const children = new Map();
    const childBrands = new Map();
    for (const row of modifications.rows) {
      const brand = normalizeHoroshopBrand(row.source_brand);
      if (brand && !childBrands.has(row.product_id)) childBrands.set(row.product_id, brand);
      if (!children.has(row.product_id)) children.set(row.product_id, []);
      children.get(row.product_id).push({ id: row.id, sku: row.sku, titles: objectValue(row.titles), price: row.price,
        availability: row.availability, visible: row.visible, stickers: arrayValue(row.stickers) });
    }
    return {
      products: products.rows.map((row) => ({ id: row.id, externalId: row.external_id, sku: row.sku,
        titles: objectValue(row.titles), brand: row.brand || normalizeHoroshopBrand(row.source_brand) || childBrands.get(row.id) || null, categoryExternalId: row.category_external_id,
        price: row.price, availability: row.availability, visible: row.visible, imageUrl: row.primary_image_url,
        canonicalUrl: row.canonical_url, stickers: arrayValue(row.stickers),
        horoshopCreatedAt: new Date(row.creation_time).toISOString(), modifications: children.get(row.id) || [] })),
      categories: categories.rows.map((row) => ({ externalId: row.external_id, parentExternalId: row.parent_external_id, title: titleFor(objectValue(row.titles), row.external_id) })),
      directory: manualStickerDirectory(stickers.rows.map((row) => ({ externalId: row.external_id, title: row.title, enabled: row.enabled })))
    };
  }

  async cachedGroups(connection, products) {
    const ids = products.map((product) => product.id);
    if (!ids.length) return new Map();
    const params = [connection.id, connection.generation, ...ids];
    const selected = ids.map((_, index) => `$${index + 3}`).join(',');
    const [parents, offers] = await Promise.all([
      this.pool.query(`SELECT id, sku, source_data->'icons' AS source_icons, source_data->'stickers' AS source_stickers, stickers FROM search_horoshop_products
        WHERE connection_id = $1 AND generation = $2 AND active = TRUE AND id IN (${selected})`, params),
      this.pool.query(`SELECT product_id, sku, source_data->'icons' AS source_icons, source_data->'stickers' AS source_stickers, stickers FROM search_horoshop_modifications
        WHERE connection_id = $1 AND generation = $2 AND active = TRUE AND product_id IN (${selected}) ORDER BY sku, id`, params)
    ]);
    const byProduct = new Map(parents.rows.map((row) => [row.id, [row]]));
    for (const row of offers.rows) byProduct.get(row.product_id)?.push(row);
    const groups = new Map();
    for (const product of products) {
      const rows = byProduct.get(product.id) || [];
      const membership = [...new Set(rows.slice(1).map((row) => row.sku))].sort();
      const withIcons = rows.filter((row) => row.source_icons != null || row.source_stickers != null);
      const stickers = withIcons.length ? arrayValue(withIcons[0].stickers) : [];
      let error = '';
      if (!withIcons.length) error = 'У синхронізованому каталозі немає поля стікерів. Оновіть каталог.';
      else if (withIcons.some((row) => !sameStickers(stickers, arrayValue(row.stickers)))) {
        error = 'Стікери модифікацій відрізняються. Спочатку виправте групу в Хорошоп.';
      }
      groups.set(product.externalId, { article: rows[1]?.sku || rows[0]?.sku || product.sku, membership, stickers, error });
    }
    return groups;
  }

  async transaction(callback) {
    const client = await this.pool.connect();
    try { await client.query('BEGIN'); const value = await callback(client); await client.query('COMMIT'); return value; }
    catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async cacheDirectory(connection, directory) {
    const marker = randomUUID();
    await this.transaction(async (db) => {
      await this.assertConnection(db, connection);
      const ids = directory.map((item) => item.externalId);
      await db.query(`UPDATE search_horoshop_stickers SET active = FALSE, updated_at = NOW()
        WHERE connection_id = $1 AND generation = $2${ids.length ? ` AND external_id NOT IN (${ids.map((_, i) => `$${i + 3}`).join(',')})` : ''}`, [connection.id, connection.generation, ...ids]);
      for (const item of directory) await db.query(`INSERT INTO search_horoshop_stickers
        (connection_id, generation, external_id, title, enabled, source_data, last_seen_sync_id)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
        ON CONFLICT (connection_id, external_id) DO UPDATE SET generation = EXCLUDED.generation,
          title = EXCLUDED.title, enabled = EXCLUDED.enabled, source_data = EXCLUDED.source_data,
          active = TRUE, sync_signature = '', last_seen_sync_id = EXCLUDED.last_seen_sync_id, updated_at = NOW()`,
      [connection.id, connection.generation, item.externalId, item.title, item.enabled, JSON.stringify(item.source), marker]);
    });
  }

  async assertConnection(db, connection) {
    const result = await db.query(`SELECT id FROM search_horoshop_connections WHERE id = $1 AND generation = $2 AND status = 'connected' FOR UPDATE`, [connection.id, connection.generation]);
    if (!result.rows.length) throw new AppError(409, 'STICKER_CATALOG_STALE', 'Підключення змінилося. Оновіть каталог.');
  }

  async event(connectionId, operationId, actorId, action, details = {}, db = this.pool) {
    await db.query(`INSERT INTO search_horoshop_sticker_events (connection_id, operation_id, actor_user_id, action, details)
      VALUES ($1, $2, $3, $4, $5::jsonb)`, [connectionId, operationId, actorId, action, JSON.stringify(details)]);
  }

  async createOperation(connection, { name, kind = 'change', parentId = null, actorId, items, onProgress = null }) {
    const id = randomUUID();
    await this.transaction(async (db) => {
      await this.assertConnection(db, connection);
      await db.query(`INSERT INTO search_horoshop_sticker_operations (id, connection_id, generation, name, kind, parent_id, actor_user_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)`, [id, connection.id, connection.generation, name, kind, parentId, actorId]);
      for (let offset = 0; offset < items.length; offset += 100) {
        const values = [];
        const placeholders = items.slice(offset, offset + 100).map((item) => {
          const base = values.length;
          values.push(id, item.productId, item.externalId, item.article, item.title, JSON.stringify(item.membership),
            JSON.stringify(item.before), JSON.stringify(item.after), JSON.stringify(item.addIds), JSON.stringify(item.removeIds), item.status, item.message || '');
          return `(${Array.from({ length: 12 }, (_, i) => `$${base + i + 1}${i >= 5 && i <= 9 ? '::jsonb' : ''}`).join(',')})`;
        });
        await db.query(`INSERT INTO search_horoshop_sticker_operation_items
          (operation_id, product_id, external_id, article, title, membership, before_stickers, after_stickers, add_ids, remove_ids, status, message)
          VALUES ${placeholders.join(',')}`, values);
        onProgress?.(Math.min(offset + 100, items.length));
      }
      await this.event(connection.id, id, actorId, 'preview_created', { kind, total: items.length }, db);
    });
    return id;
  }

  async operation(id, connection) {
    const result = await this.pool.query(`SELECT operation.*, actor.name AS actor_name FROM search_horoshop_sticker_operations AS operation
      LEFT JOIN users AS actor ON actor.id = operation.actor_user_id WHERE operation.id = $1 AND operation.connection_id = $2 AND operation.generation = $3`, [id, connection.id, connection.generation]);
    const row = result.rows[0];
    if (!row) throw new AppError(404, 'STICKER_OPERATION_NOT_FOUND', 'Операцію не знайдено в поточному магазині.');
    const items = await this.pool.query('SELECT * FROM search_horoshop_sticker_operation_items WHERE operation_id = $1 ORDER BY article, id', [id]);
    return { id: row.id, name: row.name, kind: row.kind, parentId: row.parent_id, status: row.status,
      actorName: row.actor_name || 'Користувач', actorUserId: row.actor_user_id, createdAt: row.created_at, startedAt: row.started_at,
      completedAt: row.completed_at, stopRequested: row.stop_requested, items: items.rows.map(itemFromRow) };
  }

  async history(connection) {
    const operations = await this.pool.query(`SELECT operation.id, operation.name, operation.kind, operation.status,
      operation.created_at, actor.name AS actor_name FROM search_horoshop_sticker_operations AS operation
      LEFT JOIN users AS actor ON actor.id = operation.actor_user_id
      WHERE operation.connection_id = $1 AND operation.generation = $2 ORDER BY operation.created_at DESC LIMIT 50`, [connection.id, connection.generation]);
    return operations.rows.map((row) => ({ id: row.id, name: row.name, kind: row.kind, status: row.status,
      createdAt: row.created_at, actorName: row.actor_name || 'Користувач' }));
  }

  async enqueue(id, connection, actorId) {
    const result = await this.pool.query(`UPDATE search_horoshop_sticker_operations SET status = 'queued'
      WHERE id = $1 AND connection_id = $2 AND generation = $3 AND status = 'draft' RETURNING id`, [id, connection.id, connection.generation]);
    if (!result.rows.length) throw new AppError(409, 'STICKER_ALREADY_STARTED', 'Цю операцію вже запущено.');
    await this.event(connection.id, id, actorId, 'apply_requested');
  }

  async setItem(id, status, message = '') {
    await this.pool.query('UPDATE search_horoshop_sticker_operation_items SET status = $2, message = $3, updated_at = NOW() WHERE id = $1', [id, status, message]);
  }

  async cacheStickers(connection, item) {
    const value = JSON.stringify(item.after);
    await this.transaction(async (db) => {
      await this.assertConnection(db, connection);
      await db.query(`UPDATE search_horoshop_products SET stickers = $1::jsonb, updated_at = NOW()
        WHERE id = $2 AND connection_id = $3 AND generation = $4`, [value, item.productId, connection.id, connection.generation]);
      await db.query(`UPDATE search_horoshop_modifications SET stickers = $1::jsonb, updated_at = NOW()
        WHERE product_id = $2 AND connection_id = $3 AND generation = $4 AND active = TRUE`, [value, item.productId, connection.id, connection.generation]);
    });
  }
}
