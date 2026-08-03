import { Router, raw } from 'express';
import { z } from 'zod';
import { AppError } from '../../lib/app-error.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { parseInput } from '../../lib/validation.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireToolAccess } from '../access/access.service.js';
import { createMediaAsset, deleteMediaAsset, listMediaAssets, updateMediaAsset } from './media.service.js';

const router = Router();
router.use(requireAuth, requireToolAccess('blog_publications'));

const idSchema = z.string().uuid();
const listSchema = z.object({
  search: z.string().trim().max(160).default(''),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30)
});
const updateSchema = z.object({
  name: z.string().trim().min(1).max(255),
  altText: z.string().trim().max(500).default('')
});

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

router.post('/', raw({ type: 'image/*', limit: '15mb' }), asyncHandler(async (req, res) => {
  const contentType = String(req.get('content-type') || '').toLowerCase();
  if (!contentType.startsWith('image/')) {
    throw new AppError(415, 'MEDIA_UNSUPPORTED_TYPE', 'Завантажте файл зображення.');
  }
  const asset = await createMediaAsset({
    buffer: req.body,
    originalName: decodeFileName(req.get('x-file-name')),
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
