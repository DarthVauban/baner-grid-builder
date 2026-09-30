import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../../lib/async-handler.js';
import { parseInput } from '../../../lib/validation.js';
import { requireAuth } from '../../../middleware/auth.js';
import { requireToolAccess } from '../../access/access.service.js';
import { maximumStickerSelection } from './sticker.domain.js';
import { horoshopStickerService } from './sticker.service.js';
import { AppError } from '../../../lib/app-error.js';

const id = z.string().uuid();
const ids = z.array(id).min(1).max(maximumStickerSelection);
const stickerIds = z.array(z.string().trim().min(1).max(255)).max(200);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}, 'Вкажіть коректну дату.');
export const stickerFiltersSchema = z.object({
  search: z.string().trim().max(160).optional(), category: z.string().trim().max(255).optional(),
  includeChildren: z.preprocess((value) => value === 'false' ? false : value === 'true' ? true : value, z.boolean().default(true)),
  brand: z.string().trim().max(255).optional(), availability: z.string().trim().max(200).optional(),
  visibility: z.enum(['all', 'visible', 'hidden']).default('all'),
  priceMin: z.coerce.number().finite().min(0).optional(), priceMax: z.coerce.number().finite().min(0).optional(),
  createdFrom: date.optional(), createdTo: date.optional(),
  stickerMode: z.enum(['all', 'present', 'missing', 'none']).default('all'), stickerId: z.string().max(255).optional(),
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(10).max(100).default(25)
}).strict().superRefine((input, context) => {
  if (input.priceMin !== undefined && input.priceMax !== undefined && input.priceMin > input.priceMax) context.addIssue({ code: 'custom', path: ['priceMax'], message: 'Максимальна ціна має бути не меншою за мінімальну.' });
  if (input.createdFrom && input.createdTo && input.createdFrom > input.createdTo) context.addIssue({ code: 'custom', path: ['createdTo'], message: 'Перевірте діапазон дат.' });
  if (['present', 'missing'].includes(input.stickerMode) && !input.stickerId) context.addIssue({ code: 'custom', path: ['stickerId'], message: 'Оберіть стікер для фільтра.' });
});
const stickerStepSchema = z.object({ productIds: ids, addIds: stickerIds, removeIds: stickerIds }).strict();
const previewSchema = z.union([
  stickerStepSchema.extend({ name: z.string().trim().max(160).optional() }),
  z.object({ steps: z.array(stickerStepSchema).min(1).max(100), name: z.string().trim().max(160).optional() }).strict()
]);
const selectionSchema = z.object({ name: z.string().trim().min(1).max(160), productIds: ids }).strict();
const pagination = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(10).max(100).default(50) });

async function streamPreparation(res, prepare) {
  res.status(200).set({ 'Content-Type': 'application/x-ndjson; charset=utf-8', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  const send = (event) => {
    if (res.destroyed || res.writableEnded) return;
    res.write(event ? `${JSON.stringify(event)}\n` : '\n');
    if (typeof res.flush === 'function') res.flush();
  };
  // Keep the stream alive during slow upstream calls without inventing progress.
  const heartbeat = setInterval(() => send(null), 10_000);
  heartbeat.unref();
  const stopHeartbeat = () => clearInterval(heartbeat);
  res.once('close', stopHeartbeat);
  try {
    const data = await prepare((progress) => send({ type: 'progress', data: progress }));
    send({ type: 'result', data });
  } catch (error) {
    const safeError = error instanceof AppError ? error : new AppError(500, 'INTERNAL_ERROR', 'Не вдалося підготувати операцію зі стікерами.');
    send({ type: 'error', status: safeError.status, error: { code: safeError.code, message: safeError.message } });
  } finally {
    stopHeartbeat();
    res.off('close', stopHeartbeat);
    if (!res.destroyed && !res.writableEnded) res.end();
  }
}

export function createStickerRouter(service = horoshopStickerService) {
  const router = Router();
  router.use(requireAuth, requireToolAccess('horoshop_stickers'));
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/catalog', asyncHandler(async (req, res) => res.json({ data: await service.catalog(parseInput(stickerFiltersSchema, req.query)) })));
  router.post('/directory/refresh', asyncHandler(async (req, res) => res.json({ data: await service.refreshDirectory() })));
  router.post('/select', asyncHandler(async (req, res) => res.json({ data: await service.select(parseInput(stickerFiltersSchema, req.body)) })));
  router.post('/selection/summary', asyncHandler(async (req, res) => {
    const input = parseInput(z.object({ productIds: ids }).strict(), req.body);
    res.json({ data: await service.selectionSummary(input.productIds) });
  }));
  router.post('/resolve', asyncHandler(async (req, res) => {
    const input = parseInput(z.object({ entries: z.array(z.string().trim().min(1).max(200)).min(1).max(maximumStickerSelection) }).strict(), req.body);
    res.json({ data: await service.resolve(input.entries) });
  }));
  router.get('/selections', asyncHandler(async (req, res) => res.json({ data: await service.selections() })));
  router.post('/selections', asyncHandler(async (req, res) => res.status(201).json({ data: await service.saveSelection(parseInput(selectionSchema, req.body), req.user.id) })));
  router.delete('/selections/:id', asyncHandler(async (req, res) => res.json({ data: await service.removeSelection(parseInput(id, req.params.id), req.user.id) })));
  router.get('/operations', asyncHandler(async (req, res) => res.json({ data: await service.history() })));
  router.post('/operations/preview', asyncHandler(async (req, res) => res.status(201).json({ data: await service.preview(parseInput(previewSchema, req.body), req.user.id) })));
  router.post('/operations/preview/stream', asyncHandler(async (req, res) => {
    const input = parseInput(previewSchema, req.body);
    await streamPreparation(res, (onProgress) => service.preview(input, req.user.id, onProgress));
  }));
  router.post('/operations/:id/rollback/stream', asyncHandler(async (req, res) => {
    const operationId = parseInput(id, req.params.id);
    await streamPreparation(res, (onProgress) => service.rollback(operationId, req.user.id, onProgress));
  }));
  router.get('/operations/:id', asyncHandler(async (req, res) => {
    const input = parseInput(pagination, req.query);
    res.json({ data: await service.detail(parseInput(id, req.params.id), input.page, input.pageSize) });
  }));
  router.get('/operations/:id/report.csv', asyncHandler(async (req, res) => {
    const operationId = parseInput(id, req.params.id);
    res.set('Content-Disposition', `attachment; filename="horoshop-stickers-${operationId}.csv"`);
    res.type('text/csv').send(await service.report(operationId));
  }));
  for (const action of ['apply', 'stop', 'retry', 'rollback']) router.post(`/operations/:id/${action}`, asyncHandler(async (req, res) => {
    res.status(action === 'apply' ? 202 : 200).json({ data: await service[action](parseInput(id, req.params.id), req.user.id) });
  }));
  return router;
}

export default createStickerRouter();
