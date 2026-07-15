import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '../../lib/app-error.js';

const maxCatalogImageBytes = 8 * 1024 * 1024;
const maxOriginalImageBytes = 12 * 1024 * 1024;
const allowedOriginalTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);

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

function assertWebp(buffer) {
  const riff = buffer.subarray(0, 4).toString('ascii');
  const webp = buffer.subarray(8, 12).toString('ascii');
  if (riff !== 'RIFF' || webp !== 'WEBP') {
    throw new AppError(415, 'CATALOG_MEDIA_INVALID_WEBP', 'Завантажте коректне WebP-зображення.');
  }
}

function extensionForMime(type) {
  if (type === 'image/png') return 'png';
  if (type === 'image/jpeg') return 'jpg';
  return 'webp';
}

async function saveBuffer(buffer, folder, filename) {
  const dir = path.join(catalogMediaDir, folder);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), buffer, { flag: 'wx' });
  return folder ? `/media/catalog/${folder}/${filename}` : `/media/catalog/${filename}`;
}

export async function saveCatalogWebpImage(buffer, originalName = '') {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw new AppError(422, 'CATALOG_MEDIA_EMPTY', 'Файл зображення порожній.');
  }
  if (buffer.length > maxCatalogImageBytes) {
    throw new AppError(413, 'CATALOG_MEDIA_TOO_LARGE', 'Фото має бути меншим за 8 МБ.');
  }
  assertWebp(buffer);
  const filename = `${Date.now()}-${safeName(originalName)}-${randomUUID()}.webp`;
  const url = await saveBuffer(buffer, '', filename);
  return {
    url,
    filename,
    size: buffer.length,
    mimeType: 'image/webp'
  };
}

export async function saveCatalogMediaAsset({
  webpBuffer,
  webpName = 'catalog-photo.webp',
  originalBuffer = null,
  originalName = '',
  originalMimeType = ''
}) {
  const optimized = await saveCatalogWebpImage(webpBuffer, webpName);
  let original = null;

  if (originalBuffer) {
    if (!Buffer.isBuffer(originalBuffer) || !originalBuffer.length) {
      throw new AppError(422, 'CATALOG_ORIGINAL_MEDIA_EMPTY', 'Оригінальний файл зображення порожній.');
    }
    if (originalBuffer.length > maxOriginalImageBytes) {
      throw new AppError(413, 'CATALOG_ORIGINAL_MEDIA_TOO_LARGE', 'Оригінальне фото має бути меншим за 12 МБ.');
    }
    if (!allowedOriginalTypes.has(originalMimeType)) {
      throw new AppError(415, 'CATALOG_ORIGINAL_MEDIA_UNSUPPORTED_TYPE', 'Оригінал має бути PNG, JPEG або WebP.');
    }
    const extension = extensionForMime(originalMimeType);
    const filename = `${Date.now()}-${safeName(originalName || webpName)}-${randomUUID()}.${extension}`;
    const url = await saveBuffer(originalBuffer, 'originals', filename);
    original = {
      url,
      filename,
      size: originalBuffer.length,
      mimeType: originalMimeType
    };
  }

  return {
    ...optimized,
    originalUrl: original?.url || '',
    originalFilename: original?.filename || '',
    originalSize: original?.size || 0,
    originalMimeType: original?.mimeType || ''
  };
}
