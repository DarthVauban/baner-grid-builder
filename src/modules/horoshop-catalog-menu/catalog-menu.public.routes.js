import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/async-handler.js';
import { parseInput } from '../../lib/validation.js';
import { catalogMenuCss } from './catalog-menu.embed.js';
import { catalogMenuEmbedScript, loadPublishedCatalogMenu } from './catalog-menu.service.js';

const router = Router();
const querySchema = z.object({ site: z.string().uuid() });

function requestOrigin(req) {
  const forwardedHost = String(req.get('x-forwarded-host') || '').split(',')[0].trim();
  const forwardedProto = String(req.get('x-forwarded-proto') || req.protocol).split(',')[0].trim();
  const host = forwardedHost || req.get('host');
  try { return new URL(`${forwardedProto}://${host}`).origin; } catch { return ''; }
}

router.get('/embed.js', asyncHandler(async (req, res) => {
  const { site } = parseInput(querySchema, req.query);
  const published = await loadPublishedCatalogMenu(site);
  res.setHeader('Cache-Control', 'public, max-age=300');
  const stylesheetUrl = `${requestOrigin(req)}/api/public/horoshop-catalog-menu/theme.css?site=${encodeURIComponent(site)}&v=${published?.version || 0}`;
  res.type('application/javascript').send(
    published ? catalogMenuEmbedScript(published.themeId, stylesheetUrl) : '/* MT catalog menu is disabled. */'
  );
}));

router.get('/theme.css', asyncHandler(async (req, res) => {
  const { site } = parseInput(querySchema, req.query);
  const published = await loadPublishedCatalogMenu(site);
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.type('text/css').send(published ? catalogMenuCss(published.themeId) : '/* MT catalog menu is disabled. */');
}));

export default router;
