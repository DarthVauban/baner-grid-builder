import { Router } from 'express';
import { z } from 'zod';
import { parseInput } from '../../lib/validation.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireToolAccess } from '../access/access.service.js';
import { resolveCampaignList, listCampaigns, readCampaign, saveCampaign, removeCampaign, publicCampaign, campaignPage } from './campaign.service.js';
import { productSelectionEmbedScript } from './product-selection.embed.js';
import { mountCampaign, campaignStyles } from './campaign.embed.js';

const id = z.string().uuid();
const revision = z.number().int().positive();
const maxProducts = 20_000;
const section = z.object({
  id, name: z.string().trim().min(1).max(200),
  categories: z.array(z.string().max(500)).max(maxProducts), productIds: z.array(id).min(1).max(maxProducts)
}).strict();
const fields = { generation: id, name: z.string().trim().min(1).max(160), sections: z.array(section).min(1).max(maxProducts) };
function validSections(input, ctx) {
  const items = input.sections.flatMap((group) => group.productIds);
  const categories = input.sections.flatMap((group) => group.categories);
  if (items.length > maxProducts || new Set(items).size !== items.length
    || new Set(categories).size !== categories.length || new Set(input.sections.map((group) => group.id)).size !== input.sections.length) {
    ctx.addIssue({ code: 'custom', message: 'Перевірте розділи. В акції може бути до 20 000 унікальних товарів, кожна категорія належить одному розділу.' });
  }
}
const create = z.object(fields).strict().superRefine(validSections);
const update = z.object({ ...fields, revision }).strict().superRefine(validSections);
const entries = z.object({ entries: z.array(z.string().trim().min(1).max(500)).min(1).max(maxProducts) });
const paging = z.object({ section: id.optional(), revision: z.coerce.number().int().positive(), cursor: z.coerce.number().int().min(0).max(maxProducts).default(0) });

export const campaignRoutes = Router();
campaignRoutes.use(requireAuth, requireToolAccess('product_selection'));
campaignRoutes.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
campaignRoutes.post('/resolve', asyncHandler(async (req, res) => {
  res.json({ data: await resolveCampaignList(parseInput(entries, req.body).entries) });
}));
campaignRoutes.get('/', asyncHandler(async (req, res) => res.json({ data: await listCampaigns(req.user.id) })));
campaignRoutes.get('/:id', asyncHandler(async (req, res) => res.json({ data: await readCampaign(req.user.id, parseInput(id, req.params.id)) })));
campaignRoutes.post('/', asyncHandler(async (req, res) => {
  res.status(201).json({ data: await saveCampaign(req.user.id, null, parseInput(create, req.body)) });
}));
campaignRoutes.put('/:id', asyncHandler(async (req, res) => {
  res.json({ data: await saveCampaign(req.user.id, parseInput(id, req.params.id), parseInput(update, req.body)) });
}));
campaignRoutes.delete('/:id', asyncHandler(async (req, res) => {
  await removeCampaign(req.user.id, parseInput(id, req.params.id), parseInput(z.coerce.number().int().positive(), req.query.revision));
  res.sendStatus(204);
}));

export const publicCampaignRoutes = Router();
publicCampaignRoutes.get('/:publicId/embed.js', asyncHandler(async (req, res) => {
  const campaign = await publicCampaign(parseInput(id, req.params.publicId));
  res.type('application/javascript').set('Cache-Control', 'no-cache')
    .send(productSelectionEmbedScript(campaign, '', { mount: mountCampaign, styles: campaignStyles }));
}));
publicCampaignRoutes.get('/:publicId/products', asyncHandler(async (req, res) => {
  const data = await campaignPage(parseInput(id, req.params.publicId), parseInput(paging, req.query));
  res.set('Cache-Control', 'no-cache').json({ data });
}));
