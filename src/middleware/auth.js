import { query } from '../db/pool.js';
import { AppError } from '../lib/app-error.js';
import { asyncHandler } from '../lib/async-handler.js';
import { verifyAccessToken } from '../lib/jwt.js';
import { serializeUser } from '../lib/serializers.js';
import { env } from '../config/env.js';

function getToken(req) {
  const bearer = req.get('authorization');
  if (bearer && bearer.startsWith('Bearer ')) return bearer.slice(7).trim();
  return req.cookies[env.COOKIE_NAME];
}

export const requireAuth = asyncHandler(async (req, res, next) => {
  const token = getToken(req);
  if (!token) throw new AppError(401, 'AUTH_REQUIRED', 'Потрібна авторизація.');

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (error) {
    throw new AppError(401, 'INVALID_SESSION', 'Сесія недійсна або завершилась.');
  }

  const result = await query(
    `SELECT id, name, first_name, last_name, email, department, position, avatar_mime,
            role, status, can_manage_tool_access, two_factor_enabled,
            two_factor_confirmed_at, approved_at, created_at, updated_at
     FROM users WHERE id = $1`,
    [payload.sub]
  );
  const user = result.rows[0];

  if (!user) throw new AppError(401, 'INVALID_SESSION', 'Користувача не знайдено.');
  if (user.status !== 'approved') {
    throw new AppError(403, 'ACCOUNT_NOT_APPROVED', 'Обліковий запис ще не схвалений адміністратором.');
  }

  req.user = serializeUser(user);
  next();
});

export function requireRole(role) {
  return function roleMiddleware(req, res, next) {
    if (!req.user || req.user.role !== role) {
      return next(new AppError(403, 'FORBIDDEN', 'Недостатньо прав для цієї дії.'));
    }
    next();
  };
}
