import { query } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import { removeMediaImage, saveOptimizedMediaImage } from './media.storage.js';

export function serializeMediaAsset(row) {
  return {
    id: row.id,
    folderId: row.folder_id || null,
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

export function serializeMediaFolder(row) {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parent_id || null,
    createdBy: row.created_by ? { id: row.created_by, name: row.creator_name || '' } : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function getFolder(folderId, db) {
  if (!folderId) return null;
  const result = await db.query('SELECT * FROM media_library_folders WHERE id = $1', [folderId]);
  const folder = result.rows[0];
  if (!folder) throw new AppError(404, 'MEDIA_FOLDER_NOT_FOUND', 'Папку не знайдено.');
  return folder;
}

async function assertFolderNameAvailable({ name, parentId = null, excludeId = null }, db) {
  const params = parentId ? [parentId, name, excludeId] : [name, excludeId];
  const result = await db.query(
    parentId
      ? `SELECT id FROM media_library_folders
         WHERE parent_id = $1 AND LOWER(name) = LOWER($2) AND ($3::UUID IS NULL OR id <> $3)
         LIMIT 1`
      : `SELECT id FROM media_library_folders
         WHERE parent_id IS NULL AND LOWER(name) = LOWER($1) AND ($2::UUID IS NULL OR id <> $2)
         LIMIT 1`,
    params
  );
  if (result.rows[0]) {
    throw new AppError(409, 'MEDIA_FOLDER_EXISTS', 'Папка з такою назвою вже існує на цьому рівні.');
  }
}

export async function listMediaAssets({ search = '', folderId = null, page = 1, pageSize = 30 }, db = { query }) {
  const offset = (page - 1) * pageSize;
  const term = search.trim();
  await getFolder(folderId, db);
  const folderFilter = folderId ? 'asset.folder_id = $4' : 'asset.folder_id IS NULL';
  const params = folderId ? [term, pageSize, offset, folderId] : [term, pageSize, offset];
  const countFolderFilter = folderId ? 'folder_id = $2' : 'folder_id IS NULL';
  const countParams = folderId ? [term, folderId] : [term];
  const [items, count] = await Promise.all([
    db.query(
      `SELECT asset.*, creator.name AS creator_name
       FROM media_library_assets AS asset
       LEFT JOIN users AS creator ON creator.id = asset.created_by
       WHERE (${folderFilter})
         AND ($1 = '' OR asset.original_name ILIKE '%' || $1 || '%' OR asset.alt_text ILIKE '%' || $1 || '%')
       ORDER BY asset.created_at DESC
       LIMIT $2 OFFSET $3`,
      params
    ),
    db.query(
      `SELECT COUNT(*)::INTEGER AS total
       FROM media_library_assets
       WHERE (${countFolderFilter})
         AND ($1 = '' OR original_name ILIKE '%' || $1 || '%' OR alt_text ILIKE '%' || $1 || '%')`,
      countParams
    )
  ]);
  return {
    items: items.rows.map(serializeMediaAsset),
    total: Number(count.rows[0]?.total || 0),
    page,
    pageSize
  };
}

export async function listMediaAssetIds({ folderId = null }, db = { query }) {
  await getFolder(folderId, db);
  const result = await db.query(
    `SELECT id
     FROM media_library_assets
     WHERE ${folderId ? 'folder_id = $1' : 'folder_id IS NULL'}
     ORDER BY created_at DESC`,
    folderId ? [folderId] : []
  );
  return result.rows.map((row) => row.id);
}

export async function listMediaFolders({ parentId = null }, db = { query }) {
  const all = await db.query(
    `SELECT folder.*, creator.name AS creator_name
     FROM media_library_folders AS folder
     LEFT JOIN users AS creator ON creator.id = folder.created_by
     ORDER BY LOWER(folder.name), folder.created_at`
  );
  const folders = all.rows.map(serializeMediaFolder);
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  if (parentId && !byId.has(parentId)) {
    throw new AppError(404, 'MEDIA_FOLDER_NOT_FOUND', 'Папку не знайдено.');
  }
  const breadcrumbs = [];
  let current = parentId ? byId.get(parentId) : null;
  const seen = new Set();
  while (current && !seen.has(current.id)) {
    breadcrumbs.unshift(current);
    seen.add(current.id);
    current = current.parentId ? byId.get(current.parentId) : null;
  }
  return {
    items: folders.filter((folder) => folder.parentId === parentId),
    breadcrumbs
  };
}

export async function createMediaFolder({ name, parentId = null, userId }, db = { query }) {
  await getFolder(parentId, db);
  await assertFolderNameAvailable({ name, parentId }, db);
  const inserted = await db.query(
    `INSERT INTO media_library_folders (name, parent_id, created_by)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [name, parentId, userId]
  );
  return serializeMediaFolder(inserted.rows[0]);
}

export async function ensureMediaFolder({ name, parentId = null, userId }, db = { query }) {
  await getFolder(parentId, db);
  const params = parentId ? [parentId, name] : [name];
  const existing = await db.query(
    parentId
      ? `SELECT * FROM media_library_folders
         WHERE parent_id = $1 AND LOWER(name) = LOWER($2)
         LIMIT 1`
      : `SELECT * FROM media_library_folders
         WHERE parent_id IS NULL AND LOWER(name) = LOWER($1)
         LIMIT 1`,
    params
  );
  if (existing.rows[0]) return serializeMediaFolder(existing.rows[0]);
  return createMediaFolder({ name, parentId, userId }, db);
}

export async function updateMediaFolder(id, input, user, db = { query }) {
  const folder = await getFolder(id, db);
  if (user.role !== 'admin' && folder.created_by !== user.id) {
    throw new AppError(403, 'MEDIA_FOLDER_UPDATE_DENIED', 'Перейменувати цю папку може автор або адміністратор.');
  }
  await assertFolderNameAvailable({ name: input.name, parentId: folder.parent_id, excludeId: id }, db);
  const updated = await db.query(
    `UPDATE media_library_folders
     SET name = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, input.name]
  );
  return serializeMediaFolder(updated.rows[0]);
}

export async function deleteMediaFolder(id, user, db = { query }) {
  const folder = await getFolder(id, db);
  if (user.role !== 'admin' && folder.created_by !== user.id) {
    throw new AppError(403, 'MEDIA_FOLDER_DELETE_DENIED', 'Видалити цю папку може автор або адміністратор.');
  }
  const [child, asset] = await Promise.all([
    db.query('SELECT id FROM media_library_folders WHERE parent_id = $1 LIMIT 1', [id]),
    db.query('SELECT id FROM media_library_assets WHERE folder_id = $1 LIMIT 1', [id])
  ]);
  if (child.rows[0] || asset.rows[0]) {
    throw new AppError(409, 'MEDIA_FOLDER_NOT_EMPTY', 'Спочатку видаліть файли та вкладені папки. Видаляти можна лише порожні папки.');
  }
  await db.query('DELETE FROM media_library_folders WHERE id = $1', [id]);
}

export async function createMediaAsset({ buffer, originalName, folderId = null, userId }, db = { query }) {
  await getFolder(folderId, db);
  const saved = await saveOptimizedMediaImage(buffer, originalName);
  try {
    const inserted = await db.query(
      `INSERT INTO media_library_assets (
         original_name, storage_key, url, mime_type, size_bytes, original_size_bytes,
         width, height, content_sha256, folder_id, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        String(originalName || 'image').slice(0, 255), saved.filename, saved.url, saved.mimeType,
        saved.size, saved.originalSize, saved.width, saved.height, saved.contentSha256, folderId, userId
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

export async function deleteMediaAssets(ids, user, db = { query }) {
  const placeholders = ids.map((_, index) => `$${index + 1}`).join(', ');
  const existing = await db.query(
    `SELECT * FROM media_library_assets WHERE id IN (${placeholders})`,
    ids
  );
  const assets = existing.rows;
  const denied = assets.find((asset) => user.role !== 'admin' && asset.created_by !== user.id);
  if (denied) {
    throw new AppError(403, 'MEDIA_DELETE_DENIED', 'Видалити вибрані зображення може їх автор або адміністратор.');
  }
  await Promise.all(assets.map((asset) => removeMediaImage(asset.storage_key)));
  if (assets.length) {
    const assetIds = assets.map((asset) => asset.id);
    const deletePlaceholders = assetIds.map((_, index) => `$${index + 1}`).join(', ');
    await db.query(`DELETE FROM media_library_assets WHERE id IN (${deletePlaceholders})`, assetIds);
  }
  return assets.length;
}
