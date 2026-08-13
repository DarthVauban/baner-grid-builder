import { randomUUID } from 'node:crypto';
import { pool as defaultPool } from '../../../db/pool.js';

function mapConnection(row) {
  if (!row) return null;
  return {
    id: row.id,
    generation: row.generation,
    storeDomain: row.store_domain,
    encryptedCredentials: row.encrypted_credentials,
    pollingIntervalMinutes: Number(row.polling_interval_minutes),
    status: row.status,
    lastSyncAt: row.last_sync_at,
    lastError: row.last_error
  };
}

function mapRun(row) {
  if (!row) return null;
  return {
    id: row.id,
    mode: row.mode,
    status: row.status,
    categoriesReceived: Number(row.categories_received),
    productsReceived: Number(row.products_received),
    modificationsReceived: Number(row.modifications_received),
    pagesReceived: Number(row.pages_received),
    errorMessage: row.error_message,
    startedAt: row.started_at,
    completedAt: row.completed_at
  };
}

export class HoroshopCatalogRepository {
  constructor(databasePool = defaultPool) {
    this.pool = databasePool;
  }

  async getConnection() {
    const result = await this.pool.query(`
      SELECT id, generation, store_domain, encrypted_credentials, polling_interval_minutes,
             status, last_sync_at, last_error
      FROM search_horoshop_connections
      WHERE singleton = TRUE
      LIMIT 1
    `);
    return mapConnection(result.rows[0]);
  }

  async getStatus() {
    const connection = await this.getConnection();
    if (!connection) {
      return {
        configured: false,
        status: 'disconnected',
        storeDomain: '',
        pollingIntervalMinutes: null,
        lastSyncAt: null,
        lastError: null,
        counts: { categories: 0, products: 0, modifications: 0 },
        latestRun: null
      };
    }
    const [countsResult, runResult] = await Promise.all([
      this.pool.query(`
        SELECT
          (SELECT COUNT(*) FROM search_horoshop_categories WHERE connection_id = $1 AND active) AS categories,
          (SELECT COUNT(*) FROM search_horoshop_products WHERE connection_id = $1 AND active) AS products,
          (SELECT COUNT(*) FROM search_horoshop_modifications WHERE connection_id = $1 AND active) AS modifications
      `, [connection.id]),
      this.pool.query(`
        SELECT id, mode, status, categories_received, products_received, modifications_received,
               pages_received, error_message, started_at, completed_at
        FROM search_horoshop_sync_runs
        WHERE connection_id = $1
        ORDER BY started_at DESC
        LIMIT 1
      `, [connection.id])
    ]);
    const counts = countsResult.rows[0] || {};
    return {
      configured: true,
      status: connection.status,
      storeDomain: connection.storeDomain,
      pollingIntervalMinutes: connection.pollingIntervalMinutes,
      lastSyncAt: connection.lastSyncAt,
      lastError: connection.lastError,
      counts: {
        categories: Number(counts.categories || 0),
        products: Number(counts.products || 0),
        modifications: Number(counts.modifications || 0)
      },
      latestRun: mapRun(runResult.rows[0])
    };
  }

  async createConnection(input) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query(`
        SELECT id, status FROM search_horoshop_connections WHERE singleton = TRUE FOR UPDATE
      `);
      if (existing.rowCount > 0) {
        const error = new Error('Horoshop connection already exists');
        error.code = existing.rows[0].status === 'purge_failed' ? 'PURGE_FAILED' : 'CONNECTION_EXISTS';
        throw error;
      }
      const result = await client.query(`
        INSERT INTO search_horoshop_connections (
          id, generation, store_domain, encrypted_credentials, polling_interval_minutes,
          status, last_verified_at
        ) VALUES ($1, $2, $3, $4, $5, 'connected', NOW())
        RETURNING id, generation, store_domain, encrypted_credentials, polling_interval_minutes,
                  status, last_sync_at, last_error
      `, [randomUUID(), randomUUID(), input.storeDomain, input.encryptedCredentials, input.pollingIntervalMinutes]);
      await client.query('COMMIT');
      return mapConnection(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async beginSync(connection, mode) {
    const client = await this.pool.connect();
    const runId = randomUUID();
    try {
      await client.query('BEGIN');
      const active = await client.query(`
        SELECT status FROM search_horoshop_connections
        WHERE id = $1 AND generation = $2
        FOR UPDATE
      `, [connection.id, connection.generation]);
      if (active.rowCount !== 1 || ['disconnecting', 'purge_failed'].includes(active.rows[0].status)) {
        throw new Error('Horoshop connection generation is no longer active');
      }
      await client.query(`
        UPDATE search_horoshop_sync_runs
        SET status = 'failed', error_message = 'Синхронізацію перервано перезапуском сервера.',
            completed_at = NOW()
        WHERE connection_id = $1 AND generation = $2 AND status = 'running'
      `, [connection.id, connection.generation]);
      await client.query(`
        UPDATE search_horoshop_connections
        SET status = 'syncing', last_error = NULL, updated_at = NOW()
        WHERE id = $1 AND generation = $2
      `, [connection.id, connection.generation]);
      await client.query(`
        INSERT INTO search_horoshop_sync_runs (id, connection_id, generation, mode)
        VALUES ($1, $2, $3, $4)
      `, [runId, connection.id, connection.generation, mode]);
      await client.query('COMMIT');
      return runId;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async applyCategories(connection, runId, categories) {
    if (categories.length === 0) return;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.assertWritableConnection(client, connection);
      for (const category of categories) {
        await client.query(`
          INSERT INTO search_horoshop_categories (
            id, connection_id, generation, external_id, parent_external_id, titles,
            image_url, canonical_url, source_data, active, last_seen_sync_id
          ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9::jsonb, TRUE, $10)
          ON CONFLICT (connection_id, external_id) DO UPDATE SET
            generation = EXCLUDED.generation,
            parent_external_id = EXCLUDED.parent_external_id,
            titles = EXCLUDED.titles,
            image_url = EXCLUDED.image_url,
            canonical_url = EXCLUDED.canonical_url,
            source_data = EXCLUDED.source_data,
            active = TRUE,
            last_seen_sync_id = EXCLUDED.last_seen_sync_id,
            updated_at = NOW()
        `, [
          randomUUID(), connection.id, connection.generation, category.externalId,
          category.parentExternalId, JSON.stringify(category.titles), category.imageUrl,
          category.canonicalUrl, JSON.stringify(category.source), runId
        ]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async applyProducts(connection, runId, products) {
    if (products.length === 0) return;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.assertWritableConnection(client, connection);
      for (const product of products) {
        const productResult = await client.query(`
          INSERT INTO search_horoshop_products (
            id, connection_id, generation, external_id, parent_external_id, sku, titles,
            descriptions, brand, category_external_id, price, old_price, currency, availability,
            visible, primary_image_url, canonical_url, popularity, characteristics, source_data,
            active, last_seen_sync_id
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11, $12, $13, $14,
            $15, $16, $17, $18, $19::jsonb, $20::jsonb, TRUE, $21
          )
          ON CONFLICT (connection_id, external_id) DO UPDATE SET
            generation = EXCLUDED.generation,
            parent_external_id = EXCLUDED.parent_external_id,
            sku = EXCLUDED.sku,
            titles = EXCLUDED.titles,
            descriptions = EXCLUDED.descriptions,
            brand = EXCLUDED.brand,
            category_external_id = EXCLUDED.category_external_id,
            price = EXCLUDED.price,
            old_price = EXCLUDED.old_price,
            currency = EXCLUDED.currency,
            availability = EXCLUDED.availability,
            visible = EXCLUDED.visible,
            primary_image_url = EXCLUDED.primary_image_url,
            canonical_url = EXCLUDED.canonical_url,
            popularity = EXCLUDED.popularity,
            characteristics = EXCLUDED.characteristics,
            source_data = EXCLUDED.source_data,
            active = TRUE,
            last_seen_sync_id = EXCLUDED.last_seen_sync_id,
            updated_at = NOW()
          RETURNING id
        `, [
          randomUUID(), connection.id, connection.generation, product.externalId,
          product.parentExternalId, product.sku, JSON.stringify(product.titles),
          JSON.stringify(product.descriptions), product.brand, product.categoryExternalId,
          product.price, product.oldPrice, product.currency, product.availability, product.visible,
          product.primaryImageUrl, product.canonicalUrl, product.popularity,
          JSON.stringify(product.characteristics), JSON.stringify(product.source), runId
        ]);
        const productId = productResult.rows[0].id;
        for (const modification of product.modifications) {
          await client.query(`
            INSERT INTO search_horoshop_modifications (
              id, connection_id, product_id, generation, external_id, sku, titles, price,
              old_price, currency, availability, visible, image_url, page_url, attributes,
              source_data, active, last_seen_sync_id
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13, $14,
              $15::jsonb, $16::jsonb, TRUE, $17
            )
            ON CONFLICT (connection_id, external_id) DO UPDATE SET
              product_id = EXCLUDED.product_id,
              generation = EXCLUDED.generation,
              sku = EXCLUDED.sku,
              titles = EXCLUDED.titles,
              price = EXCLUDED.price,
              old_price = EXCLUDED.old_price,
              currency = EXCLUDED.currency,
              availability = EXCLUDED.availability,
              visible = EXCLUDED.visible,
              image_url = EXCLUDED.image_url,
              page_url = EXCLUDED.page_url,
              attributes = EXCLUDED.attributes,
              source_data = EXCLUDED.source_data,
              active = TRUE,
              last_seen_sync_id = EXCLUDED.last_seen_sync_id,
              updated_at = NOW()
          `, [
            randomUUID(), connection.id, productId, connection.generation,
            modification.externalId, modification.sku, JSON.stringify(modification.titles),
            modification.price, modification.oldPrice, modification.currency,
            modification.availability, modification.visible, modification.imageUrl,
            modification.pageUrl, JSON.stringify(modification.attributes),
            JSON.stringify(modification.source), runId
          ]);
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async updateRunProgress(runId, counts) {
    await this.pool.query(`
      UPDATE search_horoshop_sync_runs
      SET categories_received = $2, products_received = $3, modifications_received = $4,
          pages_received = $5
      WHERE id = $1 AND status = 'running'
    `, [runId, counts.categories, counts.products, counts.modifications, counts.pages]);
  }

  async completeSync(connection, runId, counts) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.assertWritableConnection(client, connection);
      await client.query(`
        UPDATE search_horoshop_categories
        SET active = FALSE, updated_at = NOW()
        WHERE connection_id = $1 AND generation = $2 AND last_seen_sync_id <> $3 AND active
      `, [connection.id, connection.generation, runId]);
      await client.query(`
        UPDATE search_horoshop_products
        SET active = FALSE, updated_at = NOW()
        WHERE connection_id = $1 AND generation = $2 AND last_seen_sync_id <> $3 AND active
      `, [connection.id, connection.generation, runId]);
      await client.query(`
        UPDATE search_horoshop_modifications
        SET active = FALSE, updated_at = NOW()
        WHERE connection_id = $1 AND generation = $2 AND last_seen_sync_id <> $3 AND active
      `, [connection.id, connection.generation, runId]);
      await client.query(`
        UPDATE search_horoshop_sync_runs
        SET status = 'succeeded', categories_received = $2, products_received = $3,
            modifications_received = $4, pages_received = $5, completed_at = NOW()
        WHERE id = $1 AND connection_id = $6 AND generation = $7
      `, [
        runId, counts.categories, counts.products, counts.modifications, counts.pages,
        connection.id, connection.generation
      ]);
      await client.query(`
        UPDATE search_horoshop_connections
        SET status = 'connected', last_sync_at = NOW(), last_error = NULL, updated_at = NOW()
        WHERE id = $1 AND generation = $2
      `, [connection.id, connection.generation]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async failSync(connection, runId, error) {
    const message = String(error instanceof Error ? error.message : error || 'Unknown sync error').slice(0, 2000);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        UPDATE search_horoshop_sync_runs
        SET status = 'failed', error_message = $2, completed_at = NOW()
        WHERE id = $1 AND status = 'running'
      `, [runId, message]);
      await client.query(`
        UPDATE search_horoshop_connections
        SET status = 'error', last_error = $3, updated_at = NOW()
        WHERE id = $1 AND generation = $2 AND status <> 'disconnecting'
      `, [connection.id, connection.generation, message]);
      await client.query('COMMIT');
    } catch (failure) {
      await client.query('ROLLBACK');
      throw failure;
    } finally {
      client.release();
    }
  }

  async markDisconnecting(connection) {
    const result = await this.pool.query(`
      UPDATE search_horoshop_connections
      SET status = 'disconnecting', updated_at = NOW()
      WHERE id = $1 AND generation = $2
      RETURNING id
    `, [connection.id, connection.generation]);
    if (result.rowCount !== 1) throw new Error('Horoshop connection generation is no longer active');
  }

  async purgeConnection(connection, audit) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const locked = await client.query(`
        SELECT id FROM search_horoshop_connections
        WHERE id = $1 AND generation = $2 AND status = 'disconnecting'
        FOR UPDATE
      `, [connection.id, connection.generation]);
      if (locked.rowCount !== 1) throw new Error('Horoshop connection is not ready for purge');
      const countsResult = await client.query(`
        SELECT
          (SELECT COUNT(*) FROM search_horoshop_categories WHERE connection_id = $1) AS categories,
          (SELECT COUNT(*) FROM search_horoshop_products WHERE connection_id = $1) AS products,
          (SELECT COUNT(*) FROM search_horoshop_modifications WHERE connection_id = $1) AS modifications
      `, [connection.id]);
      await client.query('DELETE FROM search_horoshop_connections WHERE id = $1 AND generation = $2', [
        connection.id, connection.generation
      ]);
      for (const table of [
        'search_horoshop_categories', 'search_horoshop_products',
        'search_horoshop_modifications', 'search_horoshop_sync_runs'
      ]) {
        const remaining = await client.query(`SELECT COUNT(*) AS count FROM ${table} WHERE connection_id = $1`, [
          connection.id
        ]);
        if (Number(remaining.rows[0]?.count || 0) !== 0) throw new Error(`Horoshop purge verification failed for ${table}`);
      }
      await client.query(`
        INSERT INTO search_horoshop_audit_log (
          id, connection_id, actor_user_id, action, outcome, store_domain_fingerprint, details
        ) VALUES ($1, $2, $3, 'disconnect', 'succeeded', $4, $5::jsonb)
      `, [randomUUID(), connection.id, audit.actorUserId, audit.domainFingerprint, JSON.stringify({
        deleted: {
          categories: Number(countsResult.rows[0]?.categories || 0),
          products: Number(countsResult.rows[0]?.products || 0),
          modifications: Number(countsResult.rows[0]?.modifications || 0)
        }
      })]);
      await client.query('COMMIT');
      return {
        categories: Number(countsResult.rows[0]?.categories || 0),
        products: Number(countsResult.rows[0]?.products || 0),
        modifications: Number(countsResult.rows[0]?.modifications || 0)
      };
    } catch (error) {
      await client.query('ROLLBACK');
      await this.pool.query(`
        UPDATE search_horoshop_connections
        SET status = 'purge_failed', last_error = $3, updated_at = NOW()
        WHERE id = $1 AND generation = $2
      `, [connection.id, connection.generation, String(error.message || error).slice(0, 2000)]).catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async recordAudit(input) {
    await this.pool.query(`
      INSERT INTO search_horoshop_audit_log (
        id, connection_id, actor_user_id, action, outcome, store_domain_fingerprint, details
      ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
    `, [
      randomUUID(), input.connectionId || null, input.actorUserId || null, input.action,
      input.outcome, input.domainFingerprint, JSON.stringify(input.details || {})
    ]);
  }

  async assertWritableConnection(client, connection) {
    const active = await client.query(`
      SELECT status FROM search_horoshop_connections
      WHERE id = $1 AND generation = $2
      FOR UPDATE
    `, [connection.id, connection.generation]);
    if (active.rowCount !== 1 || active.rows[0].status !== 'syncing') {
      throw new Error('Horoshop connection generation is no longer writable');
    }
  }
}
