import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/async-handler.js';
import { parseInput } from '../../lib/validation.js';
import { cartThemeCss } from './cart-theme.embed.js';
import { cartThemeEmbedScript, loadPublishedCartTheme } from './cart-theme.service.js';

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
  const published = await loadPublishedCartTheme(site);
  res.setHeader('Cache-Control', 'public, max-age=300');
  const stylesheetUrl = `${requestOrigin(req)}/api/public/horoshop-cart-theme/theme.css?site=${encodeURIComponent(site)}&v=${published?.version || 0}`;
  res.type('application/javascript').send(
    published
      ? cartThemeEmbedScript(published.themeId, stylesheetUrl)
      : '/* MT Horoshop cart theme is disabled. */'
  );
}));

router.get('/theme.css', asyncHandler(async (req, res) => {
  const { site } = parseInput(querySchema, req.query);
  const published = await loadPublishedCartTheme(site);
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.type('text/css').send(published ? cartThemeCss(published.themeId) : '/* MT Horoshop cart theme is disabled. */');
}));

export default router;
