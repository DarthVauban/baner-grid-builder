import { createHash, randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { AppError } from '../../lib/app-error.js';
import { catalogMediaDir } from '../catalog/catalog.media.js';

const maxUploadBytes = 15 * 1024 * 1024;
const maxInputPixels = 40_000_000;
const maxImageSide = 2400;
const supportedFormats = new Set(['jpeg', 'png', 'webp', 'avif', 'gif']);
const storageUnavailableCodes = new Set(['EACCES', 'EPERM', 'ENOENT', 'ENOSPC', 'EROFS']);

export const mediaLibraryDir = path.join(catalogMediaDir, 'library');

function safeStem(value) {
  const basename = path.parse(String(value || 'image')).name;
  return basename
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .toLowerCase() || 'image';
}

function imageError(error) {
  if (error instanceof AppError) return error;
  return new AppError(415, 'MEDIA_UNSUPPORTED_IMAGE', 'Не вдалося прочитати зображення. Завантажте PNG, JPG, WebP, AVIF або GIF.');
}

export async function optimizeMediaImage(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw new AppError(422, 'MEDIA_EMPTY', 'Файл зображення порожній.');
  }
  if (buffer.length > maxUploadBytes) {
    throw new AppError(413, 'MEDIA_TOO_LARGE', 'Зображення має бути до 15 МБ.');
  }

  try {
    const metadata = await sharp(buffer, { failOn: 'error', limitInputPixels: maxInputPixels }).metadata();
    if (!supportedFormats.has(metadata.format || '')) {
      throw new AppError(415, 'MEDIA_UNSUPPORTED_IMAGE', 'Підтримуються PNG, JPG, WebP, AVIF та GIF.');
    }

    const converted = await sharp(buffer, { failOn: 'error', limitInputPixels: maxInputPixels })
      .rotate()
      .resize({ width: maxImageSide, height: maxImageSide, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82, alphaQuality: 88, effort: 5, smartSubsample: true })
      .toBuffer({ resolveWithObject: true });

    return {
      buffer: converted.data,
      width: converted.info.width,
      height: converted.info.height,
      size: converted.data.length,
      originalSize: buffer.length,
      contentSha256: createHash('sha256').update(converted.data).digest('hex')
    };
  } catch (error) {
    throw imageError(error);
  }
}

export async function saveOptimizedMediaImage(buffer, originalName) {
  const optimized = await optimizeMediaImage(buffer);
  const filename = `${Date.now()}-${safeStem(originalName)}-${randomUUID()}.webp`;

  try {
    await mkdir(mediaLibraryDir, { recursive: true });
    await writeFile(path.join(mediaLibraryDir, filename), optimized.buffer, { flag: 'wx' });
  } catch (error) {
    if (storageUnavailableCodes.has(error?.code)) {
      throw new AppError(507, 'MEDIA_STORAGE_UNAVAILABLE', 'Не вдалося записати зображення у файлове сховище.');
    }
    throw error;
  }

  return {
    ...optimized,
    filename,
    url: `/media/catalog/library/${filename}`,
    mimeType: 'image/webp'
  };
}

export async function removeMediaImage(storageKey) {
  const filename = path.basename(String(storageKey || ''));
  if (!filename || filename !== storageKey) return;
  try {
    await unlink(path.join(mediaLibraryDir, filename));
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    if (storageUnavailableCodes.has(error?.code)) {
      throw new AppError(507, 'MEDIA_STORAGE_UNAVAILABLE', 'Не вдалося видалити зображення з файлового сховища.');
    }
    throw error;
  }
}
