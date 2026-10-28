import { Router, raw } from 'express';
import { AppError } from '../../lib/app-error.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { createMediaAsset } from '../media/media.service.js';

const router = Router();
// Auth and popup_banners access are enforced by the parent router.
router.post('/', raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '10mb' }), asyncHandler(async (req, res) => {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(req.get('content-type')?.split(';')[0])) {
    throw new AppError(415, 'POPUP_IMAGE_TYPE', 'Завантажте JPG, PNG або WebP.');
  }
  let originalName = 'popup-product';
  try { originalName = decodeURIComponent(req.get('x-file-name') || originalName); } catch { /* use a safe default */ }
  const asset = await createMediaAsset({ buffer: req.body, originalName, userId: req.user.id, folderId: null });
  res.status(201).json({ data: asset });
}));

export default router;
