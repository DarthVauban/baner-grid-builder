import { Router, raw } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { AppError } from '../../../lib/app-error.js';
import { asyncHandler } from '../../../lib/async-handler.js';
import { parseInput } from '../../../lib/validation.js';
import { requirePhotoDesktopAuth } from '../../../middleware/photo-desktop-auth.js';
import { horoshopPhotoDesktopService } from './photo-desktop.service.js';

const router = Router();
const idParams = z.object({ id: z.string().uuid() });
const httpsUrl = z.string().trim().max(4_000).refine((value) => {
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}, 'Вкажіть коректне HTTPS-посилання.');
const claimSchema = z.object({
  code: z.string().trim().min(8).max(32),
  deviceName: z.string().trim().min(2).max(160),
  appVersion: z.string().trim().max(40).optional().default(''),
  installationId: z.string().uuid().nullable().optional().default(null),
  capabilities: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional().default({})
});
const progressSchema = z.object({
  phase: z.string().trim().max(40).optional().default(''),
  message: z.string().trim().max(300).optional().default(''),
  current: z.number().int().min(0).max(10_000).optional().default(0),
  total: z.number().int().min(0).max(10_000).optional().default(0),
  percentage: z.number().int().min(0).max(100).optional().default(0)
});
const sourceSchema = z.object({
  sourceUrl: httpsUrl,
  adapterId: z.string().trim().max(120).optional().default('')
});
const errorSchema = z.object({
  stage: z.string().trim().max(80).optional(),
  sourceUrl: z.string().trim().max(4_000).optional(),
  message: z.string().trim().max(1_000)
});
const completeSchema = sourceSchema.extend({
  foundCount: z.number().int().min(0).max(10_000).optional().default(0),
  errors: z.array(errorSchema).max(40).optional().default([])
});
const failSchema = z.object({
  message: z.string().trim().min(1).max(1_000),
  errors: z.array(errorSchema).max(40).optional().default([])
});
const uploadQuerySchema = z.object({
  sourceUrl: httpsUrl,
  sortOrder: z.coerce.number().int().min(0).max(39)
});

const pairingLimiter = rateLimit({
  windowMs: 10 * 60 * 1_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'TOO_MANY_PAIRING_ATTEMPTS', message: 'Забагато спроб підключення. Спробуйте пізніше.' } }
});

router.post('/pairings/claim', pairingLimiter, asyncHandler(async (req, res) => {
  const input = parseInput(claimSchema, req.body);
  res.status(201).json({ data: await horoshopPhotoDesktopService.claimPairing(input) });
}));

router.use(requirePhotoDesktopAuth);
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

router.get('/session', asyncHandler(async (req, res) => {
  res.json({ data: { device: req.photoParserDevice } });
}));

router.get('/jobs', asyncHandler(async (req, res) => {
  res.json({ data: await horoshopPhotoDesktopService.listJobs(req.photoParserDevice) });
}));

router.post('/jobs/:id/claim', asyncHandler(async (req, res) => {
  const { id } = parseInput(idParams, req.params);
  res.json({ data: await horoshopPhotoDesktopService.claimJob(req.photoParserDevice, id) });
}));

router.post('/jobs/:id/heartbeat', asyncHandler(async (req, res) => {
  const { id } = parseInput(idParams, req.params);
  const progress = parseInput(progressSchema, req.body);
  res.json({ data: await horoshopPhotoDesktopService.heartbeat(req.photoParserDevice, id, progress) });
}));

router.put('/jobs/:id/source', asyncHandler(async (req, res) => {
  const { id } = parseInput(idParams, req.params);
  const input = parseInput(sourceSchema, req.body);
  res.json({ data: await horoshopPhotoDesktopService.saveSource(req.photoParserDevice, id, input) });
}));

router.post('/jobs/:id/assets', raw({ type: 'image/*', limit: '8mb' }), asyncHandler(async (req, res) => {
  const { id } = parseInput(idParams, req.params);
  const input = parseInput(uploadQuerySchema, req.query);
  const contentType = String(req.get('content-type') || '').toLowerCase();
  if (!contentType.startsWith('image/')) {
    throw new AppError(415, 'PHOTO_DESKTOP_UPLOAD_TYPE', 'Передайте файл зображення.');
  }
  if (!Buffer.isBuffer(req.body) || !req.body.length) {
    throw new AppError(422, 'PHOTO_DESKTOP_UPLOAD_EMPTY', 'Файл фотографії порожній.');
  }
  const originalName = (() => {
    try { return decodeURIComponent(String(req.get('x-file-name') || 'photo.webp')); } catch { return 'photo.webp'; }
  })();
  const data = await horoshopPhotoDesktopService.uploadAsset(req.photoParserDevice, id, {
    ...input,
    buffer: req.body,
    originalName
  });
  res.status(201).json({ data });
}));

router.post('/jobs/:id/complete', asyncHandler(async (req, res) => {
  const { id } = parseInput(idParams, req.params);
  const input = parseInput(completeSchema, req.body);
  res.json({ data: await horoshopPhotoDesktopService.completeJob(req.photoParserDevice, id, input) });
}));

router.post('/jobs/:id/fail', asyncHandler(async (req, res) => {
  const { id } = parseInput(idParams, req.params);
  const input = parseInput(failSchema, req.body);
  res.json({ data: await horoshopPhotoDesktopService.failJob(req.photoParserDevice, id, input) });
}));

router.post('/jobs/:id/release', asyncHandler(async (req, res) => {
  const { id } = parseInput(idParams, req.params);
  res.json({ data: await horoshopPhotoDesktopService.releaseJob(req.photoParserDevice, id) });
}));

export default router;
