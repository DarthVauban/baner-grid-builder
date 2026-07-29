import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { parseInput } from '../../lib/validation.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireToolAccess } from '../access/access.service.js';
import { cleanText, serializeForm } from '../applications/application.service.js';
import { createPublicApplication } from '../applications/public.routes.js';
import { cacheSavedTradeInOrigin, normalizeTradeInOrigin } from './trade-in.domain.js';
import { normalizeTradeInConfig } from './trade-in.defaults.js';
import {
  ensureTradeInWorkflowForm,
  hydrateTradeInWorkflow,
  loadTradeInSettings,
  submissionForm,
  tradeInToolId
} from './trade-in.service.js';

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

async function createTradeInApplication({
  settings,
  config,
  linkedForm,
  input,
  req,
  source,
  historyComment,
  demo = false
}) {
  const form = submissionForm({
    publicId: settings.publicId,
    publishedConfig: config
  }, input.values, linkedForm);
  if (form.fields.length === 0) {
    throw new AppError(422, 'TRADE_IN_FORM_EMPTY', 'У формі немає доступних полів.');
  }
  const category = cleanText(input.values.category, 120);
  const brand = category === 'apple' ? 'Apple' : cleanText(input.values.brand, 120);
  const model = cleanText(input.values.model, 180);
  const productTitle = [brand, model].filter(Boolean).join(' ') || category || 'Trade-in пристрій';
  const pageTitle = config.seo.title || config.form.title;
  return createPublicApplication({
    publicId: form.publicId,
    input: {
      ...input,
      product: { title: productTitle }
    },
    req,
    formOverride: form,
    skipBankRequirement: true,
    productOverride: { title: productTitle },
    contextOverride: {
      pageTitle: demo ? `[Демо] ${pageTitle}` : pageTitle
    },
    source,
    historyComment
  });
}

adminRouter.use(requireAuth, requireToolAccess(tradeInToolId));

adminRouter.get('/forms', asyncHandler(async (req, res) => {
  await ensureTradeInWorkflowForm(req.user.id);
  const result = await pool.query(
    `SELECT *
     FROM application_forms
     WHERE form_type = 'workflow' AND status <> 'archived'
     ORDER BY updated_at DESC`
  );
  res.json({ data: result.rows.map((row) => serializeForm(row, [])) });
}));

adminRouter.get('/settings', asyncHandler(async (req, res) => {
  await ensureTradeInWorkflowForm(req.user.id);
  res.json({ data: await loadTradeInSettings() });
}));

adminRouter.put('/settings', asyncHandler(async (req, res) => {
  const input = parseInput(settingsSchema, req.body);
  const normalizedConfig = normalizeTradeInConfig(input.config);
  const linked = await hydrateTradeInWorkflow(normalizedConfig);
  if (normalizedConfig.formReference.formId && !linked.form) {
    throw new AppError(422, 'TRADE_IN_FORM_NOT_FOUND', 'Обрану покрокову форму не знайдено.');
  }
  const config = linked.config;
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
  const normalizedConfig = normalizeTradeInConfig(input.config);
  const linked = await hydrateTradeInWorkflow(normalizedConfig, { publishedOnly: true });
  if (!normalizedConfig.formReference.formId || !linked.form) {
    throw new AppError(422, 'TRADE_IN_FORM_NOT_PUBLISHED', 'Оберіть та опублікуйте покрокову форму перед публікацією сторінки.');
  }
  const config = linked.config;
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
  const linked = await hydrateTradeInWorkflow(settings.draftConfig);
  res.json({ data: {
    config: linked.form ? linked.config : settings.draftConfig,
    status: settings.status,
    updatedAt: settings.updatedAt,
    preview: true
  } });
}));

adminRouter.post('/preview-applications', submitLimiter, asyncHandler(async (req, res) => {
  const input = parseInput(submissionSchema, req.body);
  const settings = await loadTradeInSettings();
  const linked = await hydrateTradeInWorkflow(settings.draftConfig);
  if (!settings.draftConfig.formReference.formId || !linked.form) {
    throw new AppError(422, 'TRADE_IN_FORM_NOT_FOUND', 'Оберіть покрокову форму перед тестовим надсиланням.');
  }
  const result = await createTradeInApplication({
    settings,
    config: linked.config,
    linkedForm: linked.form,
    input,
    req,
    source: 'trade_in_demo',
    historyComment: 'Демо-заявку створено з тестової сторінки Trade-in',
    demo: true
  });
  if (result.status === 204) return res.status(204).end();
  res.status(result.status).json({ data: result.data });
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
  const referenceId = settings.publishedConfig.formReference.formId;
  const linkedResult = referenceId
    ? await pool.query(
      `SELECT *
       FROM application_forms
       WHERE id = $1 AND form_type = 'workflow'`,
      [referenceId]
    )
    : { rows: [] };
  const result = await createTradeInApplication({
    settings,
    config: settings.publishedConfig,
    linkedForm: linkedResult.rows[0] || null,
    input,
    req,
    source: 'trade_in',
    historyComment: 'Заявку створено зі сторінки Trade-in'
  });
  if (result.status === 204) return res.status(204).end();
  res.status(result.status).json({ data: result.data });
}));

export { publicRouter as publicTradeInRoutes };
export default adminRouter;
