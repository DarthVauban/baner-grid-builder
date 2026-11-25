import { Router } from 'express';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/app-error.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { verifyAccessToken } from '../../lib/jwt.js';
import { getSessionToken, requireAuth, requireRole } from '../../middleware/auth.js';
import { listHoroshopWidgetReleases, publishHoroshopWidgetRelease } from './widget-release.service.js';

const router = Router();
router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
router.use(requireAuth);

function canPublish(req) {
  if (req.user.role !== 'admin' || !req.user.twoFactorEnabled) return false;
  const { iat } = verifyAccessToken(getSessionToken(req));
  const enrolledAt = new Date(req.user.twoFactorConfirmedAt || 0).getTime();
  return enrolledAt > 0 && Number.isSafeInteger(iat) && iat >= Math.floor(enrolledAt / 1000);
}

router.get('/releases', asyncHandler(async (req, res) => {
  res.json({ data: { releases: await listHoroshopWidgetReleases(), canPublish: canPublish(req) } });
}));

router.post('/releases', requireRole('admin'), asyncHandler(async (req, res) => {
  if (!canPublish(req)) {
    throw new AppError(403, 'WIDGET_PUBLISH_2FA_REQUIRED', 'Увімкніть 2FA та повторно увійдіть, щоб опублікувати випуск.');
  }

  const origin = new URL(env.APP_ORIGIN || `${req.protocol}://${req.get('host')}`);
  if (origin.protocol !== 'https:' && (env.isProduction || origin.protocol !== 'http:')) {
    throw new AppError(409, 'WIDGET_PUBLISH_HTTPS_REQUIRED', 'Для публікації потрібна HTTPS-адреса робочого простору.');
  }
  const requestOrigin = req.get('Origin');
  if (requestOrigin && requestOrigin !== origin.origin) {
    throw new AppError(403, 'WIDGET_PUBLISH_ORIGIN_DENIED', 'Відкрийте налаштовану адресу робочого простору для публікації.');
  }
  const release = await publishHoroshopWidgetRelease(origin.origin, req.user);
  res.status(201).json({ data: release });
}));

export default router;
