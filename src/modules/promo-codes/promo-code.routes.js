import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/async-handler.js';
import { parseInput } from '../../lib/validation.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireToolAccess } from '../access/access.service.js';
import {
  createPromoCode,
  deletePromoCode,
  getPromoCode,
  listPromoCodes,
  updatePromoCode
} from './promo-code.service.js';

const router = Router();
router.use(requireAuth, requireToolAccess('popup_banners'));

const idSchema = z.string().uuid();
const nullableDateSchema = z.union([z.string().datetime({ offset: true }), z.literal(''), z.null()])
  .optional().transform((value) => value || null);
const listSchema = z.object({
  search: z.string().trim().max(160).optional().default(''),
  status: z.enum(['active', 'scheduled', 'ended', 'disabled']).or(z.literal('')).optional().default('')
});
const promoCodeSchema = z.object({
  internalName: z.string().trim().min(1).max(160),
  code: z.string().trim().min(1).max(120),
  type: z.enum(['percent_coupon', 'amount_certificate']),
  discountValue: z.number().positive().max(9999999999),
  currency: z.string().trim().max(8).optional().default(''),
  startsAt: nullableDateSchema,
  endsAt: nullableDateSchema,
  usageLimit: z.number().int().positive().nullable().optional().default(null),
  scopeNote: z.string().trim().max(3000).optional().default(''),
  enabled: z.boolean().optional().default(true),
  horoshopConfirmed: z.boolean().optional().default(false)
}).refine((value) => value.type !== 'percent_coupon' || value.discountValue <= 100, {
  path: ['discountValue'], message: 'Відсоткова знижка не може перевищувати 100%.'
}).refine((value) => value.type !== 'amount_certificate' || Boolean(value.currency), {
  path: ['currency'], message: 'Вкажіть валюту сертифіката.'
}).refine((value) => !value.startsAt || !value.endsAt || new Date(value.endsAt) > new Date(value.startsAt), {
  path: ['endsAt'], message: 'Дата завершення має бути пізніше дати початку.'
});

router.get('/', asyncHandler(async (req, res) => {
  res.json({ data: await listPromoCodes(parseInput(listSchema, req.query)) });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  res.json({ data: await getPromoCode(parseInput(idSchema, req.params.id)) });
}));

router.post('/', asyncHandler(async (req, res) => {
  res.status(201).json({ data: await createPromoCode(parseInput(promoCodeSchema, req.body), req.user.id) });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  res.json({
    data: await updatePromoCode(
      parseInput(idSchema, req.params.id),
      parseInput(promoCodeSchema, req.body),
      req.user.id
    )
  });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  await deletePromoCode(parseInput(idSchema, req.params.id));
  res.status(204).end();
}));

export default router;
