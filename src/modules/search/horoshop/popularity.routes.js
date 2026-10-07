import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../../lib/async-handler.js';
import { parseInput } from '../../../lib/validation.js';
import { requireAuth } from '../../../middleware/auth.js';
import { requireToolAccess } from '../../access/access.service.js';
import { maximumPopularitySelection, popularityLimit } from './popularity.domain.js';
import { horoshopPopularityService } from './popularity.service.js';

const uuid = z.string().uuid();
const brands = z.array(z.string().trim().min(1).max(255)).max(100).default([]);
const filterFields = {
  search: z.string().trim().max(160).default(''),
  category: z.string().trim().max(255).default(''),
  brands,
  availability: z.string().trim().max(200).default(''),
  popularity: z.enum(['all', 'zero', 'positive', 'range']).default('all'),
  popularityMin: z.coerce.number().int().min(0).max(popularityLimit).default(0),
  popularityMax: z.coerce.number().int().min(0).max(popularityLimit).default(0)
};
const filters = z.object(filterFields).strict().refine(
  (input) => input.popularity !== 'range' || input.popularityMin <= input.popularityMax,
  { message: 'Початок діапазону популярності має бути не більшим за кінець.' }
);
const catalogQuery = z.object({
  search: filterFields.search,
  category: filterFields.category,
  availability: filterFields.availability,
  popularity: filterFields.popularity,
  popularityMin: filterFields.popularityMin,
  popularityMax: filterFields.popularityMax,
  brand: z.union([z.string(), z.array(z.string())]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(25)
}).strict();
const selectionCatalogInput = z.object({
  productIds: z.array(uuid).max(maximumPopularitySelection), filters,
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(10).max(100).default(25)
}).strict();
const resolveInput = z.object({
  entries: z.array(z.string().trim().min(1).max(500)).min(1).max(2000)
}).strict();
const selection = z.union([
  z.object({ productIds: z.array(uuid).min(1).max(maximumPopularitySelection) }).strict(),
  z.object({ filters }).strict()
]);
const value = z.number().int().min(-popularityLimit).max(popularityLimit);
const previewInput = z.object({
  selection,
  action: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('set'), value }).strict(),
    z.object({ mode: z.literal('add'), value }).strict(),
    z.object({ mode: z.literal('reset') }).strict()
  ])
}).strict();

export function createPopularityRouter(service = horoshopPopularityService) {
  const router = Router();
  router.use(requireAuth, requireToolAccess('horoshop_popularity'));
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  router.get('/catalog', asyncHandler(async (req, res) => {
    const input = parseInput(catalogQuery, req.query);
    const rawBrands = input.brand === undefined ? [] : Array.isArray(input.brand) ? input.brand : [input.brand];
    const parsed = parseInput(brands, rawBrands);
    const { page, pageSize, brand, ...rest } = input;
    void brand;
    res.json({ data: await service.catalog(parseInput(filters, { ...rest, brands: parsed }), page, pageSize) });
  }));

  router.post('/catalog/selection', asyncHandler(async (req, res) => {
    const input = parseInput(selectionCatalogInput, req.body);
    res.json({ data: await service.catalogSelection(input.productIds, input.filters, input.page, input.pageSize) });
  }));

  router.post('/resolve', asyncHandler(async (req, res) => {
    const input = parseInput(resolveInput, req.body);
    res.json({ data: await service.resolve(input.entries) });
  }));

  router.post('/sync', asyncHandler(async (req, res) => {
    res.status(202).json({ data: await service.sync(req.user.id) });
  }));

  router.get('/operations', asyncHandler(async (req, res) => {
    res.json({ data: await service.history() });
  }));

  router.post('/operations/preview', asyncHandler(async (req, res) => {
    const input = parseInput(previewInput, req.body);
    const actionValue = input.action.mode === 'reset' ? 0 : input.action.value;
    res.status(201).json({ data: await service.preview(input.selection, input.action.mode, actionValue, req.user.id) });
  }));

  router.get('/operations/:id', asyncHandler(async (req, res) => {
    const id = parseInput(uuid, req.params.id);
    res.json({ data: await service.operation(id) });
  }));

  router.post('/operations/:id/apply', asyncHandler(async (req, res) => {
    const id = parseInput(uuid, req.params.id);
    res.status(202).json({ data: await service.apply(id) });
  }));

  return router;
}

export default createPopularityRouter();
