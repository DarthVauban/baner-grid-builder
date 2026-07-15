import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '../../lib/app-error.js';

const maxCatalogImageBytes = 8 * 1024 * 1024;

export const catalogMediaDir = path.resolve(process.cwd(), process.env.CATALOG_MEDIA_DIR || path.join('storage', 'catalog-media'));

function safeName(value) {
  return String(value || 'photo')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .toLowerCase() || 'photo';
}

export async function saveCatalogWebpImage(buffer, originalName = '') {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw new AppError(422, 'CATALOG_MEDIA_EMPTY', 'Файл зображення порожній.');
  }
  if (buffer.length > maxCatalogImageBytes) {
    throw new AppError(413, 'CATALOG_MEDIA_TOO_LARGE', 'Фото має бути меншим за 8 МБ.');
  }
  await mkdir(catalogMediaDir, { recursive: true });
  const filename = `${Date.now()}-${safeName(originalName)}-${randomUUID()}.webp`;
  await writeFile(path.join(catalogMediaDir, filename), buffer, { flag: 'wx' });
  return {
    url: `/media/catalog/${filename}`,
    filename,
    size: buffer.length,
    mimeType: 'image/webp'
  };
}
