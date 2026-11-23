import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler.js';
import { siteThemeEmbedScript } from './site-theme.embed.js';
import { getPublishedSiteThemePromoBar } from './site-theme.service.js';

const router = Router();

router.get('/embed.js', (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.type('application/javascript').send(siteThemeEmbedScript());
});

router.get('/promo-bar', asyncHandler(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.vary('Origin');
  res.json({ data: await getPublishedSiteThemePromoBar(req.get('origin')) });
}));

export default router;
