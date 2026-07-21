import { AppError } from '../lib/app-error.js';

const DATABASE_UNAVAILABLE_CODES = new Set([
  '08000', '08001', '08003', '08004', '08006', '08007', '08P01',
  '53100', '53200', '53300', '53400', '57P01', '57P02', '57P03',
  '58000', '58030',
  'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT'
]);

const DATABASE_UNAVAILABLE_MESSAGES = [
  'connection terminated unexpectedly',
  'timeout exceeded when trying to connect',
  'terminating connection due to administrator command'
];

function isDatabaseUnavailable(error) {
  let current = error;
  for (let depth = 0; current && depth < 4; depth += 1) {
    if (DATABASE_UNAVAILABLE_CODES.has(String(current.code || ''))) return true;
    const message = String(current.message || '').toLowerCase();
    if (DATABASE_UNAVAILABLE_MESSAGES.some((fragment) => message.includes(fragment))) return true;
    current = current.cause;
  }
  return false;
}

export function notFoundHandler(req, res, next) {
  next(new AppError(404, 'NOT_FOUND', 'Маршрут не знайдено.'));
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  if (error?.type === 'entity.too.large' || error?.status === 413 || error?.statusCode === 413) {
    const message = String(req.originalUrl || '').startsWith('/api/catalog/media')
      ? 'Фото товару завелике. Кожне фото має бути до 5 МБ.'
      : 'Файл або запит завеликий.';
    return res.status(413).json({
      error: { code: 'PAYLOAD_TOO_LARGE', message }
    });
  }

  if (error instanceof SyntaxError && 'body' in error) {
    return res.status(400).json({
      error: { code: 'INVALID_JSON', message: 'Некоректний JSON у запиті.' }
    });
  }

  if (error instanceof AppError) {
    return res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        details: error.details
      }
    });
  }

  if (error?.code === '23505') {
    return res.status(409).json({
      error: { code: 'CONFLICT', message: 'Такий запис уже існує.' }
    });
  }

  if (isDatabaseUnavailable(error)) {
    console.error('Database connection unavailable', error);
    return res.status(503).json({
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Сервіс тимчасово недоступний через проблему зі з’єднанням з базою даних. Спробуйте ще раз за хвилину.'
      }
    });
  }

  console.error(error);
  return res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Внутрішня помилка сервера.' }
  });
}
