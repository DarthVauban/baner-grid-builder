import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/async-handler.js';
import { parseInput } from '../../lib/validation.js';
import {
  checkoutTelegramEmbedScript,
  loadPublishedCheckoutTelegram
} from './checkout-telegram.service.js';

const router = Router();
const querySchema = z.object({ site: z.string().uuid() });

router.get('/embed.js', asyncHandler(async (req, res) => {
  const { site } = parseInput(querySchema, req.query);
  const published = await loadPublishedCheckoutTelegram(site);
  res.setHeader('Cache-Control', 'public, max-age=120, stale-while-revalidate=300');
  res.type('application/javascript').send(
    published
      ? checkoutTelegramEmbedScript(published)
      : '/* MT Horoshop checkout Telegram block is disabled. */'
  );
}));

export default router;
