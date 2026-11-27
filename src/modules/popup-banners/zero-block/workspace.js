import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pool, query } from '../../../db/pool.js';
import { AppError } from '../../../lib/app-error.js';
import { createPopupDocument, popupDiagnostics, validatePopupStructure } from './document.mjs';
import { DEFAULT_POPUP_TIMEZONE, validateRuleSet } from './rules.mjs';
import { buttonMediaIds } from './button.mjs';
import { formStyleMediaIds } from './form-appearance.mjs';
import { publicFormContent } from './form-flow.mjs';
import { documentProductIds, productPhotos } from './product-bindings.mjs';
import { productUrl } from './product.mjs';
import { shapeMediaIds } from './shape.mjs';
import { mediaLibraryDir } from '../../media/media.storage.js';

const scopeId = '00000000-0000-4000-8000-000000000001';
const database = { query };
const placeholders = (values, offset = 0) => values.map((_, index) => '$' + (index + offset + 1)).join(', ');

export async function transaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function currentZeroStore(db = database, lock = false) {
  const result = await db.query(
    `SELECT id, generation, store_domain FROM search_horoshop_connections
     WHERE singleton = TRUE AND status IN ('connected', 'syncing')${lock ? ' FOR SHARE' : ''}`
  );
  return result.rows[0] || null;
}

export function zeroStoreOrigin(origin, domain) {
  try {
    const url = new URL(origin);
    const host = (value) => value.toLowerCase().replace(/^www\./u, '');
    return url.protocol === 'https:' && url.origin === origin && !url.port && host(url.hostname) === host(domain);
  } catch {
    return false;
  }
}

export function zeroNotFound() {
  return new AppError(404, 'ZERO_BLOCK_NOT_FOUND', 'Кампанію Zero Block не знайдено.');
}

function stale() {
  return new AppError(409, 'ZERO_BLOCK_REVISION_CONFLICT', 'Кампанію вже змінено. Завантажте актуальну версію.');
}

export function zeroProduct(row) {
  const photos = productPhotos({ photoUrls: [
    row.primary_image_url,
    ...(Array.isArray(row.photo_urls) ? row.photo_urls : []),
    ...(Array.isArray(row.source_data?.images) ? row.source_data.images.map((item) => typeof item === 'string' ? item : item?.url) : [])
  ] });
  const stock = String(row.availability || '').trim();
  const availability = /^(?:1|true|in[ _-]?stock|available|в наявності|є в наявності)$/iu.test(stock)
    ? 'available' : /^(?:0|false|out[ _-]?of[ _-]?stock|unavailable|немає в наявності|немає)$/iu.test(stock)
      ? 'unavailable' : 'unknown';
  return {
    id: row.id,
    article: row.sku,
    name: row.titles?.uk || row.titles?.ua || row.titles?.ru || row.titles?.en || row.sku || '',
    photoUrl: photos[0] || null,
    photoUrls: photos,
    productUrl: productUrl(row.canonical_url),
    price: row.price || '',
    availability,
    availabilityLabel: availability === 'available' ? 'В наявності' : availability === 'unavailable' ? 'Немає в наявності' : 'Невідомо',
    updatedAt: new Date(row.updated_at).valueOf(),
    source: 'api'
  };
}

export async function getZeroProducts(ids, db = database, store = null) {
  if (!ids.length) return {};
  store ||= await currentZeroStore(db);
  if (!store) return {};
  const result = await db.query(
    `SELECT * FROM search_horoshop_products
     WHERE connection_id = $1 AND generation = $2 AND id IN (${placeholders(ids, 2)})
       AND active = TRUE AND visible = TRUE`,
    [store.id, store.generation, ...ids]
  );
  return Object.fromEntries(result.rows.map((row) => [row.id, zeroProduct(row)]));
}

async function rowFor(id, db = database, lock = false, deleted = false) {
  const { rows } = await db.query(
    `SELECT * FROM popup_banner_campaigns WHERE id = $1 AND zero_block = TRUE
       ${deleted ? '' : 'AND zero_deleted_at IS NULL'}${lock ? ' FOR UPDATE' : ''}`, [id]
  );
  if (!rows[0]) throw zeroNotFound();
  return rows[0];
}

async function serialize(row, db = database, store = null) {
  const document = row.zero_document;
  store ||= await currentZeroStore(db);
  const products = await getZeroProducts(documentProductIds(document), db, store);
  return {
    widgetId: row.id,
    shopId: scopeId,
    revision: row.zero_draft_revision,
    campaignRevision: row.zero_campaign_revision,
    enabled: row.status === 'active',
    document,
    products,
    diagnostics: popupDiagnostics(document, products),
    publishedVersionId: row.zero_publication_id,
    updatedAt: new Date(row.updated_at).valueOf(),
    store: store ? { domain: store.store_domain, timezone: DEFAULT_POPUP_TIMEZONE } : null
  };
}

function mediaIds(document) {
  return [...new Set(document.elements.flatMap((item) => {
    switch (item.type) {
      case 'image': return item.content.resourceId ? [item.content.resourceId] : [];
      case 'form': return formStyleMediaIds(item.content);
      case 'shape': return shapeMediaIds(item.content);
      case 'button': return buttonMediaIds(item.content);
      default: return [];
    }
  }))];
}

async function validateDocument(document, id, db) {
  let rules;
  try {
    validatePopupStructure(document, { shopId: scopeId, widgetId: id });
    rules = validateRuleSet(document.rules);
  } catch (error) {
    throw new AppError(422, 'ZERO_BLOCK_INVALID_DOCUMENT', error.message);
  }
  const resources = mediaIds(document);
  const files = [...new Set(document.elements.map((item) => item.content?.flow?.reward)
    .filter((reward) => reward?.type === 'file' && reward.fileId).map((reward) => reward.fileId))];
  if (resources.length) {
    const ids = placeholders(resources);
    const found = await db.query(
      `SELECT id FROM media_library_assets WHERE id IN (${ids})
       UNION SELECT media_id AS id FROM popup_zero_media_snapshots WHERE media_id IN (${ids})`, resources
    );
    if (found.rows.length !== resources.length) throw missingResource();
  }
  if (files.length) {
    const found = await db.query(`SELECT id FROM popup_zero_reward_files WHERE id IN (${placeholders(files)})`, files);
    if (found.rows.length !== files.length) throw missingResource();
  }
  return rules;
}

function missingResource() {
  return new AppError(422, 'ZERO_BLOCK_RESOURCE_MISSING', 'Один із ресурсів банера більше недоступний.');
}

async function snapshotMedia(document, db) {
  for (const id of mediaIds(document).sort()) {
    if ((await db.query('SELECT media_id FROM popup_zero_media_snapshots WHERE media_id = $1', [id])).rows.length) continue;
    const { rows: [asset] } = await db.query('SELECT storage_key, mime_type FROM media_library_assets WHERE id = $1', [id]);
    if (!asset) throw missingResource();
    let bytes;
    try {
      bytes = await readFile(join(mediaLibraryDir, asset.storage_key));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      // Library deletion that wins the file read prevents a broken publication.
      throw missingResource();
    }
    await db.query(
      'INSERT INTO popup_zero_media_snapshots (media_id, mime, bytes) VALUES ($1, $2, $3) ON CONFLICT (media_id) DO NOTHING',
      [id, asset.mime_type, bytes]
    );
  }
}

export async function createZeroBlock(name, actorId) {
  const id = randomUUID();
  const document = createPopupDocument(scopeId, id, name);
  const result = await query(
    `INSERT INTO popup_banner_campaigns (id, campaign_type, zero_block, name, priority, targeting, zero_document, created_by, updated_by)
     VALUES ($1, 'block', TRUE, $2, $3, '{"mode":"all_pages"}'::JSONB, $4::JSONB, $5, $5) RETURNING *`,
    [id, name, document.priority, JSON.stringify(document), actorId]
  );
  return serialize(result.rows[0]);
}

export async function getZeroBlock(id) {
  return serialize(await rowFor(id));
}

export async function saveZeroBlock(id, revision, document, actorId) {
  return transaction(async (db) => {
    const row = await rowFor(id, db, true);
    if (row.zero_draft_revision !== revision || document.revision !== revision) throw stale();
    const rules = await validateDocument(document, id, db);
    const next = { ...document, revision: revision + 1, rules };
    const { rows } = await db.query(
      `UPDATE popup_banner_campaigns SET name = $2, zero_document = $3::JSONB,
       zero_draft_revision = $4, updated_by = $5, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, document.name, JSON.stringify(next), next.revision, actorId]
    );
    return serialize(rows[0], db);
  });
}

export async function publishZeroBlock(id, input, actorId) {
  return transaction(async (db) => {
    // Lock in the same order as the public submission path.
    const store = await currentZeroStore(db, true);
    const row = await rowFor(id, db, true);
    const prior = await db.query(
      'SELECT publication_id FROM popup_zero_publish_operations WHERE campaign_id = $1 AND operation_id = $2',
      [id, input.operationId]
    );
    if (prior.rows.length) return { ...await serialize(row, db, store), operationVersionId: prior.rows[0].publication_id };
    if (row.zero_draft_revision !== input.draftRevision || row.zero_campaign_revision !== input.campaignRevision) throw stale();
    if (!store?.store_domain) {
      throw new AppError(409, 'HOROSHOP_STORE_REQUIRED', 'Спочатку підключіть магазин Хорошопа.');
    }
    const document = row.zero_document;
    const rules = await validateDocument(document, id, db);
    const products = await getZeroProducts(documentProductIds(document), db, store);
    const diagnostics = popupDiagnostics(document, products);
    if (!document.elements.length) diagnostics.push({ code: 'empty_document', message: 'Додайте елемент до банера.' });
    if (diagnostics.length) throw new AppError(422, 'ZERO_BLOCK_PUBLISH_INVALID', diagnostics[0].message, diagnostics);
    const { rows: [previous] } = await db.query(
      `SELECT id FROM popup_banner_versions WHERE campaign_id = $1
       AND zero_draft_revision = $2 AND zero_store_generation = $3`, [id, row.zero_draft_revision, store.generation]
    );
    const publicationId = previous?.id || randomUUID();
    if (!previous) {
      await snapshotMedia(document, db);
      const snapshot = { document, rules, storeDomain: store.store_domain, generation: store.generation };
      await db.query(
        `INSERT INTO popup_banner_versions (id, campaign_id, version_number, snapshot, created_by, zero_draft_revision, zero_store_generation)
         VALUES ($1, $2, $3, $4::JSONB, $5, $6, $7)`,
        [publicationId, id, row.zero_campaign_revision, JSON.stringify(snapshot), actorId, row.zero_draft_revision, store.generation]
      );
    }
    await db.query(
      'INSERT INTO popup_zero_publish_operations (campaign_id, operation_id, publication_id) VALUES ($1, $2, $3)',
      [id, input.operationId, publicationId]
    );
    const { rows } = await db.query(
      `UPDATE popup_banner_campaigns SET status = 'active', priority = $2, zero_publication_id = $3,
       connection_id = $4, connection_generation = $5, zero_campaign_revision = zero_campaign_revision + 1,
       published_at = NOW(), updated_at = NOW(), updated_by = $6 WHERE id = $1 RETURNING *`,
      [id, document.priority, publicationId, store.id, store.generation, actorId]
    );
    return { ...await serialize(rows[0], db, store), operationVersionId: publicationId };
  });
}

export async function pauseZeroBlock(id, campaignRevision, actorId) {
  return transaction(async (db) => {
    const row = await rowFor(id, db, true);
    if (row.zero_campaign_revision !== campaignRevision) throw stale();
    const { rows } = await db.query(
      `UPDATE popup_banner_campaigns SET status = 'paused', zero_campaign_revision = zero_campaign_revision + 1,
       updated_at = NOW(), updated_by = $2 WHERE id = $1 RETURNING *`, [id, actorId]
    );
    return serialize(rows[0], db);
  });
}

export async function deleteZeroBlock(id, input, actorId) {
  return transaction(async (db) => {
    const row = await rowFor(id, db, true, true);
    if (row.zero_deleted_at) return;
    if (row.zero_draft_revision !== input.draftRevision || row.zero_campaign_revision !== input.campaignRevision) throw stale();
    await db.query(
      `UPDATE popup_banner_campaigns SET status = 'paused', zero_deleted_at = NOW(), zero_document = NULL,
       zero_campaign_revision = zero_campaign_revision + 1, updated_by = $2, updated_at = NOW() WHERE id = $1`,
      [id, actorId]
    );
  });
}

export async function publicZeroBlocks(store) {
  const result = await query(
    `SELECT c.public_id, c.priority, v.id, v.snapshot FROM popup_banner_campaigns c
     JOIN popup_banner_versions v ON c.zero_publication_id = v.id AND v.campaign_id = c.id
     WHERE c.zero_block = TRUE AND c.status = 'active' AND c.zero_deleted_at IS NULL
       AND c.connection_id = $1 AND c.connection_generation = $2
     ORDER BY c.priority DESC, c.published_at DESC, c.public_id`,
    [store.id, store.generation]
  );
  const products = await getZeroProducts(
    [...new Set(result.rows.flatMap((row) => documentProductIds(row.snapshot.document)))], database, store
  );
  return {
    shopId: store.id, timezone: DEFAULT_POPUP_TIMEZONE,
    campaigns: result.rows.flatMap((row) => {
      const { document, rules, storeDomain } = row.snapshot;
      if (storeDomain !== store.store_domain) return [];
      const ids = documentProductIds(document);
      const bound = Object.fromEntries(ids.filter((id) => products[id]).map((id) => [id, products[id]]));
      if (popupDiagnostics(document, bound).length) return [];
      const { schemaVersion, showCloseButton, productId, name, desktop, mobile, laptop, tablet, mobileLandscape, forms } = document;
      return [{
        id: row.public_id, priority: row.priority, versionId: row.id, rules, products: bound, timezone: document.timezone || DEFAULT_POPUP_TIMEZONE,
        document: {
          schemaVersion, showCloseButton, productId, name, desktop, mobile, laptop, tablet, mobileLandscape, forms,
          elements: document.elements.map((item) => item.type === 'form'
            ? { ...item, content: publicFormContent(item.content) } : item)
        }
      }];
    })
  };
}
