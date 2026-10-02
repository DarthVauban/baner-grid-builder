import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler.js';
import { env } from '../../config/env.js';
import { horoshopWidgetLoaderScript, loadHoroshopWidgetManifest } from './widget.service.js';

const router = Router();

function requestOrigin(req) {
  const forwardedHost = String(req.get('x-forwarded-host') || '').split(',')[0].trim();
  const forwardedProto = String(req.get('x-forwarded-proto') || req.protocol).split(',')[0].trim();
  const host = forwardedHost || req.get('host');
  try { return new URL(`${forwardedProto}://${host}`).origin; } catch { return ''; }
}

router.get('/embed.js', asyncHandler(async (req, res) => {
  const manifest = await loadHoroshopWidgetManifest();
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.type('application/javascript').send(
    horoshopWidgetLoaderScript(manifest, env.APP_ORIGIN || requestOrigin(req))
  );
}));

export default router;
