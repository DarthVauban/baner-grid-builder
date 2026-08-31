import { Router } from 'express';
import { productPriceEmbedScript } from './product-price.embed.js';

const router = Router();

router.get('/embed.js', (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.type('application/javascript').send(productPriceEmbedScript());
});

export default router;
