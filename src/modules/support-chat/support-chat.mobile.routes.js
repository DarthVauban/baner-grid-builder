import { Router } from 'express';
import { env } from '../../config/env.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireToolAccess } from '../access/access.service.js';
import { mobileWorkspaceMetadata } from '../mobile/mobile-workspace-config.js';
import { getSupportNotificationPreference, supportAccessReason } from './support-chat.notifications.js';
import { createSupportOperatorRouter, createSupportPreferenceRouter } from './support-chat.operator.routes.js';

const router = Router();
router.use((req, res, next) => {
  if (!env.supportChatApiEnabled) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Маршрут не знайдено.' } });
  next();
});
router.get('/bootstrap', asyncHandler(async (req, res) => {
  const reason = await supportAccessReason(req.user);
  res.json({ data: { contractVersion: 1, workspace: mobileWorkspaceMetadata(), userId: req.user.id,
    deviceId: req.mobileDevice.id, access: { allowed: !reason, reason }, readScope: 'team',
    notificationPreference: await getSupportNotificationPreference(req.user.id) } });
}));
router.use(createSupportPreferenceRouter());
router.use(requireToolAccess('online_support'), createSupportOperatorRouter({ mobile: true }));
export default router;
