import { Router } from 'express';
import { z } from 'zod';
import { query } from '../../db/pool.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { parseInput } from '../../lib/validation.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireToolAccess } from '../access/access.service.js';
import { publishSupportChatUpdate } from './support-chat.events.js';
import { createSupportOperatorRouter, createSupportPreferenceRouter } from './support-chat.operator.routes.js';
import { loadSupportSite, isValidSupportTimezone, normalizeSupportOrigin,
  serializeSupportSettings, supportChatToolId, supportWorkingDayKeys } from './support-chat.service.js';

const router = Router();
router.use(requireAuth);
router.use(createSupportPreferenceRouter());
router.use(requireToolAccess(supportChatToolId));

const workingHoursDaySchema = z.object({
  enabled: z.boolean(),
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/u),
  end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/u)
}).refine((value) => !value.enabled || value.start < value.end, {
  message: 'Час завершення робочого дня має бути пізніше часу початку.'
});
const workingHoursScheduleSchema = z.object(Object.fromEntries(
  supportWorkingDayKeys.map((day) => [day, workingHoursDaySchema])
));
const settingsSchema = z.object({
  name: z.string().trim().min(1).max(160),
  enabled: z.boolean(),
  allowedOrigins: z.array(z.string().trim().max(500)).max(50).transform((values) => (
    [...new Set(values.map(normalizeSupportOrigin).filter(Boolean))]
  )),
  accentColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/),
  welcomeText: z.string().trim().min(1).max(500),
  autoReplyText: z.string().trim().min(1).max(1000),
  contactFormEnabled: z.boolean(),
  contactFormPrompt: z.string().trim().min(1).max(500),
  workingHoursEnabled: z.boolean(),
  workingHoursTimezone: z.string().trim().min(1).max(64).refine(isValidSupportTimezone, {
    message: 'Вкажіть коректний часовий пояс.'
  }),
  workingHoursSchedule: workingHoursScheduleSchema,
  offlineReplyText: z.string().trim().min(1).max(1000)
});

router.get('/settings', asyncHandler(async (req, res) => {
  const site = await loadSupportSite('', { requireEnabled: false });
  res.json({ data: serializeSupportSettings(site) });
}));

router.put('/settings', asyncHandler(async (req, res) => {
  const input = parseInput(settingsSchema, req.body);
  const current = await loadSupportSite('', { requireEnabled: false });
  const result = await query(
    `UPDATE support_chat_sites
     SET name = $1, enabled = $2, allowed_origins = $3::JSONB,
         accent_color = $4, welcome_text = $5, auto_reply_text = $6,
         contact_form_enabled = $7, contact_form_prompt = $8,
         working_hours_enabled = $9, working_hours_timezone = $10,
         working_hours_schedule = $11::JSONB, offline_reply_text = $12,
         updated_by = $13, updated_at = NOW()
     WHERE id = $14
     RETURNING *`,
    [
      input.name,
      input.enabled,
      JSON.stringify(input.allowedOrigins),
      input.accentColor,
      input.welcomeText,
      input.autoReplyText,
      input.contactFormEnabled,
      input.contactFormPrompt,
      input.workingHoursEnabled,
      input.workingHoursTimezone,
      JSON.stringify(input.workingHoursSchedule),
      input.offlineReplyText,
      req.user.id,
      current.id
    ]
  );
  publishSupportChatUpdate({ type: 'settings' });
  res.json({ data: serializeSupportSettings(result.rows[0]) });
}));

router.use(createSupportOperatorRouter());

export default router;
