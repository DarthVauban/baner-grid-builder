import { AppError } from '../../../lib/app-error.js';
import { HoroshopApiError } from './horoshop.client.js';

export function publicationError(error) {
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
    if (error.code === 'invalid_response') {
      return new AppError(502, 'HOROSHOP_PHOTO_INVALID_RESPONSE', 'Хорошоп повернув некоректну відповідь під час оновлення фотографій.');
    }
    if (error.code === 'api_rejected') {
      return new AppError(502, 'HOROSHOP_PHOTO_PUBLISH_REJECTED', 'Хорошоп відхилив оновлення фотографій без пояснення причини.');
    }
  }
  const transportCode = String(error?.code || error?.cause?.code || '').toUpperCase();
  if (error?.name === 'AbortError' || ['ABORT_ERR', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT'].includes(transportCode)) {
    return new AppError(504, 'HOROSHOP_PHOTO_PUBLISH_TIMEOUT', 'Хорошоп не завершив оновлення фотографій у відведений час. Перевірте товар перед повторною передачею.');
  }
  if (['ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH', 'ENOTFOUND', 'UND_ERR_SOCKET'].includes(transportCode)) {
    return new AppError(502, 'HOROSHOP_PHOTO_NETWORK_ERROR', 'Не вдалося з’єднатися з Хорошопом під час оновлення фотографій.');
  }
  return new AppError(502, 'HOROSHOP_PHOTO_PUBLISH_FAILED', 'Не вдалося передати фотографії у Хорошоп.');
}

export function publicationArticle(value) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 160);
}

export function contextualPublicationError(error, article) {
  const safe = publicationError(error);
  const safeArticle = publicationArticle(article);
  const prefix = safeArticle ? `Артикул «${safeArticle}»: ` : '';
  return new AppError(safe.status, safe.code, `${prefix}${safe.message}`, {
    ...(safe.details && typeof safe.details === 'object' ? safe.details : {}),
    ...(safeArticle ? { article: safeArticle } : {})
  });
}

export async function withPublicationHeartbeat(operation, onHeartbeat, intervalMilliseconds) {
  const interval = Number(intervalMilliseconds);
  if (!onHeartbeat || !Number.isFinite(interval) || interval <= 0) return operation();
  const timer = setInterval(() => {
    try { onHeartbeat(); } catch { return; }
  }, interval);
  timer.unref?.();
  try {
    return await operation();
  } finally {
    clearInterval(timer);
  }
}

export function absoluteMediaUrl(origin, value) {
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
