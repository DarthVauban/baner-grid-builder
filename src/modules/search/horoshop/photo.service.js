import { env } from '../../../config/env.js';
import { pool as defaultPool } from '../../../db/pool.js';
import { AppError } from '../../../lib/app-error.js';
import { createMediaAsset, ensureMediaFolder } from '../../media/media.service.js';
import { removeMediaImage } from '../../media/media.storage.js';
import {
  findPhotoParserAdapter,
  loadPhotoParserAdapters
} from '../../catalog/photo-parser.adapters.js';
import { scrapePhotoParserProduct } from '../../catalog/photo-parser.browser.js';
import { convertPhotoParserImageToWebp } from '../../catalog/photo-parser.service.js';
import { decryptHoroshopCredentials } from './credential-cipher.js';
import { horoshopCatalogService } from './catalog.service.js';
import { HoroshopApiError, HoroshopClient } from './horoshop.client.js';
import { resolveHoroshopPhotoSelection } from './photo-selection.js';

const maximumSelectionEntries = 1_000;
const maximumDraftImages = 40;

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

function jsonArray(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function localizedTitle(value, fallback = '') {
  const titles = jsonObject(value);
  return String(titles.uk || titles.ua || titles.ru || titles.en || Object.values(titles)[0] || fallback || '').trim();
}

function photoTargetTitle(value, sku, fallback = '') {
  const normalizedSku = String(sku || '').trim().toLocaleLowerCase('uk-UA');
  for (const candidate of [localizedTitle(value), fallback]) {
    const title = String(candidate || '').trim();
    if (title && title.toLocaleLowerCase('uk-UA') !== normalizedSku) return title;
  }
  return 'Назва товару не вказана';
}

function cleanError(error, fallback = 'Не вдалося обробити фотографії товару') {
  if (error instanceof AppError) return error.message;
  if (error instanceof Error && error.message) return error.message.slice(0, 1_000);
  return fallback;
}

function sourcePhotoLinks(value, field) {
  const source = jsonObject(value);
  const block = source[field];
  const raw = Array.isArray(block)
    ? block
    : Array.isArray(block?.links) ? block.links : [];
  const links = [];
  for (const item of raw) {
    const candidate = typeof item === 'string' ? item : item?.url || item?.src || '';
    const url = String(candidate || '').trim();
    if (url && !links.includes(url)) links.push(url);
  }
  return links;
}

function selectionName(value) {
  const name = String(value || '').trim().replace(/\s+/gu, ' ').slice(0, 160);
  if (name) return name;
  return `Вибірка ${new Intl.DateTimeFormat('uk-UA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date())}`;
}

function targetKey(productId, modificationId = null) {
  return `${productId}:${modificationId || 'product'}`;
}

function serializeSelectionRow(row) {
  return {
    id: row.id,
    name: row.name,
    matchedCount: Number(row.matched_count || 0),
    ambiguousCount: Number(row.ambiguous_count || 0),
    unmatchedCount: Number(row.unmatched_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function serializeAsset(row) {
  return {
    id: row.id,
    mediaAssetId: row.media_asset_id,
    sourceUrl: row.source_url,
    url: row.url,
    width: Number(row.width || 0),
    height: Number(row.height || 0),
    size: Number(row.size_bytes || 0),
    selected: row.selected === true,
    sortOrder: Number(row.sort_order || 0)
  };
}

function emptyDraft(productId, modificationId, currentImages) {
  return {
    id: null,
    productId,
    modificationId: modificationId || null,
    targetType: modificationId ? 'images' : 'gallery_common',
    sourceUrl: '',
    parseStatus: 'idle',
    publishStatus: 'draft',
    foundCount: 0,
    errorMessage: '',
    errors: [],
    publishedAt: null,
    currentImages,
    assets: []
  };
}

function serializeDraft(row, assets, currentImages) {
  if (!row) return null;
  return {
    id: row.id,
    productId: row.product_id,
    modificationId: row.modification_id || null,
    targetType: row.target_type,
    sourceUrl: row.source_url || '',
    parseStatus: row.parse_status,
    publishStatus: row.publish_status,
    foundCount: Number(row.found_count || 0),
    errorMessage: row.error_message || '',
    errors: jsonArray(row.error_details),
    publishedAt: row.published_at || null,
    currentImages,
    assets
  };
}

function batchStatus(counts) {
  if (Number(counts.running || 0) > 0) return 'running';
  if (Number(counts.queued || 0) > 0) return 'queued';
  return 'completed';
}

function publicationError(error) {
  if (error instanceof AppError) return error;
  if (error instanceof HoroshopApiError) {
    if (error.code === 'permission_denied') {
      return new AppError(422, 'HOROSHOP_PHOTO_ACCESS_DENIED', 'Хорошоп не дозволив оновити фотографії. Перевірте рівень доступу адміністратора.');
    }
    if (error.code === 'unsupported_operation') {
      return new AppError(422, 'HOROSHOP_PHOTO_IMPORT_UNAVAILABLE', 'Цей магазин не підтримує оновлення фотографій через catalog/import.');
    }
    if (error.code === 'subscription_limit' || error.httpStatus === 429) {
      return new AppError(429, 'HOROSHOP_PHOTO_RATE_LIMIT', 'Хорошоп тимчасово вичерпав ліміт API-запитів.');
    }
    if (error.apiMessage) {
      return new AppError(502, 'HOROSHOP_PHOTO_PUBLISH_REJECTED', `Хорошоп відхилив фотографії: ${error.apiMessage}`);
    }
  }
  return new AppError(502, 'HOROSHOP_PHOTO_PUBLISH_FAILED', 'Не вдалося передати фотографії у Хорошоп.');
}

function absoluteMediaUrl(origin, value) {
  const base = String(origin || '').trim();
  if (!base) throw new AppError(500, 'HOROSHOP_PHOTO_PUBLIC_ORIGIN_MISSING', 'Для передачі фотографій потрібно налаштувати APP_ORIGIN.');
  let result;
  try {
    result = new URL(String(value || ''), `${base.replace(/\/+$/u, '')}/`);
  } catch {
    throw new AppError(422, 'HOROSHOP_PHOTO_URL_INVALID', 'Не вдалося сформувати публічне посилання на фотографію.');
  }
  if (!['http:', 'https:'].includes(result.protocol)) {
    throw new AppError(422, 'HOROSHOP_PHOTO_URL_INVALID', 'Фотографія повинна мати публічне HTTP(S)-посилання.');
  }
  return result.href;
}

export class HoroshopPhotoService {
  constructor(options = {}) {
    this.pool = options.databasePool || defaultPool;
    this.catalogService = options.catalogService || horoshopCatalogService;
    this.clientFactory = options.clientFactory || ((storeDomain) => new HoroshopClient(storeDomain));
    this.scrape = options.scrape || scrapePhotoParserProduct;
    this.createAsset = options.createAsset || createMediaAsset;
    this.publicOrigin = options.publicOrigin ?? env.APP_ORIGIN ?? '';
  }

  async connection(db = this.pool) {
    const result = await db.query(`
      SELECT id, generation, store_domain, encrypted_credentials, status
      FROM search_horoshop_connections
      WHERE singleton = TRUE
      LIMIT 1
    `);
    const row = result.rows[0];
    if (!row) throw new AppError(409, 'HOROSHOP_NOT_CONNECTED', 'Спочатку підключіть магазин Хорошоп та імпортуйте каталог.');
    if (row.status !== 'connected') throw new AppError(409, 'HOROSHOP_CONNECTION_NOT_READY', 'Дочекайтеся завершення синхронізації каталогу Хорошоп.');
    return row;
  }

  async matchingCatalog(connection) {
    const [products, modifications] = await Promise.all([
      this.pool.query(`
        SELECT id, sku, titles, primary_image_url
        FROM search_horoshop_products
        WHERE connection_id = $1 AND generation = $2 AND active = TRUE
      `, [connection.id, connection.generation]),
      this.pool.query(`
        SELECT modification.id, modification.product_id, modification.sku,
               modification.titles, modification.image_url
        FROM search_horoshop_modifications AS modification
        INNER JOIN search_horoshop_products AS product ON product.id = modification.product_id
        WHERE modification.connection_id = $1 AND modification.generation = $2
          AND modification.active = TRUE AND product.active = TRUE
      `, [connection.id, connection.generation])
    ]);
    return { products: products.rows, modifications: modifications.rows };
  }

  async listSelections() {
    const connection = await this.connection();
    const result = await this.pool.query(`
      SELECT selection.*
      FROM search_horoshop_photo_selections AS selection
      WHERE selection.connection_id = $1 AND selection.generation = $2
      ORDER BY selection.updated_at DESC, selection.created_at DESC
    `, [connection.id, connection.generation]);
    const counts = await this.pool.query(`
      SELECT item.selection_id, COUNT(*)::INTEGER AS matched_count
      FROM search_horoshop_photo_selection_items AS item
      INNER JOIN search_horoshop_photo_selections AS selection ON selection.id = item.selection_id
      WHERE selection.connection_id = $1 AND selection.generation = $2
      GROUP BY item.selection_id
    `, [connection.id, connection.generation]);
    const matchedBySelection = new Map(counts.rows.map((row) => [row.selection_id, row.matched_count]));
    return result.rows.map((row) => {
      const resolution = jsonObject(row.resolution);
      return serializeSelectionRow({
        ...row,
        matched_count: matchedBySelection.get(row.id) || 0,
        ambiguous_count: jsonArray(resolution.ambiguous).length,
        unmatched_count: jsonArray(resolution.unmatched).length
      });
    });
  }

  async createSelection({ name, entries, userId }) {
    const connection = await this.connection();
    const cleanEntries = entries.map((entry) => String(entry || '').trim()).filter(Boolean).slice(0, maximumSelectionEntries);
    const resolution = resolveHoroshopPhotoSelection(cleanEntries, await this.matchingCatalog(connection));
    const client = await this.pool.connect();
    let selectionId;
    try {
      await client.query('BEGIN');
      const inserted = await client.query(`
        INSERT INTO search_horoshop_photo_selections (
          connection_id, generation, name, input_lines, resolution, created_by
        ) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)
        RETURNING id
      `, [
        connection.id,
        connection.generation,
        selectionName(name),
        JSON.stringify(cleanEntries),
        JSON.stringify(resolution),
        userId
      ]);
      selectionId = inserted.rows[0].id;
      for (const match of resolution.matched) {
        await client.query(`
          INSERT INTO search_horoshop_photo_selection_items (
            selection_id, product_id, modification_id, target_key, input_value, matched_by
          ) VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (selection_id, target_key) DO NOTHING
        `, [
          selectionId,
          match.target.productId,
          match.target.modificationId,
          match.targetKey,
          match.input,
          match.matchedBy
        ]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return this.selection(selectionId);
  }

  async createFilteredSelection({ name, filters, userId }) {
    const entries = [];
    let page = 1;
    let pageCount = 1;
    while (page <= pageCount && entries.length < maximumSelectionEntries) {
      const catalog = await this.catalogService.catalog({
        ...filters,
        state: 'active',
        page,
        pageSize: 100
      });
      pageCount = Math.max(1, Number(catalog.pageCount || 1));
      for (const product of catalog.items || []) {
        const identifier = String(product.sku || localizedTitle(product.titles)).trim();
        if (identifier) entries.push(identifier);
        if (entries.length >= maximumSelectionEntries) break;
      }
      page += 1;
    }
    if (!entries.length) {
      throw new AppError(422, 'HOROSHOP_PHOTO_FILTER_EMPTY', 'За вибраними фільтрами не знайдено товарів для обробки.');
    }
    return this.createSelection({ name, entries, userId });
  }

  async assertSelection(selectionId, connection) {
    const result = await this.pool.query(`
      SELECT * FROM search_horoshop_photo_selections
      WHERE id = $1 AND connection_id = $2 AND generation = $3
    `, [selectionId, connection.id, connection.generation]);
    if (!result.rows[0]) throw new AppError(404, 'HOROSHOP_PHOTO_SELECTION_NOT_FOUND', 'Вибірку товарів не знайдено.');
    return result.rows[0];
  }

  async selection(selectionId) {
    const connection = await this.connection();
    const selection = await this.assertSelection(selectionId, connection);
    const itemsResult = await this.pool.query(`
      SELECT item.*, product.sku AS product_sku, product.titles AS product_titles,
             product.primary_image_url, product.canonical_url, product.source_data AS product_source,
             selected_modification.sku AS selected_modification_sku,
             selected_modification.titles AS selected_modification_titles
      FROM search_horoshop_photo_selection_items AS item
      INNER JOIN search_horoshop_products AS product ON product.id = item.product_id
      LEFT JOIN search_horoshop_modifications AS selected_modification
        ON selected_modification.id = item.modification_id
      WHERE item.selection_id = $1
      ORDER BY item.created_at, item.id
    `, [selectionId]);
    const productIds = [...new Set(itemsResult.rows.map((row) => row.product_id))];
    let modifications = [];
    let drafts = [];
    if (productIds.length) {
      const placeholders = productIds.map((_, index) => `$${index + 2}`).join(', ');
      const [modificationResult, draftResult] = await Promise.all([
        this.pool.query(`
          SELECT id, product_id, sku, titles, image_url, source_data
          FROM search_horoshop_modifications
          WHERE connection_id = $1 AND active = TRUE AND product_id IN (${placeholders})
          ORDER BY updated_at DESC, id
        `, [connection.id, ...productIds]),
        this.pool.query(`
          SELECT * FROM search_horoshop_photo_drafts
          WHERE connection_id = $1 AND product_id IN (${placeholders})
        `, [connection.id, ...productIds])
      ]);
      modifications = modificationResult.rows;
      drafts = draftResult.rows;
    }
    const draftIds = drafts.map((draft) => draft.id);
    let assets = [];
    if (draftIds.length) {
      const placeholders = draftIds.map((_, index) => `$${index + 1}`).join(', ');
      const result = await this.pool.query(`
        SELECT photo.*, asset.url, asset.width, asset.height, asset.size_bytes
        FROM search_horoshop_photo_assets AS photo
        INNER JOIN media_library_assets AS asset ON asset.id = photo.media_asset_id
        WHERE photo.draft_id IN (${placeholders})
        ORDER BY photo.draft_id, photo.sort_order, photo.created_at
      `, draftIds);
      assets = result.rows;
    }
    const draftsByKey = new Map(drafts.map((draft) => [draft.target_key, draft]));
    const assetsByDraft = new Map();
    for (const asset of assets) {
      const current = assetsByDraft.get(asset.draft_id) || [];
      current.push(serializeAsset(asset));
      assetsByDraft.set(asset.draft_id, current);
    }
    const modificationsByProduct = new Map();
    for (const modification of modifications) {
      const current = modificationsByProduct.get(modification.product_id) || [];
      current.push(modification);
      modificationsByProduct.set(modification.product_id, current);
    }
    const selectionByProduct = new Map();
    for (const item of itemsResult.rows) {
      const current = selectionByProduct.get(item.product_id) || {
        row: item,
        includeAll: false,
        modificationIds: new Set(),
        itemIds: [],
        inputs: []
      };
      current.includeAll ||= !item.modification_id;
      if (item.modification_id) current.modificationIds.add(item.modification_id);
      current.itemIds.push(item.id);
      current.inputs.push(item.input_value);
      selectionByProduct.set(item.product_id, current);
    }
    const products = [...selectionByProduct.values()].map((selected) => {
      const row = selected.row;
      const productTitle = photoTargetTitle(row.product_titles, row.product_sku);
      const productDraftRow = draftsByKey.get(targetKey(row.product_id));
      const currentGallery = sourcePhotoLinks(row.product_source, 'gallery_common');
      const commonDraft = productDraftRow
        ? serializeDraft(productDraftRow, assetsByDraft.get(productDraftRow.id) || [], currentGallery)
        : emptyDraft(row.product_id, null, currentGallery);
      const productModifications = (modificationsByProduct.get(row.product_id) || [])
        .filter((modification) => selected.includeAll || selected.modificationIds.has(modification.id))
        .map((modification) => {
          const draftRow = draftsByKey.get(targetKey(row.product_id, modification.id));
          const currentImages = sourcePhotoLinks(modification.source_data, 'images');
          return {
            id: modification.id,
            sku: modification.sku || '',
            title: photoTargetTitle(modification.titles, modification.sku, productTitle),
            imageUrl: modification.image_url || '',
            draft: draftRow
              ? serializeDraft(draftRow, assetsByDraft.get(draftRow.id) || [], currentImages)
              : emptyDraft(row.product_id, modification.id, currentImages)
          };
        });
      return {
        itemIds: selected.itemIds,
        inputs: selected.inputs,
        includeAllModifications: selected.includeAll,
        id: row.product_id,
        sku: row.product_sku || '',
        title: productTitle,
        imageUrl: row.primary_image_url || '',
        canonicalUrl: row.canonical_url || '',
        commonDraft: selected.includeAll && productModifications.length === 0 ? commonDraft : null,
        modifications: productModifications
      };
    });
    const resolution = jsonObject(selection.resolution);
    return {
      id: selection.id,
      name: selection.name,
      inputLines: jsonArray(selection.input_lines),
      resolution: {
        ambiguous: Array.isArray(resolution.ambiguous) ? resolution.ambiguous : [],
        unmatched: Array.isArray(resolution.unmatched) ? resolution.unmatched : []
      },
      products,
      createdAt: selection.created_at,
      updatedAt: selection.updated_at
    };
  }

  async addSelectionItem(selectionId, { productId, modificationId = null, inputValue = '' }) {
    const connection = await this.connection();
    await this.assertSelection(selectionId, connection);
    const product = await this.pool.query(`
      SELECT id FROM search_horoshop_products
      WHERE id = $1 AND connection_id = $2 AND generation = $3 AND active = TRUE
    `, [productId, connection.id, connection.generation]);
    if (!product.rows[0]) throw new AppError(404, 'HOROSHOP_PRODUCT_NOT_FOUND', 'Товар відсутній в актуальному каталозі Хорошоп.');
    if (modificationId) {
      const modification = await this.pool.query(`
        SELECT id FROM search_horoshop_modifications
        WHERE id = $1 AND product_id = $2 AND connection_id = $3 AND active = TRUE
      `, [modificationId, productId, connection.id]);
      if (!modification.rows[0]) throw new AppError(404, 'HOROSHOP_MODIFICATION_NOT_FOUND', 'Модифікацію товару не знайдено.');
    }
    await this.pool.query(`
      INSERT INTO search_horoshop_photo_selection_items (
        selection_id, product_id, modification_id, target_key, input_value, matched_by
      ) VALUES ($1, $2, $3, $4, $5, 'manual')
      ON CONFLICT (selection_id, target_key) DO NOTHING
    `, [selectionId, productId, modificationId, targetKey(productId, modificationId), String(inputValue || '').slice(0, 500)]);
    await this.pool.query('UPDATE search_horoshop_photo_selections SET updated_at = NOW() WHERE id = $1', [selectionId]);
    return this.selection(selectionId);
  }

  async removeSelectionItem(selectionId, itemId) {
    const connection = await this.connection();
    await this.assertSelection(selectionId, connection);
    await this.pool.query(`
      DELETE FROM search_horoshop_photo_selection_items
      WHERE id = $1 AND selection_id = $2
    `, [itemId, selectionId]);
    await this.pool.query('UPDATE search_horoshop_photo_selections SET updated_at = NOW() WHERE id = $1', [selectionId]);
    return this.selection(selectionId);
  }

  async deleteSelection(selectionId) {
    const connection = await this.connection();
    const client = await this.pool.connect();
    let orphanedUploads = [];
    try {
      await client.query('BEGIN');
      const selection = await client.query(`
        SELECT id FROM search_horoshop_photo_selections
        WHERE id = $1 AND connection_id = $2 AND generation = $3
        FOR UPDATE
      `, [selectionId, connection.id, connection.generation]);
      if (!selection.rows[0]) {
        throw new AppError(404, 'HOROSHOP_PHOTO_SELECTION_NOT_FOUND', 'Вибірку товарів не знайдено.');
      }

      const desktopRuns = await client.query(`
        SELECT DISTINCT batch.id AS batch_id, run.draft_id
        FROM search_horoshop_photo_batches AS batch
        INNER JOIN search_horoshop_photo_runs AS run ON run.batch_id = batch.id
        WHERE batch.selection_id = $1 AND run.executor = 'desktop'
      `, [selectionId]);
      const batchIds = [...new Set(desktopRuns.rows.map((row) => row.batch_id))];
      const draftIds = [...new Set(desktopRuns.rows.map((row) => row.draft_id))];

      if (batchIds.length) {
        const uploads = await client.query(`
          SELECT DISTINCT asset.id, asset.storage_key
          FROM search_horoshop_photo_run_uploads AS upload
          INNER JOIN search_horoshop_photo_runs AS run ON run.id = upload.run_id
          INNER JOIN media_library_assets AS asset ON asset.id = upload.media_asset_id
          WHERE run.batch_id = ANY($1::uuid[])
        `, [batchIds]);
        orphanedUploads = uploads.rows;
        if (orphanedUploads.length) {
          await client.query('DELETE FROM media_library_assets WHERE id = ANY($1::uuid[])', [
            orphanedUploads.map((asset) => asset.id)
          ]);
        }
        const batchPlaceholders = batchIds.map((_, index) => `$${index + 1}`).join(', ');
        await client.query(`DELETE FROM search_horoshop_photo_batches WHERE id IN (${batchPlaceholders})`, batchIds);
      }

      if (draftIds.length) {
        const activeRuns = await client.query(`
          SELECT DISTINCT draft_id FROM search_horoshop_photo_runs
          WHERE draft_id = ANY($1::uuid[]) AND status IN ('queued', 'running')
        `, [draftIds]);
        const draftsWithAssets = await client.query(`
          SELECT DISTINCT draft_id FROM search_horoshop_photo_assets
          WHERE draft_id = ANY($1::uuid[])
        `, [draftIds]);
        const activeDraftIds = new Set(activeRuns.rows.map((row) => row.draft_id));
        const readyDraftIds = new Set(draftsWithAssets.rows.map((row) => row.draft_id));
        const resettableDraftIds = draftIds.filter((draftId) => !activeDraftIds.has(draftId));
        const ready = resettableDraftIds.filter((draftId) => readyDraftIds.has(draftId));
        const idle = resettableDraftIds.filter((draftId) => !readyDraftIds.has(draftId));
        for (const [parseStatus, ids] of [['ready', ready], ['idle', idle]]) {
          if (!ids.length) continue;
          await client.query(`
            UPDATE search_horoshop_photo_drafts
            SET parse_status = $2, error_message = '', error_details = '[]'::jsonb, updated_at = NOW()
            WHERE id = ANY($1::uuid[])
          `, [ids, parseStatus]);
        }
      }

      await client.query('DELETE FROM search_horoshop_photo_selections WHERE id = $1', [selectionId]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    for (const asset of orphanedUploads) await removeMediaImage(asset.storage_key).catch(() => {});
  }

  async saveDraft({ productId, modificationId = null, sourceUrl, userId }) {
    const connection = await this.connection();
    const product = await this.pool.query(`
      SELECT id FROM search_horoshop_products
      WHERE id = $1 AND connection_id = $2 AND generation = $3 AND active = TRUE
    `, [productId, connection.id, connection.generation]);
    if (!product.rows[0]) throw new AppError(404, 'HOROSHOP_PRODUCT_NOT_FOUND', 'Товар відсутній в актуальному каталозі Хорошоп.');
    if (modificationId) {
      const modification = await this.pool.query(`
        SELECT id FROM search_horoshop_modifications
        WHERE id = $1 AND product_id = $2 AND connection_id = $3 AND generation = $4 AND active = TRUE
      `, [modificationId, productId, connection.id, connection.generation]);
      if (!modification.rows[0]) throw new AppError(404, 'HOROSHOP_MODIFICATION_NOT_FOUND', 'Модифікацію товару не знайдено.');
    }
    const key = targetKey(productId, modificationId);
    const result = await this.pool.query(`
      INSERT INTO search_horoshop_photo_drafts (
        connection_id, generation, product_id, modification_id, target_key,
        target_type, source_url, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (connection_id, target_key)
      DO UPDATE SET source_url = EXCLUDED.source_url,
                    parse_status = CASE
                      WHEN search_horoshop_photo_drafts.source_url <> EXCLUDED.source_url THEN 'idle'
                      ELSE search_horoshop_photo_drafts.parse_status
                    END,
                    publish_status = CASE
                      WHEN search_horoshop_photo_drafts.source_url <> EXCLUDED.source_url THEN 'draft'
                      ELSE search_horoshop_photo_drafts.publish_status
                    END,
                    error_message = CASE
                      WHEN search_horoshop_photo_drafts.source_url <> EXCLUDED.source_url THEN ''
                      ELSE search_horoshop_photo_drafts.error_message
                    END,
                    updated_at = NOW()
      RETURNING *
    `, [
      connection.id,
      connection.generation,
      productId,
      modificationId,
      key,
      modificationId ? 'images' : 'gallery_common',
      sourceUrl,
      userId
    ]);
    return { id: result.rows[0].id, sourceUrl: result.rows[0].source_url };
  }

  async selectAssets(draftId, assetIds) {
    const connection = await this.connection();
    const draft = await this.pool.query(`
      SELECT id FROM search_horoshop_photo_drafts
      WHERE id = $1 AND connection_id = $2 AND generation = $3
    `, [draftId, connection.id, connection.generation]);
    if (!draft.rows[0]) throw new AppError(404, 'HOROSHOP_PHOTO_DRAFT_NOT_FOUND', 'Чернетку фотографій не знайдено.');
    const available = await this.pool.query(`
      SELECT id FROM search_horoshop_photo_assets WHERE draft_id = $1
    `, [draftId]);
    const availableIds = new Set(available.rows.map((row) => row.id));
    if (assetIds.some((id) => !availableIds.has(id))) {
      throw new AppError(422, 'HOROSHOP_PHOTO_ASSET_INVALID', 'Одна з вибраних фотографій не належить цій чернетці.');
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE search_horoshop_photo_assets SET selected = FALSE WHERE draft_id = $1', [draftId]);
      for (const [index, assetId] of assetIds.entries()) {
        await client.query(`
          UPDATE search_horoshop_photo_assets
          SET selected = TRUE, sort_order = $3
          WHERE id = $1 AND draft_id = $2
        `, [assetId, draftId, index]);
      }
      await client.query(`
        UPDATE search_horoshop_photo_drafts
        SET publish_status = 'draft', updated_at = NOW()
        WHERE id = $1
      `, [draftId]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async ensureDesktopSelectionDrafts(selectionId, connection, userId, db) {
    const targets = await db.query(`
      WITH selected_targets AS (
        SELECT item.product_id, item.modification_id
        FROM search_horoshop_photo_selection_items AS item
        INNER JOIN search_horoshop_modifications AS modification
          ON modification.id = item.modification_id AND modification.active = TRUE
        WHERE item.selection_id = $1 AND item.modification_id IS NOT NULL

        UNION

        SELECT item.product_id, modification.id AS modification_id
        FROM search_horoshop_photo_selection_items AS item
        INNER JOIN search_horoshop_modifications AS modification
          ON modification.product_id = item.product_id AND modification.active = TRUE
        WHERE item.selection_id = $1 AND item.modification_id IS NULL

        UNION

          SELECT item.product_id, NULL::UUID AS modification_id
          FROM search_horoshop_photo_selection_items AS item
          LEFT JOIN search_horoshop_modifications AS modification
            ON modification.product_id = item.product_id AND modification.active = TRUE
          WHERE item.selection_id = $1 AND item.modification_id IS NULL
            AND modification.id IS NULL
      )
      SELECT target.product_id, target.modification_id
      FROM selected_targets AS target
      INNER JOIN search_horoshop_products AS product
        ON product.id = target.product_id
       AND product.connection_id = $2
       AND product.generation = $3
       AND product.active = TRUE
      ORDER BY target.product_id, target.modification_id NULLS FIRST
    `, [selectionId, connection.id, connection.generation]);
    for (const target of targets.rows) {
      await db.query(`
        INSERT INTO search_horoshop_photo_drafts (
          connection_id, generation, product_id, modification_id, target_key,
          target_type, source_url, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, '', $7)
        ON CONFLICT (connection_id, target_key) DO NOTHING
      `, [
        connection.id,
        connection.generation,
        target.product_id,
        target.modification_id,
        targetKey(target.product_id, target.modification_id),
        target.modification_id ? 'images' : 'gallery_common',
        userId
      ]);
    }
    return targets.rows.length;
  }

  async createBatch({ selectionId = null, draftIds = [], userId, executor = 'server' }) {
    if (!['server', 'desktop'].includes(executor)) throw new Error('Unknown Horoshop photo batch executor');
    const connection = await this.connection();
    if (selectionId) await this.assertSelection(selectionId, connection);
    const client = await this.pool.connect();
    let batchId;
    try {
      await client.query('BEGIN');
      if (selectionId && executor === 'desktop') {
        await this.ensureDesktopSelectionDrafts(selectionId, connection, userId, client);
      }
      const values = [connection.id, connection.generation];
      const clauses = [
        'draft.connection_id = $1',
        'draft.generation = $2',
        `active_run.id IS NULL`
      ];
      if (executor === 'server') clauses.push(`draft.source_url <> ''`);
      let selectionJoin = '';
      if (selectionId) {
        values.push(selectionId);
        selectionJoin = `LEFT JOIN search_horoshop_modifications AS draft_modification
          ON draft_modification.id = draft.modification_id
         AND draft_modification.active = TRUE
        LEFT JOIN (
          SELECT product_id, COUNT(*)::INTEGER AS active_count
          FROM search_horoshop_modifications
          WHERE active = TRUE
          GROUP BY product_id
        ) AS active_modifications ON active_modifications.product_id = draft.product_id
        INNER JOIN search_horoshop_photo_selection_items AS selection_item
          ON selection_item.product_id = draft.product_id
         AND (
           selection_item.modification_id = draft.modification_id
           OR (
             selection_item.modification_id IS NULL
             AND (
               draft_modification.id IS NOT NULL
               OR (
                 draft.modification_id IS NULL
                 AND COALESCE(active_modifications.active_count, 0) = 0
               )
             )
           )
         )`;
        clauses.push(`selection_item.selection_id = $${values.length}`);
      }
      if (draftIds.length) {
        const placeholders = draftIds.map((draftId) => {
          values.push(draftId);
          return `$${values.length}`;
        });
        clauses.push(`draft.id IN (${placeholders.join(', ')})`);
      }
      const drafts = await client.query(`
        SELECT DISTINCT draft.id, draft.source_url
        FROM search_horoshop_photo_drafts AS draft
        ${selectionJoin}
        LEFT JOIN search_horoshop_photo_runs AS active_run
          ON active_run.draft_id = draft.id AND active_run.status IN ('queued', 'running')
        WHERE ${clauses.join(' AND ')}
        ORDER BY draft.id
      `, values);
      if (!drafts.rows.length) {
        throw new AppError(
          422,
          'HOROSHOP_PHOTO_BATCH_EMPTY',
          executor === 'desktop'
            ? 'У вибірці немає нових позицій, готових до передачі в десктопний парсер.'
            : 'У вибірці немає збережених посилань, готових до парсингу.'
        );
      }
      const batch = await client.query(`
        INSERT INTO search_horoshop_photo_batches (
          connection_id, generation, selection_id, requested_count, created_by
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `, [connection.id, connection.generation, selectionId, drafts.rows.length, userId]);
      batchId = batch.rows[0].id;
      for (const draft of drafts.rows) {
        await client.query(`
          INSERT INTO search_horoshop_photo_runs (batch_id, draft_id, source_url, executor)
          VALUES ($1, $2, $3, $4)
        `, [batchId, draft.id, draft.source_url, executor]);
      }
      await client.query(`
        UPDATE search_horoshop_photo_drafts
        SET parse_status = 'queued', error_message = '', error_details = '[]'::jsonb, updated_at = NOW()
        WHERE id = ANY($1::uuid[])
      `, [drafts.rows.map((draft) => draft.id)]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return this.loadBatch(batchId);
  }

  async refreshBatch(batchId, db = this.pool) {
    const result = await db.query(`
      SELECT status, COUNT(*)::INTEGER AS count
      FROM search_horoshop_photo_runs
      WHERE batch_id = $1
      GROUP BY status
    `, [batchId]);
    const counts = Object.fromEntries(result.rows.map((row) => [row.status, Number(row.count || 0)]));
    const status = batchStatus(counts);
    await db.query(`
      UPDATE search_horoshop_photo_batches
      SET status = $2,
          started_at = CASE WHEN $2 <> 'queued' THEN COALESCE(started_at, NOW()) ELSE started_at END,
          completed_at = CASE WHEN $2 = 'completed' THEN COALESCE(completed_at, NOW()) ELSE NULL END
      WHERE id = $1
    `, [batchId, status]);
    return status;
  }

  async reconcileBatches() {
    const result = await this.pool.query(`
      SELECT id FROM search_horoshop_photo_batches
      WHERE status IN ('queued', 'running')
      ORDER BY created_at
    `);
    for (const row of result.rows) await this.refreshBatch(row.id).catch(() => {});
    return result.rows.length;
  }

  async loadBatch(batchId) {
    const connection = await this.connection();
    const batchResult = await this.pool.query(`
      SELECT * FROM search_horoshop_photo_batches
      WHERE id = $1 AND connection_id = $2 AND generation = $3
    `, [batchId, connection.id, connection.generation]);
    const batch = batchResult.rows[0];
    if (!batch) throw new AppError(404, 'HOROSHOP_PHOTO_BATCH_NOT_FOUND', 'Пакет парсингу не знайдено.');
    const runs = await this.pool.query(`
      SELECT run.*, product.sku AS product_sku, product.titles AS product_titles,
             modification.sku AS modification_sku, modification.titles AS modification_titles
      FROM search_horoshop_photo_runs AS run
      INNER JOIN search_horoshop_photo_drafts AS draft ON draft.id = run.draft_id
      INNER JOIN search_horoshop_products AS product ON product.id = draft.product_id
      LEFT JOIN search_horoshop_modifications AS modification ON modification.id = draft.modification_id
      WHERE run.batch_id = $1
      ORDER BY run.created_at, run.id
    `, [batchId]);
    const counts = { queued: 0, running: 0, success: 0, partial: 0, failed: 0 };
    const items = runs.rows.map((row) => {
      counts[row.status] += 1;
      return {
        id: row.id,
        draftId: row.draft_id,
        status: row.status,
        sku: row.modification_sku || row.product_sku || '',
        title: localizedTitle(row.modification_titles || row.product_titles, row.modification_sku || row.product_sku),
        sourceUrl: row.source_url,
        adapterId: row.adapter_id || '',
        foundCount: Number(row.found_count || 0),
        savedCount: Number(row.saved_count || 0),
        skippedCount: Number(row.skipped_count || 0),
        errorMessage: row.error_message || '',
        errors: jsonArray(row.error_details),
        startedAt: row.started_at || null,
        completedAt: row.completed_at || null
      };
    });
    const status = batchStatus(counts);
    if (status !== batch.status) await this.refreshBatch(batch.id);
    return {
      id: batch.id,
      selectionId: batch.selection_id || null,
      status,
      requestedCount: Number(batch.requested_count || items.length),
      counts,
      items,
      createdAt: batch.created_at,
      startedAt: batch.started_at || null,
      completedAt: status === 'completed' ? batch.completed_at || new Date() : null
    };
  }

  async activeBatch() {
    const connection = await this.connection();
    await this.reconcileBatches();
    const result = await this.pool.query(`
      SELECT id FROM search_horoshop_photo_batches
      WHERE connection_id = $1 AND generation = $2 AND status IN ('queued', 'running')
      ORDER BY created_at DESC
      LIMIT 1
    `, [connection.id, connection.generation]);
    return result.rows[0] ? this.loadBatch(result.rows[0].id) : null;
  }

  async recoverInterruptedRuns() {
    await this.pool.query(`
      UPDATE search_horoshop_photo_runs
      SET status = 'queued', started_at = NULL, error_message = '', error_details = '[]'::jsonb
      WHERE status = 'running' AND executor = 'server'
    `);
    await this.pool.query(`
      UPDATE search_horoshop_photo_drafts AS draft
      SET parse_status = 'queued', updated_at = NOW()
      WHERE EXISTS (
        SELECT 1 FROM search_horoshop_photo_runs AS run
        WHERE run.draft_id = draft.id AND run.status = 'queued' AND run.executor = 'server'
      )
    `);
    await this.reconcileBatches();
  }

  async claimNextRun({ lockRows = true } = {}) {
    const db = lockRows ? await this.pool.connect() : this.pool;
    try {
      if (lockRows) await db.query('BEGIN');
      const result = await db.query(`
        SELECT run.*, draft.product_id, draft.modification_id, draft.created_by,
               batch.connection_id, batch.generation
        FROM search_horoshop_photo_runs AS run
        INNER JOIN search_horoshop_photo_drafts AS draft ON draft.id = run.draft_id
        INNER JOIN search_horoshop_photo_batches AS batch ON batch.id = run.batch_id
        WHERE run.status = 'queued' AND run.executor = 'server'
        ORDER BY run.created_at, run.id
        LIMIT 1
        ${lockRows ? 'FOR UPDATE SKIP LOCKED' : ''}
      `);
      const run = result.rows[0];
      if (!run) {
        if (lockRows) await db.query('COMMIT');
        return null;
      }
      await db.query(`
        UPDATE search_horoshop_photo_runs
        SET status = 'running', started_at = NOW(), completed_at = NULL
        WHERE id = $1
      `, [run.id]);
      await db.query(`
        UPDATE search_horoshop_photo_drafts
        SET parse_status = 'running', error_message = '', error_details = '[]'::jsonb, updated_at = NOW()
        WHERE id = $1
      `, [run.draft_id]);
      await db.query(`
        UPDATE search_horoshop_photo_batches
        SET status = 'running', started_at = COALESCE(started_at, NOW()), completed_at = NULL
        WHERE id = $1
      `, [run.batch_id]);
      if (lockRows) await db.query('COMMIT');
      return { ...run, status: 'running' };
    } catch (error) {
      if (lockRows) await db.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      if (lockRows) db.release();
    }
  }

  async replaceDraftAssets(run, prepared) {
    const old = await this.pool.query(`
      SELECT photo.media_asset_id, asset.storage_key
      FROM search_horoshop_photo_assets AS photo
      INNER JOIN media_library_assets AS asset ON asset.id = photo.media_asset_id
      WHERE photo.draft_id = $1
    `, [run.draft_id]);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM search_horoshop_photo_assets WHERE draft_id = $1', [run.draft_id]);
      for (const [index, image] of prepared.entries()) {
        await client.query(`
          INSERT INTO search_horoshop_photo_assets (
            draft_id, media_asset_id, source_url, content_sha256, selected, sort_order
          ) VALUES ($1, $2, $3, $4, TRUE, $5)
        `, [run.draft_id, image.asset.id, image.sourceUrl, image.contentSha256, index]);
      }
      if (old.rows.length) {
        await client.query('DELETE FROM media_library_assets WHERE id = ANY($1::uuid[])', [
          old.rows.map((row) => row.media_asset_id)
        ]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    for (const row of old.rows) await removeMediaImage(row.storage_key).catch(() => {});
  }

  async markRunFailed(run, error, errors = []) {
    const message = cleanError(error);
    const details = errors.length ? errors : [{ stage: 'page', sourceUrl: run.source_url, message }];
    await this.pool.query(`
      UPDATE search_horoshop_photo_runs
      SET status = 'failed', error_message = $2, error_details = $3::jsonb, completed_at = NOW()
      WHERE id = $1
    `, [run.id, message, JSON.stringify(details)]);
    await this.pool.query(`
      UPDATE search_horoshop_photo_drafts
      SET parse_status = 'failed', error_message = $2, error_details = $3::jsonb, updated_at = NOW()
      WHERE id = $1
    `, [run.draft_id, message, JSON.stringify(details)]);
    await this.refreshBatch(run.batch_id);
    return { status: 'failed', errorMessage: message };
  }

  async processRun(run) {
    const createdAssets = [];
    try {
      const targetResult = await this.pool.query(`
        SELECT draft.*, product.sku AS product_sku, product.titles AS product_titles,
               connection.store_domain,
               modification.sku AS modification_sku, modification.titles AS modification_titles
        FROM search_horoshop_photo_drafts AS draft
        INNER JOIN search_horoshop_products AS product ON product.id = draft.product_id
        INNER JOIN search_horoshop_connections AS connection ON connection.id = draft.connection_id
        LEFT JOIN search_horoshop_modifications AS modification ON modification.id = draft.modification_id
        WHERE draft.id = $1 AND draft.generation = $2
      `, [run.draft_id, run.generation]);
      const target = targetResult.rows[0];
      if (!target) throw new AppError(404, 'HOROSHOP_PHOTO_DRAFT_NOT_FOUND', 'Чернетку фотографій не знайдено.');
      const adapters = await loadPhotoParserAdapters();
      const adapter = findPhotoParserAdapter(run.source_url, adapters);
      await this.pool.query(`
        UPDATE search_horoshop_photo_runs SET adapter_id = $2 WHERE id = $1
      `, [run.id, adapter?.id || '']);
      const scraped = await this.scrape({ url: run.source_url, adapter, maxImages: maximumDraftImages });
      const errors = [...(scraped.errors || [])];
      const prepared = [];
      const knownSources = new Set();
      const knownHashes = new Set();
      const title = localizedTitle(target.modification_titles || target.product_titles, target.modification_sku || target.product_sku);
      const rootFolder = await ensureMediaFolder({
        name: `Фото Хорошоп — ${target.store_domain} — ${String(target.generation).slice(0, 8)}`.slice(0, 120),
        userId: target.created_by
      }, { query: (...args) => this.pool.query(...args) });
      const productFolder = await ensureMediaFolder({
        name: `${target.product_sku || 'Товар'} ${localizedTitle(target.product_titles)}`.trim().slice(0, 120),
        parentId: rootFolder.id,
        userId: target.created_by
      }, { query: (...args) => this.pool.query(...args) });
      await this.pool.query(`
        UPDATE search_horoshop_photo_drafts
        SET media_folder_id = $2, updated_at = NOW()
        WHERE id = $1
      `, [run.draft_id, productFolder.id]);
      for (const image of scraped.images || []) {
        if (prepared.length >= maximumDraftImages || knownSources.has(image.sourceUrl)) continue;
        knownSources.add(image.sourceUrl);
        try {
          const converted = await convertPhotoParserImageToWebp(image.buffer);
          if (knownHashes.has(converted.contentSha256)) continue;
          knownHashes.add(converted.contentSha256);
          const asset = await this.createAsset({
            buffer: converted.buffer,
            originalName: `${target.modification_sku || target.product_sku || 'photo'}-${prepared.length + 1}.webp`,
            folderId: productFolder.id,
            userId: target.created_by
          }, { query: (...args) => this.pool.query(...args) });
          createdAssets.push(asset);
          prepared.push({ sourceUrl: image.sourceUrl, contentSha256: converted.contentSha256, asset });
        } catch (error) {
          errors.push({ sourceUrl: image.sourceUrl, stage: 'storage', message: cleanError(error, 'Не вдалося зберегти фотографію') });
        }
      }
      if (!prepared.length) {
        throw new AppError(422, 'HOROSHOP_PHOTO_IMAGES_EMPTY', errors[0]?.message || `Для «${title}» не знайдено придатних фотографій.`);
      }
      await this.replaceDraftAssets(run, prepared);
      const foundCount = Number(scraped.diagnostics?.candidates || (scraped.images?.length || 0) + errors.length);
      const savedCount = prepared.length;
      const skippedCount = Math.max(0, foundCount - savedCount);
      const status = errors.length ? 'partial' : 'success';
      const draftStatus = errors.length ? 'partial' : 'ready';
      const errorMessage = errors.length ? `Частину фотографій пропущено: ${errors.length}` : '';
      await this.pool.query(`
        UPDATE search_horoshop_photo_runs
        SET status = $2, adapter_id = $3, found_count = $4, saved_count = $5,
            skipped_count = $6, error_message = $7, error_details = $8::jsonb,
            completed_at = NOW()
        WHERE id = $1
      `, [
        run.id, status, adapter?.id || '', foundCount, savedCount, skippedCount,
        errorMessage, JSON.stringify(errors)
      ]);
      await this.pool.query(`
        UPDATE search_horoshop_photo_drafts
        SET parse_status = $2, publish_status = 'draft', adapter_id = $3,
            found_count = $4, error_message = $5, error_details = $6::jsonb,
            updated_at = NOW()
        WHERE id = $1
      `, [run.draft_id, draftStatus, adapter?.id || '', foundCount, errorMessage, JSON.stringify(errors)]);
      await this.refreshBatch(run.batch_id);
      return { status, foundCount, savedCount, skippedCount, errors };
    } catch (error) {
      if (createdAssets.length) {
        const ids = createdAssets.map((asset) => asset.id);
        const rows = await this.pool.query(`
          DELETE FROM media_library_assets WHERE id = ANY($1::uuid[])
          RETURNING storage_key
        `, [ids]).catch(() => ({ rows: [] }));
        for (const row of rows.rows) await removeMediaImage(row.storage_key).catch(() => {});
      }
      return this.markRunFailed(run, error);
    }
  }

  async selectionPublishDraftIds(selectionId) {
    const connection = await this.connection();
    await this.assertSelection(selectionId, connection);
    const result = await this.pool.query(`
      SELECT DISTINCT draft.id
      FROM search_horoshop_photo_drafts AS draft
      LEFT JOIN search_horoshop_modifications AS draft_modification
        ON draft_modification.id = draft.modification_id
       AND draft_modification.active = TRUE
      LEFT JOIN (
        SELECT product_id, COUNT(*)::INTEGER AS active_count
        FROM search_horoshop_modifications
        WHERE active = TRUE
        GROUP BY product_id
      ) AS active_modifications ON active_modifications.product_id = draft.product_id
      INNER JOIN search_horoshop_photo_selection_items AS item
        ON item.product_id = draft.product_id
       AND (
         item.modification_id = draft.modification_id
         OR (
           item.modification_id IS NULL
           AND (
             draft_modification.id IS NOT NULL
             OR (
               draft.modification_id IS NULL
               AND COALESCE(active_modifications.active_count, 0) = 0
             )
           )
         )
       )
      INNER JOIN search_horoshop_photo_assets AS asset
        ON asset.draft_id = draft.id AND asset.selected = TRUE
      WHERE item.selection_id = $1
        AND draft.connection_id = $2
        AND draft.generation = $3
        AND draft.parse_status IN ('ready', 'partial')
      ORDER BY draft.id
    `, [selectionId, connection.id, connection.generation]);
    return result.rows.map((row) => row.id);
  }

  async publicationDrafts(draftIds, connection) {
    if (!draftIds.length) return [];
    const placeholders = draftIds.map((_, index) => `$${index + 3}`).join(', ');
    const result = await this.pool.query(`
      SELECT draft.id AS draft_id, draft.target_type,
             product.sku AS product_sku,
             modification.sku AS modification_sku,
             photo.id AS photo_id, photo.sort_order,
             asset.url, asset.width, asset.height, asset.size_bytes
      FROM search_horoshop_photo_drafts AS draft
      INNER JOIN search_horoshop_products AS product ON product.id = draft.product_id
      LEFT JOIN search_horoshop_modifications AS modification ON modification.id = draft.modification_id
      LEFT JOIN search_horoshop_photo_assets AS photo
        ON photo.draft_id = draft.id AND photo.selected = TRUE
      LEFT JOIN media_library_assets AS asset ON asset.id = photo.media_asset_id
      WHERE draft.connection_id = $1 AND draft.generation = $2
        AND draft.id IN (${placeholders})
      ORDER BY draft.id, photo.sort_order, photo.created_at
    `, [connection.id, connection.generation, ...draftIds]);
    const byId = new Map();
    for (const row of result.rows) {
      const draft = byId.get(row.draft_id) || {
        id: row.draft_id,
        targetType: row.target_type,
        article: row.modification_sku || row.product_sku || '',
        links: []
      };
      if (row.url) draft.links.push(row.url);
      byId.set(row.draft_id, draft);
    }
    const drafts = [...byId.values()];
    if (drafts.length !== new Set(draftIds).size) {
      throw new AppError(404, 'HOROSHOP_PHOTO_DRAFT_NOT_FOUND', 'Одна з чернеток фотографій більше не належить актуальному каталогу.');
    }
    for (const draft of drafts) {
      if (!draft.article) throw new AppError(422, 'HOROSHOP_PHOTO_ARTICLE_MISSING', 'У товару відсутній артикул для передачі фотографій.');
      if (!draft.links.length) throw new AppError(422, 'HOROSHOP_PHOTO_SELECTION_EMPTY', 'Оберіть хоча б одну фотографію у кожній чернетці.');
    }
    return drafts;
  }

  async publishDraftIds({ draftIds, mode = 'append', userId, publicOrigin, onProgress = null }) {
    const uniqueDraftIds = [...new Set(draftIds)];
    if (!uniqueDraftIds.length) throw new AppError(422, 'HOROSHOP_PHOTO_PUBLICATION_EMPTY', 'У вибірці немає готових фотографій для публікації.');
    const connection = await this.connection();
    const drafts = await this.publicationDrafts(uniqueDraftIds, connection);
    const override = mode === 'replace';
    return this.catalogService.runExclusiveExternalWrite(async () => {
      await this.pool.query(`
        UPDATE search_horoshop_photo_drafts
        SET publish_status = 'publishing', error_message = '', updated_at = NOW()
        WHERE id = ANY($1::uuid[])
      `, [drafts.map((draft) => draft.id)]);
      const grouped = new Map();
      for (const draft of drafts) {
        const item = grouped.get(draft.article) || { article: draft.article, draftIds: [] };
        item[draft.targetType] = {
          links: draft.links.map((url) => absoluteMediaUrl(publicOrigin || this.publicOrigin, url)),
          override
        };
        item.draftIds.push(draft.id);
        grouped.set(draft.article, item);
      }
      const payloads = [...grouped.values()];
      let processedDrafts = 0;
      const report = (stage, currentArticle = '') => onProgress?.({
        stage,
        totalDrafts: drafts.length,
        processedDrafts,
        currentArticle,
        percentage: drafts.length ? Math.round((processedDrafts / drafts.length) * 100) : 100
      });
      try {
        report('authenticating');
        const credentials = decryptHoroshopCredentials(connection.encrypted_credentials);
        const client = this.clientFactory(connection.store_domain);
        const token = await client.authenticate(credentials.login, credentials.password);
        for (const groupedItem of payloads) {
          report('publishing', groupedItem.article);
          const { draftIds: publishedIds, ...payload } = groupedItem;
          await client.importCatalog(token, [payload]);
          await this.pool.query(`
            UPDATE search_horoshop_photo_drafts
            SET publish_status = 'published', published_at = NOW(), published_by = $2,
                error_message = '', updated_at = NOW()
            WHERE id = ANY($1::uuid[])
          `, [publishedIds, userId]);
          processedDrafts += publishedIds.length;
          report(processedDrafts === drafts.length ? 'completed' : 'publishing', groupedItem.article);
        }
        return { publishedDrafts: processedDrafts, publishedArticles: payloads.length };
      } catch (error) {
        const safe = publicationError(error);
        await this.pool.query(`
          UPDATE search_horoshop_photo_drafts
          SET publish_status = 'failed', error_message = $2, updated_at = NOW()
          WHERE id = ANY($1::uuid[]) AND publish_status = 'publishing'
        `, [drafts.map((draft) => draft.id), safe.message]).catch(() => {});
        throw safe;
      }
    });
  }

  async publishDraft(draftId, input) {
    return this.publishDraftIds({ ...input, draftIds: [draftId] });
  }

  async publishSelection(selectionId, input) {
    const draftIds = await this.selectionPublishDraftIds(selectionId);
    return this.publishDraftIds({ ...input, draftIds });
  }
}

export const horoshopPhotoService = new HoroshopPhotoService();
