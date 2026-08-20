import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../../config/env.js';
import { AppError } from '../../../lib/app-error.js';
import { asyncHandler } from '../../../lib/async-handler.js';
import { parseInput } from '../../../lib/validation.js';
import { requireAuth } from '../../../middleware/auth.js';
import { requireToolAccess } from '../../access/access.service.js';
import { horoshopPhotoDesktopService } from './photo-desktop.service.js';
import { horoshopPhotoService } from './photo.service.js';

const router = Router();
const uuidParams = z.object({ id: z.string().uuid() });
const selectionItemParams = z.object({ id: z.string().uuid(), itemId: z.string().uuid() });
const deviceParams = z.object({ id: z.string().uuid() });
const selectionInputSchema = z.object({
  name: z.string().trim().max(160).optional().default(''),
  entries: z.array(z.string().trim().min(1).max(500)).min(1).max(1_000)
});
const filteredSelectionSchema = z.object({
  name: z.string().trim().max(160).optional().default(''),
  filters: z.object({
    search: z.string().trim().max(160).optional().default(''),
    category: z.string().trim().max(255).optional().default(''),
    availability: z.string().trim().max(200).optional().default(''),
    visibility: z.enum(['all', 'visible', 'hidden']).optional().default('all')
  })
});
const selectionItemSchema = z.object({
  productId: z.string().uuid(),
  modificationId: z.string().uuid().nullable().optional().default(null),
  inputValue: z.string().trim().max(500).optional().default('')
});
const draftSchema = z.object({
  productId: z.string().uuid(),
  modificationId: z.string().uuid().nullable().optional().default(null),
  sourceUrl: z.string().trim().max(2_000).refine((value) => {
    if (!value) return true;
    try {
      return new URL(value).protocol === 'https:';
    } catch {
      return false;
    }
  }, 'Вкажіть коректне HTTPS-посилання на сторінку товару.')
});
const assetSelectionSchema = z.object({ assetIds: z.array(z.string().uuid()).max(40) });
const publicationSchema = z.object({ mode: z.enum(['append', 'replace']).default('append') });
const activeBatchQuerySchema = z.object({ selectionId: z.string().uuid().optional() });

function publicAppOrigin() {
  return env.APP_ORIGIN || env.mobilePublicOrigin;
}

router.use(requireAuth, requireToolAccess('horoshop_photo_parser'));
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

router.get('/selections', asyncHandler(async (_req, res) => {
  res.json({ data: await horoshopPhotoService.listSelections() });
}));

router.get('/desktop/devices', asyncHandler(async (req, res) => {
  res.json({ data: await horoshopPhotoDesktopService.listDevices(req.user.id) });
}));

router.post('/desktop/pairings', asyncHandler(async (req, res) => {
  res.status(201).json({ data: await horoshopPhotoDesktopService.createPairing(req.user.id) });
}));

router.get('/desktop/pairings/:id', asyncHandler(async (req, res) => {
  const { id } = parseInput(deviceParams, req.params);
  res.json({ data: await horoshopPhotoDesktopService.pairing(req.user.id, id) });
}));

router.delete('/desktop/devices/:id', asyncHandler(async (req, res) => {
  const { id } = parseInput(deviceParams, req.params);
  await horoshopPhotoDesktopService.revokeDevice(req.user.id, id);
  res.status(204).end();
}));

router.post('/selections', asyncHandler(async (req, res) => {
  const input = parseInput(selectionInputSchema, req.body);
  res.status(201).json({ data: await horoshopPhotoService.createSelection({ ...input, userId: req.user.id }) });
}));

router.post('/selections/from-filter', asyncHandler(async (req, res) => {
  const input = parseInput(filteredSelectionSchema, req.body);
  res.status(201).json({ data: await horoshopPhotoService.createFilteredSelection({
    ...input,
    userId: req.user.id
  }) });
}));

router.get('/selections/:id', asyncHandler(async (req, res) => {
  const { id } = parseInput(uuidParams, req.params);
  res.json({ data: await horoshopPhotoService.selection(id) });
}));

router.delete('/selections/:id', asyncHandler(async (req, res) => {
  const { id } = parseInput(uuidParams, req.params);
  await horoshopPhotoService.deleteSelection(id);
  res.status(204).end();
}));

router.post('/selections/:id/items', asyncHandler(async (req, res) => {
  const { id } = parseInput(uuidParams, req.params);
  const input = parseInput(selectionItemSchema, req.body);
  res.json({ data: await horoshopPhotoService.addSelectionItem(id, input) });
}));

router.delete('/selections/:id/items/:itemId', asyncHandler(async (req, res) => {
  const { id, itemId } = parseInput(selectionItemParams, req.params);
  res.json({ data: await horoshopPhotoService.removeSelectionItem(id, itemId) });
}));

router.put('/drafts', asyncHandler(async (req, res) => {
  const input = parseInput(draftSchema, req.body);
  res.json({ data: await horoshopPhotoService.saveDraft({ ...input, userId: req.user.id }) });
}));

router.put('/drafts/:id/assets', asyncHandler(async (req, res) => {
  const { id } = parseInput(uuidParams, req.params);
  const { assetIds } = parseInput(assetSelectionSchema, req.body);
  await horoshopPhotoService.selectAssets(id, assetIds);
  res.json({ data: { updated: true } });
}));

router.post('/selections/:id/parse', asyncHandler(async (req, res) => {
  const { id } = parseInput(uuidParams, req.params);
  await horoshopPhotoDesktopService.assertAvailableDevice(req.user.id);
  res.status(202).json({ data: await horoshopPhotoService.createBatch({
    selectionId: id,
    userId: req.user.id,
    executor: 'desktop'
  }) });
}));

router.post('/drafts/:id/parse', asyncHandler(async (req, res) => {
  const { id } = parseInput(uuidParams, req.params);
  await horoshopPhotoDesktopService.assertAvailableDevice(req.user.id);
  res.status(202).json({ data: await horoshopPhotoService.createBatch({
    draftIds: [id],
    userId: req.user.id,
    executor: 'desktop'
  }) });
}));

router.get('/batches/active', asyncHandler(async (req, res) => {
  const { selectionId } = parseInput(activeBatchQuerySchema, req.query);
  res.json({ data: await horoshopPhotoService.activeBatch({ selectionId }) });
}));

router.get('/batches/:id', asyncHandler(async (req, res) => {
  const { id } = parseInput(uuidParams, req.params);
  res.json({ data: await horoshopPhotoService.loadBatch(id) });
}));

router.post('/drafts/:id/publish', asyncHandler(async (req, res) => {
  const { id } = parseInput(uuidParams, req.params);
  const input = parseInput(publicationSchema, req.body);
  res.json({ data: await horoshopPhotoService.publishDraft(id, {
    ...input,
    userId: req.user.id,
    publicOrigin: publicAppOrigin()
  }) });
}));

router.post('/selections/:id/publish/stream', asyncHandler(async (req, res) => {
  const { id } = parseInput(uuidParams, req.params);
  const input = parseInput(publicationSchema, req.body);
  res.status(200);
  res.set({
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-cache, no-store',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders();
  const send = (event) => {
    if (!res.destroyed && !res.writableEnded) {
      res.write(`${JSON.stringify(event)}\n`);
      if (typeof res.flush === 'function') res.flush();
    }
  };
  try {
    const data = await horoshopPhotoService.publishSelection(id, {
      ...input,
      userId: req.user.id,
      publicOrigin: publicAppOrigin(),
      onProgress: (progress) => send({ type: 'progress', data: progress })
    });
    send({ type: 'result', data });
  } catch (error) {
    const safeError = error instanceof AppError
      ? error
      : new AppError(500, 'INTERNAL_ERROR', 'Внутрішня помилка сервера.');
    if (!(error instanceof AppError)) console.error(error);
    send({
      type: 'error',
      status: safeError.status,
      error: { code: safeError.code, message: safeError.message, details: safeError.details }
    });
  } finally {
    if (!res.destroyed && !res.writableEnded) res.end();
  }
}));

export default router;
