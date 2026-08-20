import { createHash, randomUUID } from 'node:crypto';
import { pool as defaultPool } from '../../../db/pool.js';

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function syncSignature(value) {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

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

function jsonObject(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function mapCatalogModification(row) {
  return {
    id: row.id,
    externalId: row.external_id,
    sku: row.sku,
    titles: jsonObject(row.titles),
    price: row.price,
    oldPrice: row.old_price,
    currency: row.currency,
    availability: row.availability,
    visible: row.visible,
    active: row.active,
    imageUrl: row.image_url,
    pageUrl: row.page_url,
    attributes: jsonObject(row.attributes),
    updatedAt: row.updated_at
  };
}

function mapCatalogProduct(row, modifications) {
  return {
    id: row.id,
    externalId: row.external_id,
    parentExternalId: row.parent_external_id,
    sku: row.sku,
    titles: jsonObject(row.titles),
    brand: row.brand,
    categoryExternalId: row.category_external_id,
    price: row.price,
    oldPrice: row.old_price,
    currency: row.currency,
    availability: row.availability,
    visible: row.visible,
    active: row.active,
    primaryImageUrl: row.primary_image_url,
    canonicalUrl: row.canonical_url,
    popularity: row.popularity,
    updatedAt: row.updated_at,
    modifications
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

  async listCatalog(input = {}) {
    const connection = await this.getConnection();
    const page = Math.max(1, Number(input.page) || 1);
    const pageSize = Math.max(10, Math.min(Number(input.pageSize) || 25, 100));
    if (!connection) {
      return {
        items: [], categories: [], availabilityOptions: [], total: 0,
        page, pageSize, pageCount: 0
      };
    }

    const state = ['all', 'inactive'].includes(input.state) ? input.state : 'active';
    const visibility = ['visible', 'hidden'].includes(input.visibility) ? input.visibility : 'all';
    const search = String(input.search || '').trim().slice(0, 160);
    const category = String(input.category || '').trim().slice(0, 255);
    const availability = String(input.availability || '').trim().slice(0, 200);
    const values = [connection.id];
    const clauses = ['product.connection_id = $1'];
    const addValue = (value) => {
      values.push(value);
      return `$${values.length}`;
    };

    if (state !== 'all') clauses.push(`product.active = ${state === 'active' ? 'TRUE' : 'FALSE'}`);
    if (category) clauses.push(`product.category_external_id = ${addValue(category)}`);
    if (visibility === 'visible') clauses.push('product.visible = TRUE');
    if (visibility === 'hidden') {
      clauses.push(`(
        product.visible = FALSE OR product.id IN (
          SELECT hidden_modification.product_id
          FROM search_horoshop_modifications AS hidden_modification
          WHERE hidden_modification.connection_id = $1
            AND hidden_modification.active = TRUE
            AND hidden_modification.visible = FALSE
        )
      )`);
    }
    if (search) {
      const parameter = addValue(`%${search.toLocaleLowerCase('uk-UA')}%`);
      clauses.push(`(
        LOWER(COALESCE(product.sku, '')) LIKE ${parameter}
        OR LOWER(COALESCE(product.brand, '')) LIKE ${parameter}
        OR LOWER(CAST(product.titles AS TEXT)) LIKE ${parameter}
        OR product.id IN (
          SELECT matched_modification.product_id
          FROM search_horoshop_modifications AS matched_modification
          WHERE matched_modification.connection_id = $1
            AND (
              LOWER(COALESCE(matched_modification.sku, '')) LIKE ${parameter}
              OR LOWER(CAST(matched_modification.titles AS TEXT)) LIKE ${parameter}
            )
        )
      )`);
    }
    if (availability) {
      const parameter = addValue(availability.toLocaleLowerCase('uk-UA'));
      clauses.push(`(
        LOWER(COALESCE(product.availability, '')) = ${parameter}
        OR product.id IN (
          SELECT availability_modification.product_id
          FROM search_horoshop_modifications AS availability_modification
          WHERE availability_modification.connection_id = $1
            AND availability_modification.active = TRUE
            AND LOWER(COALESCE(availability_modification.availability, '')) = ${parameter}
        )
      )`);
    }

    const where = clauses.join('\n AND ');
    const limitParameter = `$${values.length + 1}`;
    const offsetParameter = `$${values.length + 2}`;
    const pageValues = [...values, pageSize, (page - 1) * pageSize];
    const [productsResult, countResult, categoriesResult, categoryCountsResult, productAvailabilityResult, modificationAvailabilityResult] = await Promise.all([
      this.pool.query(`
        SELECT id, external_id, parent_external_id, sku, titles, brand, category_external_id,
               price, old_price, currency, availability, visible, active, primary_image_url,
               canonical_url, popularity, updated_at
        FROM search_horoshop_products AS product
        WHERE ${where}
        ORDER BY product.updated_at DESC, product.id
        LIMIT ${limitParameter} OFFSET ${offsetParameter}
      `, pageValues),
      this.pool.query(`
        SELECT COUNT(*) AS total
        FROM search_horoshop_products AS product
        WHERE ${where}
      `, values),
      this.pool.query(`
        SELECT external_id, parent_external_id, titles
        FROM search_horoshop_categories
        WHERE connection_id = $1 AND active = TRUE
        ORDER BY titles::text, external_id
      `, [connection.id]),
      this.pool.query(`
        SELECT category_external_id, COUNT(*) AS total
        FROM search_horoshop_products
        WHERE connection_id = $1 AND active = TRUE
        GROUP BY category_external_id
      `, [connection.id]),
      this.pool.query(`
        SELECT DISTINCT availability
        FROM search_horoshop_products
        WHERE connection_id = $1 AND active = TRUE AND availability IS NOT NULL AND availability <> ''
      `, [connection.id]),
      this.pool.query(`
        SELECT DISTINCT availability
        FROM search_horoshop_modifications
        WHERE connection_id = $1 AND active = TRUE AND availability IS NOT NULL AND availability <> ''
      `, [connection.id])
    ]);

    const productIds = productsResult.rows.map((row) => row.id);
    let modificationRows = [];
    if (productIds.length > 0) {
      const modificationState = state === 'active'
        ? 'AND active = TRUE'
        : state === 'inactive' ? 'AND active = FALSE' : '';
      const placeholders = productIds.map((_, index) => `$${index + 2}`).join(', ');
      const modificationsResult = await this.pool.query(`
        SELECT id, product_id, external_id, sku, titles, price, old_price, currency,
               availability, visible, active, image_url, page_url, attributes, updated_at
        FROM search_horoshop_modifications
        WHERE connection_id = $1 AND product_id IN (${placeholders}) ${modificationState}
        ORDER BY updated_at DESC, id
      `, [connection.id, ...productIds]);
      modificationRows = modificationsResult.rows;
    }

    const modificationsByProduct = new Map();
    for (const row of modificationRows) {
      const items = modificationsByProduct.get(row.product_id) || [];
      items.push(mapCatalogModification(row));
      modificationsByProduct.set(row.product_id, items);
    }
    const categoryCounts = new Map(categoryCountsResult.rows.map((row) => [
      row.category_external_id, Number(row.total || 0)
    ]));
    const availabilityOptions = [...new Set([
      ...productAvailabilityResult.rows.map((row) => String(row.availability || '').trim()),
      ...modificationAvailabilityResult.rows.map((row) => String(row.availability || '').trim())
    ].filter(Boolean))].sort((left, right) => left.localeCompare(right, 'uk-UA'));
    const total = Number(countResult.rows[0]?.total || 0);

    return {
      items: productsResult.rows.map((row) => mapCatalogProduct(
        row,
        modificationsByProduct.get(row.id) || []
      )),
      categories: categoriesResult.rows.map((row) => ({
        externalId: row.external_id,
        parentExternalId: row.parent_external_id,
        titles: jsonObject(row.titles),
        productCount: categoryCounts.get(row.external_id) || 0
      })),
      availabilityOptions,
      total,
      page,
      pageSize,
      pageCount: total > 0 ? Math.ceil(total / pageSize) : 0
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

  async updatePollingInterval(connection, pollingIntervalMinutes) {
    const result = await this.pool.query(`
      UPDATE search_horoshop_connections
      SET polling_interval_minutes = $3,
          updated_at = CASE WHEN polling_interval_minutes <> $3 THEN NOW() ELSE updated_at END
      WHERE id = $1 AND generation = $2 AND status NOT IN ('disconnecting', 'purge_failed')
      RETURNING id, generation, store_domain, encrypted_credentials, polling_interval_minutes,
                status, last_sync_at, last_error
    `, [connection.id, connection.generation, pollingIntervalMinutes]);
    if (result.rowCount !== 1) throw new Error('Horoshop connection generation is no longer active');
    return mapConnection(result.rows[0]);
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
      const externalIds = [...new Set(categories.map((category) => category.externalId))];
      const placeholders = externalIds.map((_, index) => `$${index + 2}`).join(', ');
      const existingResult = await client.query(`
        SELECT id, external_id, sync_signature, active
        FROM search_horoshop_categories
        WHERE connection_id = $1 AND external_id IN (${placeholders})
      `, [connection.id, ...externalIds]);
      const existingByExternalId = new Map(existingResult.rows.map((row) => [row.external_id, row]));

      for (const category of categories) {
        const signature = syncSignature(category);
        const existing = existingByExternalId.get(category.externalId);
        if (!existing) {
          const id = randomUUID();
          await client.query(`
            INSERT INTO search_horoshop_categories (
              id, connection_id, generation, external_id, parent_external_id, titles,
              image_url, canonical_url, source_data, sync_signature, active, last_seen_sync_id
            ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9::jsonb, $10, TRUE, $11)
          `, [
            id, connection.id, connection.generation, category.externalId,
            category.parentExternalId, JSON.stringify(category.titles), category.imageUrl,
            category.canonicalUrl, JSON.stringify(category.source), signature, runId
          ]);
          existingByExternalId.set(category.externalId, {
            id, external_id: category.externalId, sync_signature: signature, active: true
          });
          continue;
        }
        if (existing.active && existing.sync_signature === signature) continue;
        await client.query(`
          UPDATE search_horoshop_categories
          SET generation = $3, parent_external_id = $4, titles = $5::jsonb,
              image_url = $6, canonical_url = $7, source_data = $8::jsonb,
              sync_signature = $9, active = TRUE, last_seen_sync_id = $10, updated_at = NOW()
          WHERE id = $1 AND connection_id = $2
        `, [
          existing.id, connection.id, connection.generation, category.parentExternalId,
          JSON.stringify(category.titles), category.imageUrl, category.canonicalUrl,
          JSON.stringify(category.source), signature, runId
        ]);
        existing.sync_signature = signature;
        existing.active = true;
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
      const productExternalIds = [...new Set(products.map((product) => product.externalId))];
      const productPlaceholders = productExternalIds.map((_, index) => `$${index + 2}`).join(', ');
      const existingProductsResult = await client.query(`
        SELECT id, external_id, sync_signature, active
        FROM search_horoshop_products
        WHERE connection_id = $1 AND external_id IN (${productPlaceholders})
      `, [connection.id, ...productExternalIds]);
      const existingProducts = new Map(existingProductsResult.rows.map((row) => [row.external_id, row]));
      const modificationExternalIds = [...new Set(products.flatMap((product) => (
        product.modifications.map((modification) => modification.externalId)
      )))];
      let existingModifications = new Map();
      if (modificationExternalIds.length > 0) {
        const modificationPlaceholders = modificationExternalIds.map((_, index) => `$${index + 2}`).join(', ');
        const existingModificationsResult = await client.query(`
          SELECT id, product_id, external_id, sync_signature, active
          FROM search_horoshop_modifications
          WHERE connection_id = $1 AND external_id IN (${modificationPlaceholders})
        `, [connection.id, ...modificationExternalIds]);
        existingModifications = new Map(existingModificationsResult.rows.map((row) => [row.external_id, row]));
      }

      for (const product of products) {
        const signature = syncSignature({ ...product, modifications: undefined });
        let existingProduct = existingProducts.get(product.externalId);
        let productId = existingProduct?.id;
        if (!existingProduct) {
          productId = randomUUID();
          await client.query(`
            INSERT INTO search_horoshop_products (
              id, connection_id, generation, external_id, parent_external_id, sku, titles,
              descriptions, brand, category_external_id, price, old_price, currency, availability,
              visible, primary_image_url, canonical_url, popularity, characteristics, source_data,
              sync_signature, active, last_seen_sync_id
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11, $12, $13, $14,
              $15, $16, $17, $18, $19::jsonb, $20::jsonb, $21, TRUE, $22
            )
          `, [
            productId, connection.id, connection.generation, product.externalId,
            product.parentExternalId, product.sku, JSON.stringify(product.titles),
            JSON.stringify(product.descriptions), product.brand, product.categoryExternalId,
            product.price, product.oldPrice, product.currency, product.availability, product.visible,
            product.primaryImageUrl, product.canonicalUrl, product.popularity,
            JSON.stringify(product.characteristics), JSON.stringify(product.source), signature, runId
          ]);
          existingProduct = { id: productId, external_id: product.externalId, sync_signature: signature, active: true };
          existingProducts.set(product.externalId, existingProduct);
        } else if (!existingProduct.active || existingProduct.sync_signature !== signature) {
          await client.query(`
            UPDATE search_horoshop_products
            SET generation = $3, parent_external_id = $4, sku = $5, titles = $6::jsonb,
                descriptions = $7::jsonb, brand = $8, category_external_id = $9, price = $10,
                old_price = $11, currency = $12, availability = $13, visible = $14,
                primary_image_url = $15, canonical_url = $16, popularity = $17,
                characteristics = $18::jsonb, source_data = $19::jsonb, sync_signature = $20,
                active = TRUE, last_seen_sync_id = $21, updated_at = NOW()
            WHERE id = $1 AND connection_id = $2
          `, [
            existingProduct.id, connection.id, connection.generation, product.parentExternalId,
            product.sku, JSON.stringify(product.titles), JSON.stringify(product.descriptions),
            product.brand, product.categoryExternalId, product.price, product.oldPrice,
            product.currency, product.availability, product.visible, product.primaryImageUrl,
            product.canonicalUrl, product.popularity, JSON.stringify(product.characteristics),
            JSON.stringify(product.source), signature, runId
          ]);
          existingProduct.sync_signature = signature;
          existingProduct.active = true;
        }
        for (const modification of product.modifications) {
          const modificationSignature = syncSignature({ productExternalId: product.externalId, ...modification });
          const existingModification = existingModifications.get(modification.externalId);
          if (!existingModification) {
            const id = randomUUID();
            await client.query(`
              INSERT INTO search_horoshop_modifications (
                id, connection_id, product_id, generation, external_id, sku, titles, price,
                old_price, currency, availability, visible, image_url, page_url, attributes,
                source_data, sync_signature, active, last_seen_sync_id
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13, $14,
                $15::jsonb, $16::jsonb, $17, TRUE, $18
              )
            `, [
              id, connection.id, productId, connection.generation,
              modification.externalId, modification.sku, JSON.stringify(modification.titles),
              modification.price, modification.oldPrice, modification.currency,
              modification.availability, modification.visible, modification.imageUrl,
              modification.pageUrl, JSON.stringify(modification.attributes),
              JSON.stringify(modification.source), modificationSignature, runId
            ]);
            existingModifications.set(modification.externalId, {
              id, product_id: productId, external_id: modification.externalId,
              sync_signature: modificationSignature, active: true
            });
            continue;
          }
          if (existingModification.active && existingModification.product_id === productId
            && existingModification.sync_signature === modificationSignature) continue;
          await client.query(`
            UPDATE search_horoshop_modifications
            SET product_id = $3, generation = $4, sku = $5, titles = $6::jsonb,
                price = $7, old_price = $8, currency = $9, availability = $10,
                visible = $11, image_url = $12, page_url = $13, attributes = $14::jsonb,
                source_data = $15::jsonb, sync_signature = $16, active = TRUE,
                last_seen_sync_id = $17, updated_at = NOW()
            WHERE id = $1 AND connection_id = $2
          `, [
            existingModification.id, connection.id, productId, connection.generation,
            modification.sku, JSON.stringify(modification.titles), modification.price,
            modification.oldPrice, modification.currency, modification.availability,
            modification.visible, modification.imageUrl, modification.pageUrl,
            JSON.stringify(modification.attributes), JSON.stringify(modification.source),
            modificationSignature, runId
          ]);
          existingModification.product_id = productId;
          existingModification.sync_signature = modificationSignature;
          existingModification.active = true;
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

  async completeSync(connection, runId, counts, seenExternalIds) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.assertWritableConnection(client, connection);
      await client.query(`
        UPDATE search_horoshop_categories
        SET active = FALSE, updated_at = NOW()
        WHERE connection_id = $1 AND generation = $2 AND active
          AND NOT (external_id = ANY($3::text[]))
      `, [connection.id, connection.generation, seenExternalIds.categories]);
      await client.query(`
        UPDATE search_horoshop_products
        SET active = FALSE, updated_at = NOW()
        WHERE connection_id = $1 AND generation = $2 AND active
          AND NOT (external_id = ANY($3::text[]))
      `, [connection.id, connection.generation, seenExternalIds.products]);
      await client.query(`
        UPDATE search_horoshop_modifications
        SET active = FALSE, updated_at = NOW()
        WHERE connection_id = $1 AND generation = $2 AND active
          AND NOT (external_id = ANY($3::text[]))
      `, [connection.id, connection.generation, seenExternalIds.modifications]);
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
          (SELECT COUNT(*) FROM search_horoshop_modifications WHERE connection_id = $1) AS modifications,
          (SELECT COUNT(*) FROM search_horoshop_photo_selections WHERE connection_id = $1) AS photo_selections,
          (SELECT COUNT(*) FROM search_horoshop_photo_drafts WHERE connection_id = $1) AS photo_drafts,
          (SELECT COUNT(*) FROM search_horoshop_photo_assets AS photo_asset
            INNER JOIN search_horoshop_photo_drafts AS photo_draft ON photo_draft.id = photo_asset.draft_id
            WHERE photo_draft.connection_id = $1)
          +
          (SELECT COUNT(*) FROM search_horoshop_photo_run_uploads AS upload
            INNER JOIN search_horoshop_photo_runs AS run ON run.id = upload.run_id
            INNER JOIN search_horoshop_photo_drafts AS photo_draft ON photo_draft.id = run.draft_id
            WHERE photo_draft.connection_id = $1) AS photo_assets
      `, [connection.id]);
      const photoMediaResult = await client.query(`
        SELECT DISTINCT media.media_asset_id
        FROM (
          SELECT photo_asset.media_asset_id
          FROM search_horoshop_photo_assets AS photo_asset
          INNER JOIN search_horoshop_photo_drafts AS photo_draft ON photo_draft.id = photo_asset.draft_id
          WHERE photo_draft.connection_id = $1

          UNION

          SELECT upload.media_asset_id
          FROM search_horoshop_photo_run_uploads AS upload
          INNER JOIN search_horoshop_photo_runs AS run ON run.id = upload.run_id
          INNER JOIN search_horoshop_photo_drafts AS photo_draft ON photo_draft.id = run.draft_id
          WHERE photo_draft.connection_id = $1
        ) AS media
      `, [connection.id]);
      const photoMediaIds = photoMediaResult.rows.map((row) => row.media_asset_id);
      const photoFolderResult = await client.query(`
        SELECT DISTINCT folder.id, folder.parent_id
        FROM search_horoshop_photo_drafts AS photo_draft
        INNER JOIN media_library_folders AS folder ON folder.id = photo_draft.media_folder_id
        WHERE photo_draft.connection_id = $1
      `, [connection.id]);
      let mediaRows = [];
      if (photoMediaIds.length) {
        const mediaPlaceholders = photoMediaIds.map((_, index) => `$${index + 1}`).join(', ');
        const mediaResult = await client.query(`
          SELECT id, storage_key FROM media_library_assets
          WHERE id IN (${mediaPlaceholders})
        `, photoMediaIds);
        mediaRows = mediaResult.rows;
        await client.query(`
          DELETE FROM media_library_assets
          WHERE id IN (${mediaPlaceholders})
        `, photoMediaIds);
      }
      const deleteEmptyFolders = async (folderIds) => {
        if (!folderIds.length) return;
        const placeholders = folderIds.map((_, index) => `$${index + 1}`).join(', ');
        const [foldersWithAssets, foldersWithChildren] = await Promise.all([
          client.query(`
            SELECT DISTINCT folder_id AS id FROM media_library_assets
            WHERE folder_id IN (${placeholders})
          `, folderIds),
          client.query(`
            SELECT DISTINCT parent_id AS id FROM media_library_folders
            WHERE parent_id IN (${placeholders})
          `, folderIds)
        ]);
        const blocked = new Set([
          ...foldersWithAssets.rows.map((row) => row.id),
          ...foldersWithChildren.rows.map((row) => row.id)
        ]);
        const emptyIds = folderIds.filter((id) => !blocked.has(id));
        if (!emptyIds.length) return;
        const emptyPlaceholders = emptyIds.map((_, index) => `$${index + 1}`).join(', ');
        await client.query(`
          DELETE FROM media_library_folders WHERE id IN (${emptyPlaceholders})
        `, emptyIds);
      };
      const productFolderIds = photoFolderResult.rows.map((row) => row.id);
      await deleteEmptyFolders(productFolderIds);
      const rootFolderIds = [...new Set(photoFolderResult.rows.map((row) => row.parent_id).filter(Boolean))];
      await deleteEmptyFolders(rootFolderIds);
      await client.query('DELETE FROM search_horoshop_connections WHERE id = $1 AND generation = $2', [
        connection.id, connection.generation
      ]);
      for (const table of [
        'search_horoshop_categories', 'search_horoshop_products',
        'search_horoshop_modifications', 'search_horoshop_sync_runs',
        'search_horoshop_photo_selections', 'search_horoshop_photo_drafts',
        'search_horoshop_photo_batches'
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
          modifications: Number(countsResult.rows[0]?.modifications || 0),
          photoSelections: Number(countsResult.rows[0]?.photo_selections || 0),
          photoDrafts: Number(countsResult.rows[0]?.photo_drafts || 0),
          photoAssets: Number(countsResult.rows[0]?.photo_assets || 0)
        }
      })]);
      await client.query('COMMIT');
      return {
        categories: Number(countsResult.rows[0]?.categories || 0),
        products: Number(countsResult.rows[0]?.products || 0),
        modifications: Number(countsResult.rows[0]?.modifications || 0),
        mediaStorageKeys: mediaRows.map((row) => row.storage_key)
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
