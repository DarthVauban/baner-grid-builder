import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { query } from '../../../db/pool.js';
import { AppError } from '../../../lib/app-error.js';
import { asyncHandler } from '../../../lib/async-handler.js';
import { parseInput } from '../../../lib/validation.js';
import { mediaLibraryDir } from '../../media/media.storage.js';
import { flagDirectory, fontDirectory, zeroRuntimeScript } from './assets.js';
import { readZeroReward, submitZeroBlock } from './submissions.js';

const router = Router();
const uuid = z.string().uuid();
const choice = z.union([z.string().max(5000), z.object({ custom: z.string().trim().min(1).max(500) }).strict()]);
const submit = z.object({
  versionId: uuid, formId: uuid, requestKey: uuid, pageUrl: z.string().max(4000).default(''),
  values: z.record(z.string().max(100), z.union([choice, z.boolean(), z.array(choice).max(30)]))
    .refine((values) => Object.keys(values).length <= 40)
});
const publicSubmitLimit = rateLimit({ windowMs: 60_000, limit: 24, standardHeaders: true, legacyHeaders: false });

router.get('/runtime.js', asyncHandler(async (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300').type('application/javascript').send(await zeroRuntimeScript());
}));

router.get('/flags/:file', (req, res, next) => {
  if (!/^[a-z]{2}\.svg$/u.test(req.params.file)) return next();
  res.sendFile(req.params.file, { root: flagDirectory, maxAge: '1d' }, (error) => { if (error) next(error); });
});

router.get('/fonts/:file', (req, res, next) => {
  if (!/^kk-(inter|montserrat|roboto)(-italic)?-v1\.woff2$/u.test(req.params.file)) return next();
  res.sendFile(req.params.file, { root: fontDirectory, maxAge: '1d' }, (error) => { if (error) next(error); });
});

router.get('/media/:id', asyncHandler(async (req, res, next) => {
  const id = parseInput(uuid, req.params.id);
  const snapshot = await query('SELECT mime, bytes FROM popup_zero_media_snapshots WHERE media_id = $1', [id]);
  if (snapshot.rows.length) return res.set('Cache-Control', 'public, max-age=31536000, immutable')
    .type(snapshot.rows[0].mime).send(snapshot.rows[0].bytes);
  const result = await query('SELECT storage_key FROM media_library_assets WHERE id = $1', [id]);
  if (!result.rows.length) throw new AppError(404, 'MEDIA_NOT_FOUND', 'Зображення не знайдено.');
  res.sendFile(result.rows[0].storage_key, { root: mediaLibraryDir, maxAge: '1d' }, (error) => { if (error) next(error); });
}));

router.post('/:id/submit', publicSubmitLimit, asyncHandler(async (req, res) => {
  const result = await submitZeroBlock(parseInput(uuid, req.params.id), parseInput(submit, req.body), req.get('origin'), req.ip);
  res.set('Cache-Control', 'no-store').status(result.repeated ? 200 : 201).json({ data: result });
}));

router.get('/rewards/:token', asyncHandler(async (req, res) => {
  const file = await readZeroReward(parseInput(z.string().regex(/^[a-f0-9]{64}$/u), req.params.token));
  res.attachment(file.name).set({
    'Content-Type': file.mime, 'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer'
  }).send(file.bytes);
}));

export default router;
