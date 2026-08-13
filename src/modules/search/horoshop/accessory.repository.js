import { randomUUID } from 'node:crypto';
import { pool as defaultPool } from '../../../db/pool.js';
import { ACCESSORY_RECOMMENDER_VERSION } from './accessory-recommender.js';

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

function score(value) {
  return value === null || value === undefined ? null : Number(value);
}

function mapProduct(row) {
  return {
    id: row.id,
    sku: row.sku,
    titles: jsonObject(row.titles),
    brand: row.brand,
    categoryExternalId: row.category_external_id,
    price: row.price,
    currency: row.currency,
    availability: row.availability,
    visible: row.visible,
    active: row.active,
    primaryImageUrl: row.primary_image_url,
    canonicalUrl: row.canonical_url
  };
}

function sourceAccessories(sourceData) {
  const source = jsonObject(sourceData);
  const known = Object.hasOwn(source, 'accessories');
  const items = Array.isArray(source.accessories) ? source.accessories : [];
  return {
    known,
    items: items.map((item) => {
      if (typeof item === 'string') return { type: 'article', value: item.trim() };
      const record = jsonObject(item);
      if (record.article) return { type: 'article', value: String(record.article).trim() };
      const page = jsonObject(record.page);
      if (page.id) return { type: 'category', value: String(page.id).trim() };
      return null;
    }).filter((item) => item?.value)
  };
}

export class HoroshopAccessoryRepository {
  constructor(databasePool = defaultPool) {
    this.pool = databasePool;
  }

  async getContext(productId) {
    const result = await this.pool.query(`
      SELECT connection.id AS connection_id, connection.generation, connection.status,
             connection.store_domain, connection.encrypted_credentials,
             product.id, product.sku, product.titles, product.brand, product.category_external_id,
             product.price, product.currency, product.availability, product.visible, product.active,
             product.primary_image_url, product.canonical_url, product.characteristics,
             product.popularity, product.source_data,
             category.titles AS category_titles
      FROM search_horoshop_connections AS connection
      INNER JOIN search_horoshop_products AS product
        ON product.connection_id = connection.id AND product.id = $1
      LEFT JOIN search_horoshop_categories AS category
        ON category.connection_id = connection.id
        AND category.external_id = product.category_external_id
      WHERE connection.singleton = TRUE
      LIMIT 1
    `, [productId]);
    const row = result.rows[0];
    if (!row) return null;
    return {
      connection: {
        id: row.connection_id,
        generation: row.generation,
        status: row.status,
        storeDomain: row.store_domain,
        encryptedCredentials: row.encrypted_credentials
      },
      product: {
        ...mapProduct(row),
        characteristics: jsonObject(row.characteristics),
        popularity: row.popularity,
        sourceData: jsonObject(row.source_data),
        categoryTitles: jsonObject(row.category_titles)
      }
    };
  }

  async ensureSet(productId, actorUserId) {
    const context = await this.getContext(productId);
    if (!context) return null;
    const inserted = await this.pool.query(`
      INSERT INTO search_horoshop_accessory_sets (
        id, connection_id, generation, product_id, updated_by
      ) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (connection_id, product_id) DO NOTHING
      RETURNING id
    `, [randomUUID(), context.connection.id, context.connection.generation, productId, actorUserId || null]);
    if (inserted.rowCount > 0) {
      await this.hydrateImportedAccessories(inserted.rows[0].id, context);
    }
    const result = await this.pool.query(`
      SELECT id, catalog_state_known, initialized_at, published_at
      FROM search_horoshop_accessory_sets
      WHERE connection_id = $1 AND product_id = $2
      LIMIT 1
    `, [context.connection.id, productId]);
    return { context, set: result.rows[0] || null };
  }

  async hydrateImportedAccessories(setId, context) {
    const imported = sourceAccessories(context.product.sourceData);
    await this.pool.query(`
      UPDATE search_horoshop_accessory_sets
      SET catalog_state_known = $2, updated_at = NOW()
      WHERE id = $1
    `, [setId, imported.known]);
    for (const reference of imported.items) {
      if (reference.type === 'article') {
        const product = await this.pool.query(`
          SELECT product.id
          FROM search_horoshop_products AS product
          WHERE product.connection_id = $1 AND product.id <> $2 AND (
            product.sku = $3 OR product.id IN (
              SELECT modification.product_id
              FROM search_horoshop_modifications AS modification
              WHERE modification.connection_id = $1 AND modification.sku = $3
            )
          )
          LIMIT 1
        `, [context.connection.id, context.product.id, reference.value]);
        if (product.rows[0]) {
          await this.insertImportedLink(setId, 'product', product.rows[0].id);
        }
      } else {
        const category = await this.pool.query(`
          SELECT id FROM search_horoshop_categories
          WHERE connection_id = $1 AND external_id = $2 AND active = TRUE
          LIMIT 1
        `, [context.connection.id, reference.value]);
        if (category.rows[0]) await this.insertImportedLink(setId, 'category', category.rows[0].id);
      }
    }
  }

  async insertImportedLink(setId, type, targetId) {
    await this.pool.query(`
      INSERT INTO search_horoshop_accessory_links (
        id, set_id, target_key, target_type, accessory_product_id, accessory_category_id,
        source, selected, published
      ) VALUES ($1, $2, $3, $4, $5, $6, 'imported', TRUE, TRUE)
      ON CONFLICT (set_id, target_key) DO NOTHING
    `, [
      randomUUID(), setId, `${type}:${targetId}`, type,
      type === 'product' ? targetId : null,
      type === 'category' ? targetId : null
    ]);
  }

  async getDetail(productId, actorUserId) {
    const state = await this.ensureSet(productId, actorUserId);
    if (!state?.set) return null;
    const [linksResult, publicationResult] = await Promise.all([
      this.pool.query(`
        SELECT link.id, link.target_key, link.target_type, link.source, link.selected,
               link.published, link.position, link.compatibility_score, link.utility_score,
               link.availability_score, link.popularity_score, link.total_score, link.reason,
               product.id AS accessory_product_id, product.sku AS accessory_sku,
               product.titles AS accessory_titles, product.brand AS accessory_brand,
               product.price AS accessory_price, product.currency AS accessory_currency,
               product.availability AS accessory_availability, product.visible AS accessory_visible,
               product.active AS accessory_active, product.primary_image_url AS accessory_image_url,
               category.id AS accessory_category_id, category.external_id AS accessory_category_external_id,
               category.titles AS accessory_category_titles
        FROM search_horoshop_accessory_links AS link
        LEFT JOIN search_horoshop_products AS product ON product.id = link.accessory_product_id
        LEFT JOIN search_horoshop_categories AS category ON category.id = link.accessory_category_id
        WHERE link.set_id = $1 AND (
          link.source <> 'algorithm' OR link.selected = TRUE OR link.published = TRUE
          OR link.algorithm_version = $2
        )
        ORDER BY link.selected DESC, link.position, link.total_score DESC NULLS LAST, link.created_at
      `, [state.set.id, ACCESSORY_RECOMMENDER_VERSION]),
      this.pool.query(`
        SELECT id, status, product_accessory_count, category_accessory_count,
               error_message, started_at, completed_at
        FROM search_horoshop_accessory_publications
        WHERE connection_id = $1 AND product_id = $2
        ORDER BY started_at DESC
        LIMIT 1
      `, [state.context.connection.id, productId])
    ]);
    const links = linksResult.rows.map((row) => this.mapLink(row));
    return {
      product: mapProduct({
        id: state.context.product.id,
        sku: state.context.product.sku,
        titles: state.context.product.titles,
        brand: state.context.product.brand,
        category_external_id: state.context.product.categoryExternalId,
        price: state.context.product.price,
        currency: state.context.product.currency,
        availability: state.context.product.availability,
        visible: state.context.product.visible,
        active: state.context.product.active,
        primary_image_url: state.context.product.primaryImageUrl,
        canonical_url: state.context.product.canonicalUrl
      }),
      draft: {
        catalogStateKnown: state.set.catalog_state_known,
        initializedAt: state.set.initialized_at,
        publishedAt: state.set.published_at,
        isDirty: links.some((item) => item.selected !== item.published),
        selected: links.filter((item) => item.selected),
        suggestions: links.filter((item) => !item.selected && item.source === 'algorithm')
      },
      latestPublication: this.mapPublication(publicationResult.rows[0])
    };
  }

  mapLink(row) {
    const target = row.target_type === 'product' ? {
      type: 'product',
      id: row.accessory_product_id,
      sku: row.accessory_sku,
      titles: jsonObject(row.accessory_titles),
      brand: row.accessory_brand,
      price: row.accessory_price,
      currency: row.accessory_currency,
      availability: row.accessory_availability,
      visible: row.accessory_visible,
      active: row.accessory_active,
      imageUrl: row.accessory_image_url
    } : {
      type: 'category',
      id: row.accessory_category_id,
      externalId: row.accessory_category_external_id,
      titles: jsonObject(row.accessory_category_titles)
    };
    return {
      id: row.id,
      key: row.target_key,
      source: row.source,
      selected: row.selected,
      published: row.published,
      position: Number(row.position || 0),
      scores: {
        compatibility: score(row.compatibility_score),
        utility: score(row.utility_score),
        availability: score(row.availability_score),
        popularity: score(row.popularity_score),
        total: score(row.total_score)
      },
      reason: row.reason,
      target
    };
  }

  mapPublication(row) {
    if (!row) return null;
    return {
      id: row.id,
      status: row.status,
      productAccessoryCount: Number(row.product_accessory_count || 0),
      categoryAccessoryCount: Number(row.category_accessory_count || 0),
      errorMessage: row.error_message,
      startedAt: row.started_at,
      completedAt: row.completed_at
    };
  }

  async searchCandidates(productId, search, limit = 20) {
    const context = await this.getContext(productId);
    if (!context) return null;
    const query = `%${String(search || '').trim().toLocaleLowerCase('uk-UA')}%`;
    const [productsResult, categoriesResult] = await Promise.all([
      this.pool.query(`
        SELECT product.id, product.sku, product.titles, product.brand, product.category_external_id,
               product.price, product.currency, product.availability, product.visible, product.active,
               product.primary_image_url, product.canonical_url
        FROM search_horoshop_products AS product
        WHERE product.connection_id = $1 AND product.id <> $2 AND product.active = TRUE AND (
          LOWER(product.sku) LIKE $3 OR LOWER(COALESCE(product.brand, '')) LIKE $3
          OR LOWER(CAST(product.titles AS TEXT)) LIKE $3
          OR product.id IN (
            SELECT modification.product_id FROM search_horoshop_modifications AS modification
            WHERE modification.connection_id = $1 AND (
              LOWER(modification.sku) LIKE $3 OR LOWER(CAST(modification.titles AS TEXT)) LIKE $3
            )
          )
        )
        ORDER BY product.visible DESC, product.updated_at DESC
        LIMIT $4
      `, [context.connection.id, productId, query, limit]),
      this.pool.query(`
        SELECT category.id, category.external_id, category.titles
        FROM search_horoshop_categories AS category
        WHERE category.connection_id = $1 AND category.active = TRUE
          AND LOWER(CAST(category.titles AS TEXT)) LIKE $2
          AND category.external_id NOT IN (
            SELECT child.parent_external_id FROM search_horoshop_categories AS child
            WHERE child.connection_id = $1 AND child.active = TRUE
              AND child.parent_external_id IS NOT NULL
          )
        ORDER BY category.titles::text
        LIMIT $3
      `, [context.connection.id, query, Math.min(limit, 12)])
    ]);
    return {
      products: productsResult.rows.map(mapProduct),
      categories: categoriesResult.rows.map((row) => ({
        id: row.id, externalId: row.external_id, titles: jsonObject(row.titles)
      }))
    };
  }

  async resolveTargets(productId, items) {
    const context = await this.getContext(productId);
    if (!context) return null;
    const productIds = [...new Set(items.filter((item) => item.type === 'product').map((item) => item.id))];
    const categoryIds = [...new Set(items.filter((item) => item.type === 'category').map((item) => item.id))];
    let products = [];
    let categories = [];
    if (productIds.length > 0) {
      const placeholders = productIds.map((_, index) => `$${index + 3}`).join(', ');
      const result = await this.pool.query(`
        SELECT id, sku FROM search_horoshop_products
        WHERE connection_id = $1 AND id <> $2 AND active = TRUE AND id IN (${placeholders})
      `, [context.connection.id, productId, ...productIds]);
      products = result.rows;
    }
    if (categoryIds.length > 0) {
      const placeholders = categoryIds.map((_, index) => `$${index + 2}`).join(', ');
      const result = await this.pool.query(`
        SELECT category.id, category.external_id
        FROM search_horoshop_categories AS category
        WHERE category.connection_id = $1 AND category.active = TRUE
          AND category.id IN (${placeholders})
          AND category.external_id <> COALESCE($${categoryIds.length + 2}, '')
          AND category.external_id NOT IN (
            SELECT child.parent_external_id FROM search_horoshop_categories AS child
            WHERE child.connection_id = $1 AND child.active = TRUE
              AND child.parent_external_id IS NOT NULL
          )
      `, [context.connection.id, ...categoryIds, context.product.categoryExternalId]);
      categories = result.rows;
    }
    return { context, productIds, categoryIds, products, categories };
  }

  async saveDraft(productId, items, actorUserId) {
    const [state, resolved] = await Promise.all([
      this.ensureSet(productId, actorUserId),
      this.resolveTargets(productId, items)
    ]);
    if (!state?.set || !resolved) return null;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`UPDATE search_horoshop_accessory_links SET selected = FALSE, updated_at = NOW() WHERE set_id = $1`, [state.set.id]);
      let position = 0;
      for (const item of items) {
        position += 1;
        await client.query(`
          INSERT INTO search_horoshop_accessory_links (
            id, set_id, target_key, target_type, accessory_product_id,
            accessory_category_id, source, selected, position
          ) VALUES ($1, $2, $3, $4, $5, $6, 'manual', TRUE, $7)
          ON CONFLICT (set_id, target_key) DO UPDATE SET
            selected = TRUE, position = EXCLUDED.position, updated_at = NOW()
        `, [
          randomUUID(), state.set.id, `${item.type}:${item.id}`, item.type,
          item.type === 'product' ? item.id : null,
          item.type === 'category' ? item.id : null,
          position
        ]);
      }
      await client.query(`
        DELETE FROM search_horoshop_accessory_links
        WHERE set_id = $1 AND selected = FALSE AND published = FALSE AND source = 'manual'
      `, [state.set.id]);
      await client.query(`
        UPDATE search_horoshop_accessory_sets
        SET updated_by = $2, updated_at = NOW()
        WHERE id = $1
      `, [state.set.id, actorUserId]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return this.getDetail(productId, actorUserId);
  }

  async loadRecommendationCatalog(productId) {
    const catalog = await this.loadAllRecommendationCatalog();
    if (!catalog) return null;
    const target = catalog.products.find((product) => product.id === productId);
    if (!target) return null;
    return {
      target,
      candidates: catalog.products.filter((product) => product.id !== productId)
    };
  }

  async loadAllRecommendationCatalog() {
    const connectionResult = await this.pool.query(`
      SELECT id, generation, status
      FROM search_horoshop_connections
      WHERE singleton = TRUE
      LIMIT 1
    `);
    const connection = connectionResult.rows[0];
    if (!connection) return null;
    const [productsResult, modificationsResult] = await Promise.all([
      this.pool.query(`
        SELECT product.id, product.sku, product.titles, product.brand, product.category_external_id,
               product.characteristics, product.popularity, product.visible, product.active,
               product.availability, category.titles AS category_titles
        FROM search_horoshop_products AS product
        LEFT JOIN search_horoshop_categories AS category
          ON category.connection_id = product.connection_id
          AND category.external_id = product.category_external_id
        WHERE product.connection_id = $1 AND product.active = TRUE
      `, [connection.id]),
      this.pool.query(`
        SELECT product_id, availability
        FROM search_horoshop_modifications
        WHERE connection_id = $1 AND active = TRUE
      `, [connection.id])
    ]);
    const availabilityByProduct = new Map();
    for (const row of modificationsResult.rows) {
      const values = availabilityByProduct.get(row.product_id) || [];
      if (row.availability) values.push(row.availability);
      availabilityByProduct.set(row.product_id, values);
    }
    return {
      connection: {
        id: connection.id,
        generation: connection.generation,
        status: connection.status
      },
      products: productsResult.rows.map((row) => ({
        id: row.id,
        sku: row.sku,
        titles: jsonObject(row.titles),
        brand: row.brand,
        categoryTitles: jsonObject(row.category_titles),
        characteristics: jsonObject(row.characteristics),
        popularity: row.popularity,
        visible: row.visible,
        active: row.active,
        availabilities: availabilityByProduct.get(row.id) || (row.availability ? [row.availability] : [])
      }))
    };
  }

  async replaceRecommendations(productId, recommendations, actorUserId) {
    const state = await this.ensureSet(productId, actorUserId);
    if (!state?.set) return null;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        DELETE FROM search_horoshop_accessory_links
        WHERE set_id = $1 AND source = 'algorithm' AND selected = FALSE AND published = FALSE
      `, [state.set.id]);
      let position = 100;
      for (const item of recommendations) {
        position += 1;
        await client.query(`
          INSERT INTO search_horoshop_accessory_links (
            id, set_id, target_key, target_type, accessory_product_id, source,
            selected, position, compatibility_score, utility_score, availability_score,
            popularity_score, total_score, reason, algorithm_version
          ) VALUES ($1, $2, $3, 'product', $4, 'algorithm', FALSE, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (set_id, target_key) DO UPDATE SET
            compatibility_score = EXCLUDED.compatibility_score,
            utility_score = EXCLUDED.utility_score,
            availability_score = EXCLUDED.availability_score,
            popularity_score = EXCLUDED.popularity_score,
            total_score = EXCLUDED.total_score,
            reason = EXCLUDED.reason,
            algorithm_version = CASE
              WHEN search_horoshop_accessory_links.source = 'algorithm' THEN EXCLUDED.algorithm_version
              ELSE search_horoshop_accessory_links.algorithm_version
            END,
            updated_at = NOW()
        `, [
          randomUUID(), state.set.id, `product:${item.productId}`, item.productId, position,
          item.compatibilityScore, item.utilityScore, item.availabilityScore,
          item.popularityScore, item.totalScore, item.reason, ACCESSORY_RECOMMENDER_VERSION
        ]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return state;
  }

  async saveRecommendations(productId, recommendations, actorUserId) {
    const state = await this.replaceRecommendations(productId, recommendations, actorUserId);
    if (!state) return null;
    return this.getDetail(productId, actorUserId);
  }

  async publicationPayload(productId, actorUserId) {
    const state = await this.ensureSet(productId, actorUserId);
    if (!state?.set) return null;
    const result = await this.pool.query(`
      SELECT link.target_type, product.id AS product_id, product.sku,
             category.id AS category_id, category.external_id
      FROM search_horoshop_accessory_links AS link
      LEFT JOIN search_horoshop_products AS product ON product.id = link.accessory_product_id
      LEFT JOIN search_horoshop_categories AS category ON category.id = link.accessory_category_id
      WHERE link.set_id = $1 AND link.selected = TRUE
      ORDER BY link.position, link.created_at
    `, [state.set.id]);
    return {
      ...state,
      products: result.rows.filter((row) => row.target_type === 'product').map((row) => ({ id: row.product_id, sku: row.sku })),
      categories: result.rows.filter((row) => row.target_type === 'category').map((row) => ({ id: row.category_id, externalId: row.external_id }))
    };
  }

  async startPublication(payload, actorUserId) {
    const id = randomUUID();
    await this.pool.query(`
      INSERT INTO search_horoshop_accessory_publications (
        id, connection_id, generation, product_id, actor_user_id, product_sku,
        product_accessory_count, category_accessory_count
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      id, payload.context.connection.id, payload.context.connection.generation,
      payload.context.product.id, actorUserId, payload.context.product.sku,
      payload.products.length, payload.categories.length
    ]);
    return id;
  }

  async completePublication(publicationId, setId, actorUserId, publishedTargetKeys) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        UPDATE search_horoshop_accessory_publications
        SET status = 'succeeded', completed_at = NOW()
        WHERE id = $1 AND status = 'running'
      `, [publicationId]);
      await client.query(`
        UPDATE search_horoshop_accessory_links
        SET published = FALSE, updated_at = NOW()
        WHERE set_id = $1
      `, [setId]);
      for (const targetKey of publishedTargetKeys) {
        await client.query(`
          UPDATE search_horoshop_accessory_links
          SET published = TRUE, updated_at = NOW()
          WHERE set_id = $1 AND target_key = $2
        `, [setId, targetKey]);
      }
      await client.query(`
        UPDATE search_horoshop_accessory_sets
        SET published_at = NOW(), published_by = $2, updated_at = NOW()
        WHERE id = $1
      `, [setId, actorUserId]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async failPublication(publicationId, error) {
    await this.pool.query(`
      UPDATE search_horoshop_accessory_publications
      SET status = 'failed', error_message = $2, completed_at = NOW()
      WHERE id = $1 AND status = 'running'
    `, [publicationId, String(error instanceof Error ? error.message : error).slice(0, 1000)]);
  }
}
