import { AppError } from '../lib/app-error.js';

export function notFoundHandler(req, res, next) {
  next(new AppError(404, 'NOT_FOUND', 'Маршрут не знайдено.'));
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  if (error?.type === 'entity.too.large' || error?.status === 413 || error?.statusCode === 413) {
    return res.status(413).json({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Файл або запит завеликий. Кожне фото має бути до 3 МБ.' }
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

  console.error(error);
  return res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Внутрішня помилка сервера.' }
  });
}
