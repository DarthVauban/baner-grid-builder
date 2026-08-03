import crypto from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import { pool, query } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import { saveCatalogMediaAsset } from './catalog.media.js';
import { publishCatalogUpdates, publishPublicCatalogUpdate } from './catalog.events.js';
import { publishChatUpdates } from '../chat/chat.events.js';
import { catalogAuditChanges, getCatalogRecipientIds, logCatalogAudit } from './catalog.service.js';
import {
  ensureBuiltInPhotoParserAdapters,
  findPhotoParserAdapter,
  loadPhotoParserAdapters
} from './photo-parser.adapters.js';
import { scrapePhotoParserProduct } from './photo-parser.browser.js';

const maxCatalogImageBytes = 5 * 1024 * 1024;
const maxCatalogImageSide = 2200;
const maxCatalogGalleryItems = 20;
const maxInputPixels = 40_000_000;

function cleanErrorMessage(error, fallback = 'Не вдалося обробити фотографію') {
  return String(error?.message || fallback).replace(/\s+/g, ' ').trim().slice(0, 1000);
}

function usefulImageDimensions(width, height) {
  return Math.min(Number(width) || 0, Number(height) || 0) >= 32
    && Math.max(Number(width) || 0, Number(height) || 0) >= 160;
}

async function renderWebp(buffer, { width, height, quality }) {
  return sharp(buffer, {
    failOn: 'error',
    limitInputPixels: maxInputPixels,
    sequentialRead: true
  })
    .rotate()
    .resize({ width, height, fit: 'inside', withoutEnlargement: true })
    .webp({ quality, effort: 4 })
    .toBuffer();
}

export async function convertPhotoParserImageToWebp(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('Файл фотографії порожній');
  const source = sharp(buffer, {
    failOn: 'error',
    limitInputPixels: maxInputPixels,
    sequentialRead: true
  });
  const metadata = await source.metadata();
  if (!metadata.width || !metadata.height) throw new Error('Не вдалося визначити розмір фотографії');
  if (!usefulImageDimensions(metadata.width, metadata.height)) throw new Error('Зображення замале для фотографії товару');

  let webpBuffer = null;
  if (
    metadata.format === 'webp'
    && !metadata.orientation
    && Math.max(metadata.width, metadata.height) <= maxCatalogImageSide
    && buffer.length <= maxCatalogImageBytes
  ) {
    webpBuffer = buffer;
  } else {
    for (const quality of [84, 74, 64, 54]) {
      webpBuffer = await renderWebp(buffer, {
        width: maxCatalogImageSide,
        height: maxCatalogImageSide,
        quality
      });
      if (webpBuffer.length <= maxCatalogImageBytes) break;
    }
    if (webpBuffer.length > maxCatalogImageBytes) {
      for (const side of [1800, 1500, 1200]) {
        webpBuffer = await renderWebp(buffer, { width: side, height: side, quality: 62 });
        if (webpBuffer.length <= maxCatalogImageBytes) break;
      }
    }
  }
  if (!webpBuffer || webpBuffer.length > maxCatalogImageBytes) {
    throw new Error('Не вдалося зменшити фотографію до 5 МБ');
  }
  const output = await sharp(webpBuffer, { failOn: 'error', limitInputPixels: maxInputPixels }).metadata();
  return {
    buffer: webpBuffer,
    width: Number(output.width || metadata.width),
    height: Number(output.height || metadata.height),
    contentSha256: crypto.createHash('sha256').update(webpBuffer).digest('hex')
  };
}

function parserImageName(sourceUrl, index) {
  try {
    const file = path.posix.basename(new URL(sourceUrl).pathname);
    const stem = file.replace(/\.[^.]+$/, '').slice(0, 80);
    return `${stem || `parsed-${index + 1}`}.webp`;
  } catch {
    return `parsed-${index + 1}.webp`;
  }
}

export function serializePhotoParserRun(row) {
  return {
    id: row.id,
    batchId: row.batch_id,
    productId: row.product_id,
    productCode: row.product_code || '',
    productName: row.product_name || '',
    mainImageUrl: row.main_image_url || '',
    sourceUrl: row.source_url,
    adapterId: row.adapter_id || '',
    status: row.status,
    foundCount: Number(row.found_count || 0),
    savedCount: Number(row.saved_count || 0),
    skippedCount: Number(row.skipped_count || 0),
    errorMessage: row.error_message || '',
    errors: Array.isArray(row.error_details) ? row.error_details : [],
    createdAt: row.created_at,
    startedAt: row.started_at || null,
    completedAt: row.completed_at || null
  };
}

function photoParserBatchStatus(counts) {
  const queued = Number(counts.queued || 0);
  const running = Number(counts.running || 0);
  if (running > 0) return 'running';
  if (queued > 0) return 'queued';
  return 'completed';
}

async function updatePhotoParserBatchStatus(batchId, status, db) {
  const statements = {
    queued: `UPDATE used_smartphone_photo_parser_batches
             SET status = 'queued',
                 completed_at = NULL
             WHERE id = $1
             RETURNING status, started_at, completed_at`,
    running: `UPDATE used_smartphone_photo_parser_batches
              SET status = 'running',
                  started_at = COALESCE(started_at, NOW()),
                  completed_at = NULL
              WHERE id = $1
              RETURNING status, started_at, completed_at`,
    completed: `UPDATE used_smartphone_photo_parser_batches
                SET status = 'completed',
                    started_at = COALESCE(started_at, NOW()),
                    completed_at = COALESCE(completed_at, NOW())
                WHERE id = $1
                RETURNING status, started_at, completed_at`
  };
  return db.query(statements[status], [batchId]);
}

export async function refreshPhotoParserBatch(batchId, db = { query }) {
  const counts = await db.query(
    `SELECT status, COUNT(*)::INTEGER AS count
     FROM used_smartphone_photo_parser_runs
     WHERE batch_id = $1
     GROUP BY status`,
    [batchId]
  );
  const summary = Object.fromEntries(counts.rows.map((row) => [row.status, Number(row.count || 0)]));
  const status = photoParserBatchStatus(summary);
  await updatePhotoParserBatchStatus(batchId, status, db);
  return status;
}

export async function reconcilePhotoParserBatches(db = { query }) {
  const active = await db.query(
    `SELECT id
     FROM used_smartphone_photo_parser_batches
     WHERE status IN ('queued', 'running')
     ORDER BY created_at`
  );
  for (const batch of active.rows) {
    try {
      await refreshPhotoParserBatch(batch.id, db);
    } catch (error) {
      console.error('Photo parser batch reconciliation failed', batch.id, error);
    }
  }
  return active.rows.length;
}

export async function loadPhotoParserBatch(batchId, user, db = { query }) {
  const batchResult = await db.query(
    `SELECT *
     FROM used_smartphone_photo_parser_batches
     WHERE id = $1`,
    [batchId]
  );
  const batch = batchResult.rows[0];
  if (!batch) throw new AppError(404, 'PHOTO_PARSER_BATCH_NOT_FOUND', 'Пакет парсингу не знайдено.');
  if (user.role !== 'admin' && batch.created_by && batch.created_by !== user.id) {
    throw new AppError(403, 'FORBIDDEN', 'Недостатньо прав для перегляду цього пакета.');
  }
  const runs = await db.query(
    `SELECT run.*, product.product_code, product.name AS product_name, product.main_image_url
     FROM used_smartphone_photo_parser_runs AS run
     INNER JOIN used_smartphone_products AS product ON product.id = run.product_id
     WHERE run.batch_id = $1
     ORDER BY run.created_at, product.name`,
    [batchId]
  );
  const items = runs.rows.map(serializePhotoParserRun);
  const counts = {
    queued: items.filter((item) => item.status === 'queued').length,
    running: items.filter((item) => item.status === 'running').length,
    success: items.filter((item) => item.status === 'success').length,
    partial: items.filter((item) => item.status === 'partial').length,
    failed: items.filter((item) => item.status === 'failed').length
  };
  const reconciledStatus = photoParserBatchStatus(counts);
  if (reconciledStatus !== batch.status) {
    batch.status = reconciledStatus;
    batch.completed_at = reconciledStatus === 'completed' ? (batch.completed_at || new Date()) : null;
    if (reconciledStatus !== 'queued') batch.started_at ||= new Date();
    try {
      const updated = await updatePhotoParserBatchStatus(batchId, reconciledStatus, db);
      Object.assign(batch, updated.rows[0] || {});
    } catch (error) {
      console.error('Photo parser batch repair failed', batchId, error);
    }
  }
  return {
    id: batch.id,
    status: batch.status,
    requestedCount: items.length,
    counts,
    items,
    createdAt: batch.created_at,
    startedAt: batch.started_at || null,
    completedAt: batch.completed_at || null
  };
}

export async function findActivePhotoParserBatch(user, db = { query }) {
  await reconcilePhotoParserBatches(db);
  const params = [];
  const where = [`status IN ('queued', 'running')`];
  if (user.role !== 'admin') {
    params.push(user.id);
    where.push(`created_by = $${params.length}`);
  }
  const result = await db.query(
    `SELECT id
     FROM used_smartphone_photo_parser_batches
     WHERE ${where.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT 1`,
    params
  );
  if (!result.rows[0]) return null;
  return loadPhotoParserBatch(result.rows[0].id, user, db);
}

export async function createPhotoParserBatch({ search = '', photoStatus = 'all', user }) {
  await ensureBuiltInPhotoParserAdapters();
  const params = [];
  const where = [
    `product.photo_parser_url <> ''`,
    `product.publication_status <> 'ARCHIVED'`
  ];
  const terms = String(search || '').toLocaleLowerCase('uk-UA').split(/\s+/).filter(Boolean);
  for (const term of terms) {
    params.push(`%${term}%`);
    where.push(`(lower(product.name) LIKE $${params.length} OR lower(product.product_code) LIKE $${params.length})`);
  }
  if (photoStatus === 'present') where.push(`product.main_image_url <> ''`);
  if (photoStatus === 'missing') where.push(`product.main_image_url = ''`);
  where.push(`active_run.id IS NULL`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const products = await client.query(
      `SELECT product.id, product.photo_parser_url
       FROM used_smartphone_products AS product
       LEFT JOIN used_smartphone_photo_parser_runs AS active_run
         ON active_run.product_id = product.id
        AND active_run.status IN ('queued', 'running')
       WHERE ${where.join(' AND ')}
       ORDER BY lower(product.name), product.created_at`,
      params
    );
    if (!products.rows.length) {
      throw new AppError(422, 'PHOTO_PARSER_BATCH_EMPTY', 'Немає товарів із заповненими посиланнями для цього фільтра.');
    }
    const batch = await client.query(
      `INSERT INTO used_smartphone_photo_parser_batches (requested_count, created_by)
       VALUES (0, $1)
       RETURNING *`,
      [user.id]
    );
    let requestedCount = 0;
    for (const product of products.rows) {
      const inserted = await client.query(
        `INSERT INTO used_smartphone_photo_parser_runs (
           batch_id, product_id, source_url, created_by
         ) VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [batch.rows[0].id, product.id, product.photo_parser_url, user.id]
      );
      if (inserted.rows[0]) requestedCount += 1;
    }
    if (!requestedCount) {
      throw new AppError(409, 'PHOTO_PARSER_PRODUCTS_ALREADY_QUEUED', 'Усі вибрані товари вже перебувають у черзі парсингу.');
    }
    await client.query(
      `UPDATE used_smartphone_photo_parser_batches
       SET requested_count = $2
       WHERE id = $1`,
      [batch.rows[0].id, requestedCount]
    );
    await client.query('COMMIT');
    return loadPhotoParserBatch(batch.rows[0].id, user);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function markRunFailed(run, error, details = []) {
  const message = cleanErrorMessage(error, 'Не вдалося обробити товар');
  await query(
    `UPDATE used_smartphone_photo_parser_runs
     SET status = 'failed',
         error_message = $2,
         error_details = $3::JSONB,
         completed_at = NOW()
     WHERE id = $1`,
    [
      run.id,
      message,
      JSON.stringify(details.length ? details : [{ stage: 'page', sourceUrl: run.source_url, message }])
    ]
  );
  await refreshPhotoParserBatch(run.batch_id);
  return { status: 'failed', message };
}

async function attachParsedMedia({
  product,
  run,
  scraped,
  prepared,
  errors,
  saveAsset = saveCatalogMediaAsset
}) {
  const client = await pool.connect();
  const attached = [];
  let published = false;
  try {
    await client.query('BEGIN');
    const locked = await client.query(
      `SELECT id, name, product_code, gallery, main_image_url, publication_status
       FROM used_smartphone_products
       WHERE id = $1
       FOR UPDATE`,
      [product.id]
    );
    const current = locked.rows[0];
    if (!current) throw new AppError(404, 'CATALOG_PRODUCT_NOT_FOUND', 'Товар не знайдено.');
    published = current.publication_status === 'PUBLISHED';
    const gallery = Array.isArray(current.gallery) ? current.gallery.filter((item) => item?.url) : [];
    const previousGallery = gallery.map((item) => ({ ...item }));
    const previousMainImageUrl = current.main_image_url || '';
    const knownUrls = new Set(gallery.map((item) => item.url));
    if (current.main_image_url) knownUrls.add(current.main_image_url);
    const slots = Math.max(0, maxCatalogGalleryItems - gallery.length);

    for (const [index, image] of prepared.slice(0, slots).entries()) {
      const duplicate = await client.query(
        `SELECT id
         FROM used_smartphone_product_media
         WHERE product_id = $1
           AND (
             ($2 <> '' AND source_url = $2)
             OR ($3 <> '' AND content_sha256 = $3)
           )
         LIMIT 1`,
        [current.id, image.sourceUrl, image.contentSha256]
      );
      if (duplicate.rows[0]) continue;
      let asset;
      try {
        asset = await saveAsset({
          webpBuffer: image.buffer,
          webpName: parserImageName(image.sourceUrl, index)
        });
      } catch (error) {
        errors.push({
          sourceUrl: image.sourceUrl,
          stage: 'storage',
          message: cleanErrorMessage(error, 'Не вдалося зберегти фотографію')
        });
        continue;
      }
      if (knownUrls.has(asset.url)) continue;
      knownUrls.add(asset.url);
      gallery.push({ url: asset.url, alt: current.name });
      attached.push({ ...asset, ...image });
    }

    const mainImageUrl = current.main_image_url || gallery[0]?.url || '';
    const nextGallery = gallery.slice(0, maxCatalogGalleryItems);
    for (const image of attached) {
      await client.query(
        `INSERT INTO used_smartphone_product_media (
           product_id, url, storage_key, mime_type, size_bytes, width, height,
           alt, role, sort_order, source_url, content_sha256, created_by
         ) VALUES ($1, $2, $3, 'image/webp', $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          current.id,
          image.url,
          image.filename,
          image.size,
          image.width,
          image.height,
          current.name,
          image.url === mainImageUrl ? 'main' : 'gallery',
          gallery.findIndex((item) => item.url === image.url) + 1,
          image.sourceUrl,
          image.contentSha256,
          run.created_by
        ]
      );
    }
    if (attached.length || (!current.main_image_url && mainImageUrl)) {
      await client.query(
        `UPDATE used_smartphone_products
         SET main_image_url = $2,
             gallery = $3::JSONB,
             updated_by = $4,
             updated_at = NOW(),
             version = version + 1
         WHERE id = $1`,
        [current.id, mainImageUrl, JSON.stringify(nextGallery), run.created_by]
      );
      await logCatalogAudit(client, {
        productId: current.id,
        actorId: run.created_by,
        action: 'photo_parser_import',
        changes: {
          subject: { productCode: current.product_code, name: current.name },
          ...catalogAuditChanges(
            { mainImageUrl: previousMainImageUrl, gallery: previousGallery },
            { mainImageUrl, gallery: nextGallery }
          ),
          sourceUrl: run.source_url,
          adapterId: scraped.adapterId,
          found: scraped.diagnostics.candidates,
          saved: attached.length,
          skipped: Math.max(0, scraped.diagnostics.candidates - attached.length),
          errors: errors.length
        }
      });
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  return { attached, published };
}

export async function processPhotoParserRun(run, {
  scrape = scrapePhotoParserProduct,
  saveAsset = saveCatalogMediaAsset
} = {}) {
  try {
    const productResult = await query(
      `SELECT id, name, product_code, gallery, main_image_url, publication_status
       FROM used_smartphone_products
       WHERE id = $1`,
      [run.product_id]
    );
    const product = productResult.rows[0];
    if (!product) throw new AppError(404, 'CATALOG_PRODUCT_NOT_FOUND', 'Товар не знайдено.');
    const adapters = await loadPhotoParserAdapters();
    const adapter = findPhotoParserAdapter(run.source_url, adapters);
    await query(
      `UPDATE used_smartphone_photo_parser_runs
       SET adapter_id = $2
       WHERE id = $1`,
      [run.id, adapter?.id || '']
    );

    const scraped = await scrape({
      url: run.source_url,
      adapter,
      maxImages: 40,
      onProgress: (progress) => {
        publishCatalogUpdates([run.created_by], {
          type: 'photo_parser_progress',
          batchId: run.batch_id,
          runId: run.id,
          productId: run.product_id,
          progress
        });
      }
    });
    const existing = await query(
      `SELECT source_url, content_sha256
       FROM used_smartphone_product_media
       WHERE product_id = $1`,
      [product.id]
    );
    const knownSources = new Set(existing.rows.map((row) => row.source_url).filter(Boolean));
    const knownHashes = new Set(existing.rows.map((row) => row.content_sha256).filter(Boolean));
    const prepared = [];
    const errors = [...scraped.errors];
    for (const image of scraped.images) {
      if (knownSources.has(image.sourceUrl)) continue;
      try {
        const converted = await convertPhotoParserImageToWebp(image.buffer);
        if (knownHashes.has(converted.contentSha256)) continue;
        knownSources.add(image.sourceUrl);
        knownHashes.add(converted.contentSha256);
        prepared.push({ sourceUrl: image.sourceUrl, ...converted });
      } catch (error) {
        errors.push({
          sourceUrl: image.sourceUrl,
          stage: 'convert',
          message: cleanErrorMessage(error)
        });
      }
    }
    const { attached, published } = await attachParsedMedia({
      product,
      run,
      scraped,
      prepared,
      errors,
      saveAsset
    });
    const foundCount = Number(scraped.diagnostics.candidates || scraped.images.length + scraped.errors.length);
    const savedCount = attached.length;
    const skippedCount = Math.max(0, foundCount - savedCount);
    const status = errors.length ? (savedCount > 0 ? 'partial' : 'failed') : 'success';
    const errorMessage = status === 'partial'
      ? `Частину фото пропущено: ${errors.length}`
      : status === 'failed'
        ? errors[0]?.message || 'Не вдалося зберегти фотографії'
        : '';
    await query(
      `UPDATE used_smartphone_photo_parser_runs
       SET status = $2,
           adapter_id = $3,
           found_count = $4,
           saved_count = $5,
           skipped_count = $6,
           error_message = $7,
           error_details = $8::JSONB,
           completed_at = NOW()
       WHERE id = $1`,
      [
        run.id,
        status,
        adapter?.id || '',
        foundCount,
        savedCount,
        skippedCount,
        errorMessage,
        JSON.stringify(errors)
      ]
    );
    await refreshPhotoParserBatch(run.batch_id);
    const recipients = await getCatalogRecipientIds();
    publishCatalogUpdates(recipients, {
      type: 'photo_parser_completed',
      batchId: run.batch_id,
      runId: run.id,
      productId: run.product_id,
      status
    });
    publishChatUpdates(recipients, {
      type: 'entity',
      entityType: 'catalog_product',
      entityId: run.product_id,
      senderId: run.created_by
    });
    if (published && attached.length) {
      publishPublicCatalogUpdate({ type: 'product_updated', productId: run.product_id });
    }
    return { status, foundCount, savedCount, skippedCount, errors };
  } catch (error) {
    const result = await markRunFailed(run, error);
    publishCatalogUpdates([run.created_by], {
      type: 'photo_parser_completed',
      batchId: run.batch_id,
      runId: run.id,
      productId: run.product_id,
      status: 'failed'
    });
    return result;
  }
}

export async function recoverInterruptedPhotoParserRuns() {
  await query(
    `UPDATE used_smartphone_photo_parser_runs
     SET status = 'queued',
         started_at = NULL,
         error_message = '',
         error_details = '[]'::JSONB
     WHERE status = 'running'`
  );
  await query(
    `UPDATE used_smartphone_photo_parser_batches
     SET completed_at = NULL
     WHERE status IN ('queued', 'running')`
  );
  await reconcilePhotoParserBatches();
}

export async function claimNextPhotoParserRun({ lockRows = true } = {}) {
  const client = lockRows ? await pool.connect() : pool;
  try {
    if (lockRows) await client.query('BEGIN');
    const result = await client.query(
      `SELECT *
       FROM used_smartphone_photo_parser_runs
       WHERE status = 'queued'
       ORDER BY created_at
       ${lockRows ? 'FOR UPDATE SKIP LOCKED' : ''}
       LIMIT 1`
    );
    const run = result.rows[0];
    if (!run) {
      if (lockRows) await client.query('COMMIT');
      return null;
    }
    await client.query(
      `UPDATE used_smartphone_photo_parser_runs
       SET status = 'running', started_at = NOW()
       WHERE id = $1`,
      [run.id]
    );
    await client.query(
      `UPDATE used_smartphone_photo_parser_batches
       SET status = 'running', started_at = COALESCE(started_at, NOW())
       WHERE id = $1`,
      [run.batch_id]
    );
    if (lockRows) await client.query('COMMIT');
    return { ...run, status: 'running', started_at: new Date() };
  } catch (error) {
    if (lockRows) await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    if (lockRows) client.release();
  }
}
