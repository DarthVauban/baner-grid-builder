import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { query } from '../../db/pool.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { parseInput } from '../../lib/validation.js';
import { AppError } from '../../lib/app-error.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireToolAccess } from '../access/access.service.js';
import { createRegistrationLink, loadRegistrationRequest, registrationLinkState, reviewRegistration,
  serializeRegistrationLink, serializeRegistrationRequest, submitRegistration } from './registration.service.js';

const router = Router();
const noStore = (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); };
router.use(requireAuth, requireToolAccess('store_map'), noStore);
const publicRouter = Router();
publicRouter.use(noStore);
publicRouter.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: true, legacyHeaders: false,
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Забагато запитів. Спробуйте трохи пізніше.' } } }));
// Stop preflights here so the separately mounted public widget's permissive CORS does not apply.
publicRouter.options('/', (req, res) => res.status(204).end());

const idSchema = z.string().uuid();
const position = { latitude: z.number().finite().min(-90).max(90), longitude: z.number().finite().min(-180).max(180) };
const fields = {
  name: z.string().trim().min(1).max(240), city: z.string().trim().min(1).max(120),
  address: z.string().trim().min(1).max(500),
  hoursText: z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d\s*[-–—]\s*([01]\d|2[0-3]):[0-5]\d$/, 'Вкажіть графік у форматі 09:00 - 20:00.'),
  ...position
};
const submissionSchema = z.object({
  ...fields, comment: z.string().trim().max(2000).default(''), confirmed: z.literal(true),
  measurement: z.object({ ...position, accuracy: z.number().finite().positive().max(1_000_000),
    observedAt: z.iso.datetime(), sampleCount: z.number().int().min(1).max(120),
    durationMs: z.number().int().min(0).max(120_000), consistent: z.boolean() }).strict()
}).strict();
const reviewSchema = z.object({ version: z.number().int().positive(), reviewNote: z.string().trim().max(2000).default('') });

function publicToken(req) {
  const token = String(req.get('authorization') || '').replace(/^Bearer /, '');
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new AppError(404, 'STORE_MAP_LINK_NOT_FOUND', 'Посилання недійсне. Попросіть нове посилання.');
  return token;
}

router.post('/links', asyncHandler(async (req, res) => {
  const input = parseInput(z.object({ label: z.string().trim().max(180).default('') }), req.body);
  res.setHeader('Cache-Control', 'no-store');
  res.status(201).json({ data: await createRegistrationLink(input.label, req.user.id) });
}));
router.get('/links', asyncHandler(async (req, res) => {
  const result = await query('SELECT * FROM store_map_registration_links ORDER BY created_at DESC LIMIT 100');
  res.setHeader('Cache-Control', 'no-store');
  res.json({ data: result.rows.map(serializeRegistrationLink) });
}));
router.post('/links/:id/revoke', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const result = await query('UPDATE store_map_registration_links SET revoked_at = COALESCE(revoked_at, NOW()) WHERE id = $1 AND used_at IS NULL RETURNING id', [id]);
  if (!result.rows[0]) throw new AppError(409, 'STORE_MAP_LINK_UNAVAILABLE', 'Посилання не знайдено або за ним уже подано заявку.');
  res.status(204).end();
}));
router.get('/requests', asyncHandler(async (req, res) => {
  const input = parseInput(z.object({ status: z.enum(['', 'NEW', 'APPROVED', 'REJECTED']).default(''),
    search: z.string().trim().max(240).default(''), page: z.coerce.number().int().min(1).max(100000).default(1) }), req.query);
  const parameters = [input.status, input.search];
  const where = `WHERE ($1 = '' OR status = $1) AND ($2 = '' OR name ILIKE '%' || $2 || '%' OR city ILIKE '%' || $2 || '%' OR address ILIKE '%' || $2 || '%')`;
  const [items, total, pending] = await Promise.all([
    query(`SELECT * FROM store_map_registration_requests ${where} ORDER BY created_at DESC LIMIT 30 OFFSET $3`, [...parameters, (input.page - 1) * 30]),
    query(`SELECT COUNT(*) AS count FROM store_map_registration_requests ${where}`, parameters),
    query("SELECT COUNT(*) AS count FROM store_map_registration_requests WHERE status = 'NEW'")
  ]);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ data: { items: items.rows.map(serializeRegistrationRequest), total: Number(total.rows[0].count),
    pendingCount: Number(pending.rows[0].count), page: input.page, pageSize: 30 } });
}));
router.get('/requests/:id', asyncHandler(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ data: serializeRegistrationRequest(await loadRegistrationRequest(parseInput(idSchema, req.params.id))) });
}));
router.post('/requests/:id/approve', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const input = parseInput(reviewSchema.extend(fields).strict(), req.body);
  res.json({ data: await reviewRegistration(id, input, req.user.id, 'APPROVED') });
}));
router.post('/requests/:id/reject', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const input = parseInput(reviewSchema.strict(), req.body);
  res.json({ data: await reviewRegistration(id, input, req.user.id, 'REJECTED') });
}));
publicRouter.get('/', asyncHandler(async (req, res) => {
  res.json({ data: await registrationLinkState(publicToken(req)) });
}));
publicRouter.post('/', asyncHandler(async (req, res) => {
  const token = publicToken(req);
  const input = parseInput(submissionSchema, req.body);
  res.status(201).json({ data: await submitRegistration(token, input) });
}));

export { publicRouter as publicStoreMapRegistrationRoutes };
export default router;
