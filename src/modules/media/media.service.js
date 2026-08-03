import { query } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import { removeMediaImage, saveOptimizedMediaImage } from './media.storage.js';

export function serializeMediaAsset(row) {
  return {
    id: row.id,
    name: row.original_name,
    url: row.url,
    mimeType: row.mime_type,
    size: Number(row.size_bytes || 0),
    originalSize: Number(row.original_size_bytes || 0),
    width: Number(row.width || 0),
    height: Number(row.height || 0),
    altText: row.alt_text || '',
    createdBy: row.created_by ? { id: row.created_by, name: row.creator_name || '' } : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function listMediaAssets({ search = '', page = 1, pageSize = 30 }, db = { query }) {
  const offset = (page - 1) * pageSize;
  const term = search.trim();
  const [items, count] = await Promise.all([
    db.query(
      `SELECT asset.*, creator.name AS creator_name
       FROM media_library_assets AS asset
       LEFT JOIN users AS creator ON creator.id = asset.created_by
       WHERE ($1 = '' OR asset.original_name ILIKE '%' || $1 || '%' OR asset.alt_text ILIKE '%' || $1 || '%')
       ORDER BY asset.created_at DESC
       LIMIT $2 OFFSET $3`,
      [term, pageSize, offset]
    ),
    db.query(
      `SELECT COUNT(*)::INTEGER AS total
       FROM media_library_assets
       WHERE ($1 = '' OR original_name ILIKE '%' || $1 || '%' OR alt_text ILIKE '%' || $1 || '%')`,
      [term]
    )
  ]);
  return {
    items: items.rows.map(serializeMediaAsset),
    total: Number(count.rows[0]?.total || 0),
    page,
    pageSize
  };
}

export async function createMediaAsset({ buffer, originalName, userId }, db = { query }) {
  const saved = await saveOptimizedMediaImage(buffer, originalName);
  try {
    const inserted = await db.query(
      `INSERT INTO media_library_assets (
         original_name, storage_key, url, mime_type, size_bytes, original_size_bytes,
         width, height, content_sha256, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        String(originalName || 'image').slice(0, 255), saved.filename, saved.url, saved.mimeType,
        saved.size, saved.originalSize, saved.width, saved.height, saved.contentSha256, userId
      ]
    );
    return serializeMediaAsset(inserted.rows[0]);
  } catch (error) {
    await removeMediaImage(saved.filename).catch(() => {});
    throw error;
  }
}

export async function updateMediaAsset(id, input, user, db = { query }) {
  const existing = await db.query('SELECT * FROM media_library_assets WHERE id = $1', [id]);
  const asset = existing.rows[0];
  if (!asset) throw new AppError(404, 'MEDIA_NOT_FOUND', 'Зображення не знайдено.');
  if (user.role !== 'admin' && asset.created_by !== user.id) {
    throw new AppError(403, 'MEDIA_UPDATE_DENIED', 'Редагувати це зображення може автор або адміністратор.');
  }
  const updated = await db.query(
    `UPDATE media_library_assets
     SET original_name = $2, alt_text = $3, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, input.name, input.altText]
  );
  return serializeMediaAsset(updated.rows[0]);
}

export async function deleteMediaAsset(id, user, db = { query }) {
  const existing = await db.query('SELECT * FROM media_library_assets WHERE id = $1', [id]);
  const asset = existing.rows[0];
  if (!asset) throw new AppError(404, 'MEDIA_NOT_FOUND', 'Зображення не знайдено.');
  if (user.role !== 'admin' && asset.created_by !== user.id) {
    throw new AppError(403, 'MEDIA_DELETE_DENIED', 'Видалити це зображення може автор або адміністратор.');
  }
  await removeMediaImage(asset.storage_key);
  await db.query('DELETE FROM media_library_assets WHERE id = $1', [id]);
}
