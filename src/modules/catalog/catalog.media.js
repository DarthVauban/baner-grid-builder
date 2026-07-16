import { randomUUID } from 'node:crypto';
import { accessSync, constants, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AppError } from '../../lib/app-error.js';

const maxCatalogImageBytes = 5 * 1024 * 1024;
const allowedOriginalTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDir, '../../..');
const storageUnavailableCodes = new Set(['EACCES', 'EPERM', 'ENOENT', 'ENOSPC', 'EROFS']);

function canUseMediaDir(dir) {
  try {
    mkdirSync(dir, { recursive: true });
    accessSync(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveCatalogMediaDir() {
  const configured = process.env.CATALOG_MEDIA_DIR
    ? path.resolve(projectRoot, process.env.CATALOG_MEDIA_DIR)
    : '';
  const candidates = [
    configured,
    path.join(projectRoot, 'storage', 'catalog-media'),
    path.join(os.tmpdir(), 'mt-panel-catalog-media')
  ].filter(Boolean);
  return candidates.find(canUseMediaDir) || candidates[0];
}

export const catalogMediaDir = resolveCatalogMediaDir();

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
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, filename), buffer, { flag: 'wx' });
  } catch (error) {
    if (storageUnavailableCodes.has(error?.code)) {
      throw new AppError(507, 'CATALOG_MEDIA_STORAGE_UNAVAILABLE', 'Не вдалося записати фото у сховище. Перевірте доступність директорії медіа.');
    }
    throw error;
  }
  return folder ? `/media/catalog/${folder}/${filename}` : `/media/catalog/${filename}`;
}

export async function saveCatalogWebpImage(buffer, originalName = '') {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw new AppError(422, 'CATALOG_MEDIA_EMPTY', 'Файл зображення порожній.');
  }
  if (buffer.length > maxCatalogImageBytes) {
    throw new AppError(413, 'CATALOG_MEDIA_TOO_LARGE', 'Кожне фото має бути до 5 МБ.');
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
  if (originalBuffer && originalBuffer.length > maxCatalogImageBytes) {
    throw new AppError(413, 'CATALOG_ORIGINAL_MEDIA_TOO_LARGE', 'Кожне фото має бути до 5 МБ.');
  }
  if (originalBuffer && !allowedOriginalTypes.has(originalMimeType)) {
    throw new AppError(415, 'CATALOG_ORIGINAL_MEDIA_UNSUPPORTED_TYPE', 'Оригінал має бути PNG, JPG або WebP.');
  }

  const optimized = await saveCatalogWebpImage(webpBuffer, webpName);
  let original = null;

  if (originalBuffer) {
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
