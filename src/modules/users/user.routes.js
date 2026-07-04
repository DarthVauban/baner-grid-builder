import { Router } from 'express';
import { z } from 'zod';
import { query } from '../../db/pool.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { parseInput } from '../../lib/validation.js';
import { requireAuth } from '../../middleware/auth.js';
import { getUserToolAccess } from '../access/access.service.js';

const router = Router();
router.use(requireAuth);

const searchSchema = z.string().trim().min(2).max(120);

router.get('/tool-access', asyncHandler(async (req, res) => {
  res.json({ data: await getUserToolAccess(req.user) });
}));

router.get('/search', asyncHandler(async (req, res) => {
  const search = parseInput(searchSchema, String(req.query.search || ''));
  const result = await query(
    `SELECT id, name, email
     FROM users
     WHERE status = 'approved'
       AND id <> $1
       AND (name ILIKE '%' || $2 || '%' OR email ILIKE '%' || $2 || '%')
     ORDER BY lower(name), lower(email)
     LIMIT 12`,
    [req.user.id, search]
  );

  res.json({
    data: result.rows.map((user) => ({ id: user.id, name: user.name, email: user.email }))
  });
}));

export default router;
