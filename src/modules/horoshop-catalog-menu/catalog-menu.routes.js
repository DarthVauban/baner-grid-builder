import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/async-handler.js';
import { parseInput } from '../../lib/validation.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireToolAccess } from '../access/access.service.js';
import {
  catalogMenuThemeIds,
  catalogMenuThemes,
  getCatalogMenuSettings,
  horoshopCatalogMenuToolId,
  publishCatalogMenu,
  setCatalogMenuEnabled,
  updateCatalogMenuDraft
} from './catalog-menu.service.js';

const router = Router();
router.use(requireAuth, requireToolAccess(horoshopCatalogMenuToolId));

const themeSchema = z.object({ themeId: z.enum(catalogMenuThemeIds) });
const enabledSchema = z.object({ enabled: z.boolean() });

function requestOrigin(req) {
  const forwardedHost = String(req.get('x-forwarded-host') || '').split(',')[0].trim();
  const forwardedProto = String(req.get('x-forwarded-proto') || req.protocol).split(',')[0].trim();
  const host = forwardedHost || req.get('host');
  try { return new URL(`${forwardedProto}://${host}`).origin; } catch { return ''; }
}

router.get('/settings', asyncHandler(async (req, res) => {
  res.json({
    data: {
      settings: await getCatalogMenuSettings(requestOrigin(req)),
      themes: catalogMenuThemes
    }
  });
}));

router.put('/settings/draft', asyncHandler(async (req, res) => {
  const { themeId } = parseInput(themeSchema, req.body);
  res.json({ data: await updateCatalogMenuDraft(themeId, req.user.id, requestOrigin(req)) });
}));

router.post('/settings/publish', asyncHandler(async (req, res) => {
  const { themeId } = parseInput(themeSchema, req.body);
  res.json({ data: await publishCatalogMenu(themeId, req.user.id, requestOrigin(req)) });
}));

router.patch('/settings/enabled', asyncHandler(async (req, res) => {
  const { enabled } = parseInput(enabledSchema, req.body);
  res.json({ data: await setCatalogMenuEnabled(enabled, req.user.id, requestOrigin(req)) });
}));

export default router;
