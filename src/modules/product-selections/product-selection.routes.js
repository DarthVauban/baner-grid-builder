import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/async-handler.js';
import { parseInput } from '../../lib/validation.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireToolAccess } from '../access/access.service.js';
import { horoshopCatalogService } from '../search/horoshop/catalog.service.js';
import {
  createProductSelection,
  deleteProductSelection,
  getProductSelection,
  listProductSelections,
  updateProductSelection
} from './product-selection.service.js';

const router = Router();
const idSchema = z.string().uuid();
const listSchema = z.object({
  search: z.string().trim().max(160).optional().default('')
});
const catalogSchema = z.object({
  search: z.string().trim().max(160).optional().default(''),
  category: z.string().trim().max(255).optional().default(''),
  availability: z.string().trim().max(200).optional().default(''),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(10).max(100).optional().default(50)
});
const selectionItemSchema = z.object({
  productExternalId: z.string().trim().min(1).max(300),
  modificationExternalId: z.string().trim().max(300).nullable().optional().default(null)
});
const selectionSchema = z.object({
  name: z.string().trim().min(1, 'Вкажіть назву вибірки.').max(160),
  heading: z.string().trim().min(1, 'Вкажіть заголовок блоку.').max(200),
  priceMode: z.enum(['none', 'percent', 'fixed']).default('none'),
  priceValue: z.coerce.number().min(0).max(1_000_000).default(0),
  highlightPromoPrice: z.boolean().default(true),
  buttonLabel: z.string().trim().min(1).max(80).default('Купити'),
  desktopColumns: z.coerce.number().int().min(2).max(5).default(4),
  mobileColumns: z.coerce.number().int().min(1).max(2).default(2),
  items: z.array(selectionItemSchema).min(1, 'Додайте хоча б один товар.').max(100)
}).superRefine((input, context) => {
  if (input.priceMode !== 'none' && input.priceValue <= 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['priceValue'],
      message: 'Для старої ціни вкажіть значення більше нуля.'
    });
  }
  const keys = new Set();
  input.items.forEach((item, index) => {
    const key = `${item.productExternalId}\0${item.modificationExternalId || ''}`;
    if (keys.has(key)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['items', index],
        message: 'Товар уже додано до вибірки.'
      });
    }
    keys.add(key);
  });
});

router.use(requireAuth, requireToolAccess('product_selection'));
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

router.get('/catalog', asyncHandler(async (req, res) => {
  const input = parseInput(catalogSchema, req.query);
  res.json({
    data: await horoshopCatalogService.catalog({
      ...input,
      visibility: 'visible',
      photoStatus: 'all',
      createdFrom: '',
      createdTo: '',
      state: 'active'
    })
  });
}));

router.get('/', asyncHandler(async (req, res) => {
  const input = parseInput(listSchema, req.query);
  res.json({ data: await listProductSelections(req.user.id, input.search) });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  res.json({ data: await getProductSelection(id, req.user.id) });
}));

router.post('/', asyncHandler(async (req, res) => {
  const input = parseInput(selectionSchema, req.body);
  res.status(201).json({ data: await createProductSelection(req.user.id, input) });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  const input = parseInput(selectionSchema, req.body);
  res.json({ data: await updateProductSelection(id, req.user.id, input) });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const id = parseInput(idSchema, req.params.id);
  await deleteProductSelection(id, req.user.id);
  res.status(204).end();
}));

export default router;
