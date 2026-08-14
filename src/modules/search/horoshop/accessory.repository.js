import { randomUUID } from 'node:crypto';
import { pool as defaultPool } from '../../../db/pool.js';
import { codexReviewCatalogRevision } from './accessory-review.js';

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
        SELECT link.id, link.target_key, link.target_type,
               CASE WHEN link.codex_proposed = TRUE THEN 'codex' ELSE link.source END AS source,
               link.selected,
               link.published, link.position, link.reason,
               link.compatibility_score, link.utility_score, link.availability_score,
               link.popularity_score, link.total_score,
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
        WHERE link.set_id = $1
        ORDER BY link.selected DESC, link.position, link.created_at
      `, [state.set.id]),
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
        suggestions: links.filter((item) => !item.selected && item.source === 'codex')
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
        WHERE set_id = $1 AND selected = FALSE AND published = FALSE
          AND source = 'manual' AND codex_proposed = FALSE
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

  async loadCodexReviewCatalog() {
    const connectionResult = await this.pool.query(`
      SELECT id, generation, status, store_domain
      FROM search_horoshop_connections
      WHERE singleton = TRUE
      LIMIT 1
    `);
    const connection = connectionResult.rows[0];
    if (!connection) return null;
    const [productsResult, modificationsResult] = await Promise.all([
      this.pool.query(`
        SELECT product.id, product.sku, product.titles, product.brand, product.category_external_id,
               product.descriptions, product.price, product.old_price, product.currency,
               product.characteristics, product.popularity, product.visible, product.active,
               product.availability, product.canonical_url, category.titles AS category_titles
        FROM search_horoshop_products AS product
        LEFT JOIN search_horoshop_categories AS category
          ON category.connection_id = product.connection_id
          AND category.external_id = product.category_external_id
        WHERE product.connection_id = $1 AND product.active = TRUE
      `, [connection.id]),
      this.pool.query(`
        SELECT id, product_id, sku, titles, price, old_price, currency, availability,
               visible, active, attributes
        FROM search_horoshop_modifications
        WHERE connection_id = $1 AND active = TRUE
      `, [connection.id])
    ]);
    const modificationsByProduct = new Map();
    for (const row of modificationsResult.rows) {
      const values = modificationsByProduct.get(row.product_id) || [];
      values.push({
        id: row.id,
        sku: row.sku,
        titles: jsonObject(row.titles),
        price: row.price,
        oldPrice: row.old_price,
        currency: row.currency,
        availability: row.availability,
        visible: row.visible,
        active: row.active,
        attributes: jsonObject(row.attributes)
      });
      modificationsByProduct.set(row.product_id, values);
    }
    for (const values of modificationsByProduct.values()) {
      values.sort((left, right) => left.id.localeCompare(right.id));
    }
    const products = productsResult.rows.map((row) => ({
      id: row.id,
      sku: row.sku,
      titles: jsonObject(row.titles),
      descriptions: jsonObject(row.descriptions),
      brand: row.brand,
      categoryExternalId: row.category_external_id,
      categoryTitles: jsonObject(row.category_titles),
      characteristics: jsonObject(row.characteristics),
      popularity: row.popularity,
      price: row.price,
      oldPrice: row.old_price,
      currency: row.currency,
      availability: row.availability,
      visible: row.visible,
      active: row.active,
      canonicalUrl: row.canonical_url,
      modifications: modificationsByProduct.get(row.id) || []
    })).sort((left, right) => left.id.localeCompare(right.id));
    return {
      connection: {
        id: connection.id,
        generation: connection.generation,
        status: connection.status,
        storeDomain: connection.store_domain
      },
      products
    };
  }

  async saveCodexReview(connectionGeneration, catalogRevision, products, actorUserId) {
    const catalog = await this.loadCodexReviewCatalog();
    if (!catalog || catalog.connection.generation !== connectionGeneration
      || catalog.connection.status !== 'connected'
      || codexReviewCatalogRevision(catalog.products) !== catalogRevision) {
      return null;
    }

    const setsResult = await this.pool.query(`
      SELECT id, product_id
      FROM search_horoshop_accessory_sets
      WHERE connection_id = $1
    `, [catalog.connection.id]);
    const setByProduct = new Map(setsResult.rows.map((row) => [row.product_id, row.id]));
    for (const item of products) {
      if (item.recommendations.length === 0 || setByProduct.has(item.productId)) continue;
      const state = await this.ensureSet(item.productId, actorUserId);
      if (!state?.set || state.context.connection.generation !== connectionGeneration) return null;
      setByProduct.set(item.productId, state.set.id);
    }

    const reviewedSets = products
      .map((item) => ({ ...item, setId: setByProduct.get(item.productId) }))
      .filter((item) => item.setId);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const currentConnection = await client.query(`
        SELECT id
        FROM search_horoshop_connections
        WHERE singleton = TRUE AND id = $1 AND generation = $2 AND status = 'connected'
        LIMIT 1
      `, [catalog.connection.id, connectionGeneration]);
      if (currentConnection.rowCount === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      if (reviewedSets.length > 0) {
        const placeholders = reviewedSets.map((_, index) => `$${index + 1}`).join(', ');
        const setIds = reviewedSets.map((item) => item.setId);
        await client.query(`
          DELETE FROM search_horoshop_accessory_links
          WHERE set_id IN (${placeholders}) AND codex_proposed = TRUE
            AND selected = FALSE AND published = FALSE
        `, setIds);
        await client.query(`
          UPDATE search_horoshop_accessory_sets
          SET updated_by = $${setIds.length + 1}, updated_at = NOW()
          WHERE id IN (${placeholders})
        `, [...setIds, actorUserId || null]);
      }

      let savedRecommendations = 0;
      for (const item of reviewedSets) {
        let position = 100;
        for (const recommendation of item.recommendations) {
          position += 1;
          const inserted = await client.query(`
            INSERT INTO search_horoshop_accessory_links (
              id, set_id, target_key, target_type, accessory_product_id,
              source, codex_proposed, selected, position, reason,
              compatibility_score, utility_score, availability_score,
              popularity_score, total_score
            ) VALUES ($1, $2, $3, 'product', $4, 'manual', TRUE, FALSE, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (set_id, target_key) DO NOTHING
            RETURNING id
          `, [
            randomUUID(), item.setId, `product:${recommendation.productId}`,
            recommendation.productId, position, recommendation.reason,
            recommendation.scores.compatibility, recommendation.scores.utility,
            recommendation.scores.availability, recommendation.scores.popularity,
            recommendation.scores.total
          ]);
          savedRecommendations += inserted.rowCount;
        }
      }
      await client.query('COMMIT');
      return { savedRecommendations };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async acceptCodexProposals(connectionId, productId, actorUserId) {
    const params = productId ? [connectionId, productId] : [connectionId];
    const productFilter = productId ? 'AND accessory_set.product_id = $2' : '';
    const [setsResult, proposalsResult] = await Promise.all([
      this.pool.query(`
        SELECT accessory_set.id, accessory_set.product_id,
               COUNT(selected_link.id) AS selected_product_count
        FROM search_horoshop_accessory_sets AS accessory_set
        LEFT JOIN search_horoshop_accessory_links AS selected_link
          ON selected_link.set_id = accessory_set.id
          AND selected_link.target_type = 'product'
          AND selected_link.selected = TRUE
        WHERE accessory_set.connection_id = $1 ${productFilter}
        GROUP BY accessory_set.id, accessory_set.product_id
      `, params),
      this.pool.query(`
        SELECT proposal.id, proposal.set_id, accessory_set.product_id
        FROM search_horoshop_accessory_links AS proposal
        INNER JOIN search_horoshop_accessory_sets AS accessory_set
          ON accessory_set.id = proposal.set_id
        WHERE accessory_set.connection_id = $1 ${productFilter}
          AND proposal.target_type = 'product'
          AND proposal.codex_proposed = TRUE
          AND proposal.selected = FALSE
        ORDER BY proposal.set_id, proposal.position, proposal.created_at
      `, params)
    ]);

    const selectedCountBySet = new Map(setsResult.rows.map((row) => [
      row.id,
      Number(row.selected_product_count || 0)
    ]));
    const acceptedIds = [];
    let recommendationsSkipped = 0;
    for (const proposal of proposalsResult.rows) {
      const selectedCount = selectedCountBySet.get(proposal.set_id) || 0;
      if (selectedCount >= 16) {
        recommendationsSkipped += 1;
        continue;
      }
      acceptedIds.push(proposal.id);
      selectedCountBySet.set(proposal.set_id, selectedCount + 1);
    }

    if (acceptedIds.length === 0) {
      return { productsUpdated: 0, recommendationsAdded: 0, recommendationsSkipped };
    }

    const client = await this.pool.connect();
    let savedSetIds = [];
    let recommendationsAdded = 0;
    try {
      await client.query('BEGIN');
      const proposalPlaceholders = acceptedIds.map((_, index) => `$${index + 1}`).join(', ');
      const acceptedResult = await client.query(`
        UPDATE search_horoshop_accessory_links
        SET selected = TRUE, updated_at = NOW()
        WHERE id IN (${proposalPlaceholders})
          AND codex_proposed = TRUE AND selected = FALSE
        RETURNING set_id
      `, acceptedIds);
      recommendationsAdded = acceptedResult.rowCount;
      savedSetIds = [...new Set(acceptedResult.rows.map((row) => row.set_id))];
      if (savedSetIds.length > 0) {
        const setPlaceholders = savedSetIds.map((_, index) => `$${index + 1}`).join(', ');
        await client.query(`
          UPDATE search_horoshop_accessory_sets
          SET updated_by = $${savedSetIds.length + 1}, updated_at = NOW()
          WHERE id IN (${setPlaceholders})
        `, [...savedSetIds, actorUserId || null]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return {
      productsUpdated: savedSetIds.length,
      recommendationsAdded,
      recommendationsSkipped
    };
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

  async bulkPublicationPayloads() {
    const connectionResult = await this.pool.query(`
      SELECT id, generation, status, store_domain, encrypted_credentials
      FROM search_horoshop_connections
      WHERE singleton = TRUE
      LIMIT 1
    `);
    const connectionRow = connectionResult.rows[0];
    if (!connectionRow) return null;

    const connection = {
      id: connectionRow.id,
      generation: connectionRow.generation,
      status: connectionRow.status,
      storeDomain: connectionRow.store_domain,
      encryptedCredentials: connectionRow.encrypted_credentials
    };
    const setsResult = await this.pool.query(`
      SELECT accessory_set.id AS set_id, product.id AS product_id, product.sku AS product_sku
      FROM search_horoshop_accessory_sets AS accessory_set
      INNER JOIN search_horoshop_products AS product
        ON product.id = accessory_set.product_id
      INNER JOIN (
        SELECT DISTINCT set_id
        FROM search_horoshop_accessory_links
        WHERE selected <> published
      ) AS dirty_set ON dirty_set.set_id = accessory_set.id
      WHERE accessory_set.connection_id = $1
        AND accessory_set.generation = $2
        AND product.active = TRUE
      ORDER BY accessory_set.updated_at, product.sku
    `, [connection.id, connection.generation]);
    if (setsResult.rows.length === 0) return { connection, payloads: [] };

    const setIds = setsResult.rows.map((row) => row.set_id);
    const placeholders = setIds.map((_, index) => `$${index + 1}`).join(', ');
    const linksResult = await this.pool.query(`
      SELECT link.set_id, link.target_type,
             product.id AS product_id, product.sku,
             category.id AS category_id, category.external_id
      FROM search_horoshop_accessory_links AS link
      LEFT JOIN search_horoshop_products AS product ON product.id = link.accessory_product_id
      LEFT JOIN search_horoshop_categories AS category ON category.id = link.accessory_category_id
      WHERE link.set_id IN (${placeholders}) AND link.selected = TRUE
      ORDER BY link.set_id, link.position, link.created_at
    `, setIds);
    const linksBySet = new Map();
    for (const row of linksResult.rows) {
      const links = linksBySet.get(row.set_id) || [];
      links.push(row);
      linksBySet.set(row.set_id, links);
    }

    return {
      connection,
      payloads: setsResult.rows.map((row) => {
        const links = linksBySet.get(row.set_id) || [];
        return {
          context: {
            connection,
            product: { id: row.product_id, sku: row.product_sku }
          },
          set: { id: row.set_id },
          products: links
            .filter((link) => link.target_type === 'product')
            .map((link) => ({ id: link.product_id, sku: link.sku })),
          categories: links
            .filter((link) => link.target_type === 'category')
            .map((link) => ({ id: link.category_id, externalId: link.external_id }))
        };
      })
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

  async startPublications(payloads, actorUserId) {
    if (payloads.length === 0) return [];
    const publications = payloads.map((payload) => ({
      id: randomUUID(),
      setId: payload.set.id,
      targetKeys: [
        ...payload.products.map((item) => `product:${item.id}`),
        ...payload.categories.map((item) => `category:${item.id}`)
      ]
    }));
    const values = [];
    const placeholders = payloads.map((payload, index) => {
      const offset = index * 8;
      values.push(
        publications[index].id,
        payload.context.connection.id,
        payload.context.connection.generation,
        payload.context.product.id,
        actorUserId || null,
        payload.context.product.sku,
        payload.products.length,
        payload.categories.length
      );
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8})`;
    }).join(', ');
    await this.pool.query(`
      INSERT INTO search_horoshop_accessory_publications (
        id, connection_id, generation, product_id, actor_user_id, product_sku,
        product_accessory_count, category_accessory_count
      ) VALUES ${placeholders}
    `, values);
    return publications;
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

  async completePublications(publications, actorUserId) {
    if (publications.length === 0) return;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const publicationIds = publications.map((item) => item.id);
      const publicationPlaceholders = publicationIds.map((_, index) => `$${index + 1}`).join(', ');
      await client.query(`
        UPDATE search_horoshop_accessory_publications
        SET status = 'succeeded', completed_at = NOW()
        WHERE id IN (${publicationPlaceholders}) AND status = 'running'
      `, publicationIds);

      const setIds = publications.map((item) => item.setId);
      const setPlaceholders = setIds.map((_, index) => `$${index + 1}`).join(', ');
      await client.query(`
        UPDATE search_horoshop_accessory_links
        SET published = FALSE, updated_at = NOW()
        WHERE set_id IN (${setPlaceholders})
      `, setIds);

      const chunkSize = 250;
      for (let offset = 0; offset < publications.length; offset += chunkSize) {
        const chunk = publications.slice(offset, offset + chunkSize)
          .filter((item) => item.targetKeys.length > 0);
        if (chunk.length === 0) continue;
        const values = [];
        const targetConditions = chunk.map((item) => {
          values.push(item.setId);
          const setPlaceholder = `$${values.length}`;
          const keyPlaceholders = item.targetKeys.map((targetKey) => {
            values.push(targetKey);
            return `$${values.length}`;
          }).join(', ');
          return `(set_id = ${setPlaceholder} AND target_key IN (${keyPlaceholders}))`;
        }).join(' OR ');
        await client.query(`
          UPDATE search_horoshop_accessory_links
          SET published = TRUE, updated_at = NOW()
          WHERE ${targetConditions}
        `, values);
      }

      await client.query(`
        UPDATE search_horoshop_accessory_sets
        SET published_at = NOW(), published_by = $${setIds.length + 1}, updated_at = NOW()
        WHERE id IN (${setPlaceholders})
      `, [...setIds, actorUserId || null]);
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

  async failPublications(publicationIds, error) {
    if (publicationIds.length === 0) return;
    const placeholders = publicationIds.map((_, index) => `$${index + 2}`).join(', ');
    await this.pool.query(`
      UPDATE search_horoshop_accessory_publications
      SET status = 'failed', error_message = $1, completed_at = NOW()
      WHERE id IN (${placeholders}) AND status = 'running'
    `, [String(error instanceof Error ? error.message : error).slice(0, 1000), ...publicationIds]);
  }
}
