import { randomUUID } from 'node:crypto';
import { Router, raw } from 'express';
import { z } from 'zod';
import { query } from '../../../db/pool.js';
import { AppError } from '../../../lib/app-error.js';
import { asyncHandler } from '../../../lib/async-handler.js';
import { parseInput } from '../../../lib/validation.js';
import { horoshopCatalogService } from '../../search/horoshop/catalog.service.js';
import { canonicalPresetPaint, PAINT_PRESET_LIMIT } from './paint-presets.mjs';
import { listZeroContacts, rewardFileLimit, uploadZeroReward } from './submissions.js';
import {
  createZeroBlock, currentZeroStore, deleteZeroBlock, getZeroBlock, getZeroProducts,
  pauseZeroBlock, publishZeroBlock, saveZeroBlock, transaction
} from './workspace.js';

const router = Router();
const uuid = z.string().uuid();
const revision = z.number().int().min(1);
const page = z.coerce.number().int().min(1).max(10000).default(1);
const revisions = z.object({ draftRevision: revision, campaignRevision: revision });
const publish = revisions.extend({ operationId: uuid });
const draft = z.object({ revision, document: z.record(z.string(), z.unknown()) });
const id = (req) => parseInput(uuid, req.params.id);

// The parent router already requires an authenticated user and access to popup_banners.
router.post('/', asyncHandler(async (req, res) => {
  const { name } = parseInput(z.object({ name: z.string().trim().min(2).max(100) }), req.body);
  res.status(201).json({ data: await createZeroBlock(name, req.user.id) });
}));

router.get('/catalog', asyncHandler(async (req, res) => {
  const input = parseInput(z.object({ search: z.string().trim().max(160).default(''), page }), req.query);
  const store = await currentZeroStore();
  if (!store) return res.json({ data: { products: [], total: 0, page: input.page, pageSize: 24 } });
  const catalog = await horoshopCatalogService.catalog({
    ...input, category: '', availability: '', visibility: 'visible', photoStatus: 'all',
    createdFrom: '', createdTo: '', state: 'active', pageSize: 24
  });
  const products = await getZeroProducts(catalog.items.map((item) => item.id));
  res.json({ data: { products: catalog.items.map((item) => products[item.id]).filter(Boolean), total: catalog.total,
    page: catalog.page, pageSize: catalog.pageSize } });
}));

router.post('/products', asyncHandler(async (req, res) => {
  const { ids } = parseInput(z.object({ ids: z.array(uuid).max(101) }), req.body);
  res.json({ data: await getZeroProducts(ids) });
}));

router.get('/contacts', asyncHandler(async (req, res) => {
  const input = parseInput(z.object({ page, campaignId: uuid.optional() }), req.query);
  res.set('Cache-Control', 'no-store').json({ data: await listZeroContacts(input) });
}));

router.post('/reward-files', raw({ type: 'application/octet-stream', limit: rewardFileLimit }), asyncHandler(async (req, res) => {
  let name;
  try { name = decodeURIComponent(req.get('x-file-name') || '').trim(); }
  catch { throw new AppError(422, 'ZERO_BLOCK_INVALID_FILE', 'Некоректне ім’я файлу.'); }
  res.status(201).json({ data: await uploadZeroReward(name, req.body) });
}));

router.get('/paints', asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT id, paint FROM popup_zero_paint_presets WHERE user_id = $1 ORDER BY created_at, id', [req.user.id]);
  res.json({ data: rows });
}));

router.post('/paints', asyncHandler(async (req, res) => {
  const input = parseInput(z.object({ paint: z.string().max(2000) }), req.body);
  const paint = canonicalPresetPaint(input.paint);
  if (!paint) throw new AppError(422, 'ZERO_BLOCK_PAINT_INVALID', 'Некоректна заливка.');
  const preset = await transaction(async (db) => {
    await db.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [req.user.id]);
    const { rows } = await db.query('SELECT id, paint FROM popup_zero_paint_presets WHERE user_id = $1', [req.user.id]);
    const existing = rows.find((item) => item.paint === paint);
    if (existing) return existing;
    if (rows.length >= PAINT_PRESET_LIMIT) throw new AppError(409, 'ZERO_BLOCK_PAINT_LIMIT', 'Бібліотека зразків заповнена.');
    const id = randomUUID();
    await db.query('INSERT INTO popup_zero_paint_presets (id, user_id, paint) VALUES ($1, $2, $3)', [id, req.user.id, paint]);
    return { id, paint };
  });
  res.status(201).json({ data: preset });
}));

router.delete('/paints/:id', asyncHandler(async (req, res) => {
  await query('DELETE FROM popup_zero_paint_presets WHERE id = $1 AND user_id = $2', [id(req), req.user.id]);
  res.status(204).end();
}));

router.get('/:id', asyncHandler(async (req, res) => {
  res.json({ data: await getZeroBlock(id(req)) });
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const { revision, document } = parseInput(draft, req.body);
  res.json({ data: await saveZeroBlock(id(req), revision, document, req.user.id) });
}));

router.post('/:id/publish', asyncHandler(async (req, res) => {
  res.json({ data: await publishZeroBlock(id(req), parseInput(publish, req.body), req.user.id) });
}));

router.post('/:id/pause', asyncHandler(async (req, res) => {
  const { campaignRevision } = parseInput(revisions.pick({ campaignRevision: true }), req.body);
  res.json({ data: await pauseZeroBlock(id(req), campaignRevision, req.user.id) });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  await deleteZeroBlock(id(req), parseInput(revisions, req.body), req.user.id);
  res.status(204).end();
}));

export default router;
