import { Router, raw } from 'express';
import { z } from 'zod';
import { AppError } from '../../lib/app-error.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { parseInput } from '../../lib/validation.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireToolAccess } from '../access/access.service.js';
import {
  createMediaAsset,
  createMediaFolder,
  deleteMediaAsset,
  deleteMediaAssets,
  deleteMediaFolder,
  listMediaAssetIds,
  listMediaAssets,
  listMediaFolders,
  updateMediaAsset,
  updateMediaFolder
} from './media.service.js';

const router = Router();
router.use(requireAuth, requireToolAccess('blog_publications'));

const idSchema = z.string().uuid();
const listSchema = z.object({
  search: z.string().trim().max(160).default(''),
  folderId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30)
});
const folderListSchema = z.object({ parentId: z.string().uuid().optional() });
const folderCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  parentId: z.string().uuid().nullable().default(null)
});
const folderUpdateSchema = z.object({ name: z.string().trim().min(1).max(120) });
const uploadSchema = z.object({ folderId: z.string().uuid().optional() });
const updateSchema = z.object({
  name: z.string().trim().min(1).max(255),
  altText: z.string().trim().max(500).default('')
});
const bulkDeleteSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(500) });

function decodeFileName(value) {
  try {
    return decodeURIComponent(String(value || 'image'));
  } catch {
    return 'image';
  }
}

router.get('/', asyncHandler(async (req, res) => {
  const input = parseInput(listSchema, req.query);
  res.json({ data: await listMediaAssets(input) });
}));

router.get('/folders', asyncHandler(async (req, res) => {
  const input = parseInput(folderListSchema, req.query);
  res.json({ data: await listMediaFolders(input) });
}));

router.get('/selection', asyncHandler(async (req, res) => {
  const input = parseInput(uploadSchema, req.query);
  res.json({ data: { ids: await listMediaAssetIds({ folderId: input.folderId || null }) } });
}));

router.post('/bulk-delete', asyncHandler(async (req, res) => {
  const input = parseInput(bulkDeleteSchema, req.body);
  const deleted = await deleteMediaAssets(input.ids, req.user);
  res.json({ data: { deleted } });
}));

router.post('/folders', asyncHandler(async (req, res) => {
  const input = parseInput(folderCreateSchema, req.body);
  const folder = await createMediaFolder({ ...input, userId: req.user.id });
  res.status(201).json({ data: folder });
}));

router.patch('/folders/:id', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const input = parseInput(folderUpdateSchema, req.body);
  res.json({ data: await updateMediaFolder(id, input, req.user) });
}));

router.delete('/folders/:id', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  await deleteMediaFolder(id, req.user);
  res.status(204).end();
}));

router.post('/', raw({ type: 'image/*', limit: '15mb' }), asyncHandler(async (req, res) => {
  const input = parseInput(uploadSchema, req.query);
  const contentType = String(req.get('content-type') || '').toLowerCase();
  if (!contentType.startsWith('image/')) {
    throw new AppError(415, 'MEDIA_UNSUPPORTED_TYPE', 'Завантажте файл зображення.');
  }
  const asset = await createMediaAsset({
    buffer: req.body,
    originalName: decodeFileName(req.get('x-file-name')),
    folderId: input.folderId || null,
    userId: req.user.id
  });
  res.status(201).json({ data: asset });
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const input = parseInput(updateSchema, req.body);
  res.json({ data: await updateMediaAsset(id, input, req.user) });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  await deleteMediaAsset(id, req.user);
  res.status(204).end();
}));

export default router;
