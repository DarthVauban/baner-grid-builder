import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { parseInput } from '../../lib/validation.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireToolAccess } from '../access/access.service.js';
import { cleanText } from '../applications/application.service.js';
import { createPublicApplication } from '../applications/public.routes.js';
import { cacheSavedTradeInOrigin, normalizeTradeInOrigin } from './trade-in.domain.js';
import { normalizeTradeInConfig } from './trade-in.defaults.js';
import { loadTradeInSettings, submissionForm, tradeInToolId } from './trade-in.service.js';

const adminRouter = Router();
const publicRouter = Router();

const settingsSchema = z.object({
  publicOrigin: z.string().trim().max(500).default(''),
  config: z.record(z.string(), z.unknown())
});
const submissionSchema = z.object({
  values: z.record(z.string(), z.unknown()).default({}),
  context: z.record(z.string(), z.unknown()).default({}),
  idempotencyKey: z.string().trim().max(160).optional().default(''),
  honeypot: z.string().trim().max(200).optional().default('')
});
const submitLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Забагато спроб. Спробуйте пізніше.' } }
});

adminRouter.use(requireAuth, requireToolAccess(tradeInToolId));

adminRouter.get('/settings', asyncHandler(async (req, res) => {
  res.json({ data: await loadTradeInSettings() });
}));

adminRouter.put('/settings', asyncHandler(async (req, res) => {
  const input = parseInput(settingsSchema, req.body);
  const config = normalizeTradeInConfig(input.config);
  const publicOrigin = normalizeTradeInOrigin(input.publicOrigin);
  if (input.publicOrigin && !publicOrigin) {
    throw new AppError(422, 'TRADE_IN_ORIGIN_INVALID', 'Вкажіть коректну адресу з http:// або https://.');
  }
  await pool.query(
    `UPDATE trade_in_settings
     SET public_origin = $1,
         draft_config = $2::JSONB,
         updated_by = $3,
         updated_at = NOW()
     WHERE id = TRUE`,
    [publicOrigin, JSON.stringify(config), req.user.id]
  );
  cacheSavedTradeInOrigin(publicOrigin);
  res.json({ data: await loadTradeInSettings() });
}));

adminRouter.post('/publish', asyncHandler(async (req, res) => {
  const input = parseInput(settingsSchema, req.body);
  const config = normalizeTradeInConfig(input.config);
  const publicOrigin = normalizeTradeInOrigin(input.publicOrigin);
  if (input.publicOrigin && !publicOrigin) {
    throw new AppError(422, 'TRADE_IN_ORIGIN_INVALID', 'Вкажіть коректну адресу з http:// або https://.');
  }
  await pool.query(
    `UPDATE trade_in_settings
     SET status = 'published',
         public_origin = $1,
         draft_config = $2::JSONB,
         published_config = $2::JSONB,
         updated_by = $3,
         updated_at = NOW(),
         published_at = NOW()
     WHERE id = TRUE`,
    [publicOrigin, JSON.stringify(config), req.user.id]
  );
  cacheSavedTradeInOrigin(publicOrigin);
  res.json({ data: await loadTradeInSettings() });
}));

adminRouter.get('/preview-settings', asyncHandler(async (req, res) => {
  const settings = await loadTradeInSettings();
  res.json({ data: {
    config: settings.draftConfig,
    status: settings.status,
    updatedAt: settings.updatedAt,
    preview: true
  } });
}));

publicRouter.get('/settings', asyncHandler(async (req, res) => {
  const settings = await loadTradeInSettings();
  if (!settings.publishedConfig) {
    throw new AppError(404, 'TRADE_IN_NOT_PUBLISHED', 'Сторінка Trade-in ще не опублікована.');
  }
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.json({ data: {
    config: settings.publishedConfig,
    publishedAt: settings.publishedAt
  } });
}));

publicRouter.post('/applications', submitLimiter, asyncHandler(async (req, res) => {
  const input = parseInput(submissionSchema, req.body);
  const settings = await loadTradeInSettings();
  if (!settings.publishedConfig) {
    throw new AppError(404, 'TRADE_IN_NOT_PUBLISHED', 'Сторінка Trade-in ще не опублікована.');
  }
  const form = submissionForm(settings, input.values);
  if (form.fields.length === 0) {
    throw new AppError(422, 'TRADE_IN_FORM_EMPTY', 'У формі немає доступних полів.');
  }
  const category = cleanText(input.values.category, 120);
  const brand = category === 'apple' ? 'Apple' : cleanText(input.values.brand, 120);
  const model = cleanText(input.values.model, 180);
  const productTitle = [brand, model].filter(Boolean).join(' ') || category || 'Trade-in пристрій';
  const result = await createPublicApplication({
    publicId: settings.publicId,
    input: {
      ...input,
      product: { title: productTitle }
    },
    req,
    formOverride: form,
    skipBankRequirement: true,
    productOverride: { title: productTitle },
    contextOverride: {
      pageTitle: settings.publishedConfig.seo.title || settings.publishedConfig.form.title
    },
    source: 'trade_in',
    historyComment: 'Заявку створено зі сторінки Trade-in'
  });
  if (result.status === 204) return res.status(204).end();
  res.status(result.status).json({ data: result.data });
}));

export { publicRouter as publicTradeInRoutes };
export default adminRouter;
