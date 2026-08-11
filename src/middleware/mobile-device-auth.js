import { AppError } from '../lib/app-error.js';
import { asyncHandler } from '../lib/async-handler.js';
import { serializeUser } from '../lib/serializers.js';
import {
  findMobileDeviceByAccessToken,
  serializeMobileDevice,
  touchMobileDeviceLastSeen
} from '../modules/mobile/mobile-device.service.js';

function bearerToken(req) {
  const authorization = String(req.get('authorization') || '');
  const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
  return match?.[1] || '';
}

function serializeDeviceUser(row) {
  return serializeUser({
    id: row.authenticated_user_id,
    name: row.user_name,
    first_name: row.user_first_name,
    last_name: row.user_last_name,
    email: row.user_email,
    department: row.user_department,
    position: row.user_position,
    avatar_mime: row.user_avatar_mime,
    role: row.user_role,
    status: row.user_status,
    can_manage_tool_access: row.can_manage_tool_access,
    two_factor_enabled: row.two_factor_enabled,
    two_factor_method: row.two_factor_method,
    two_factor_confirmed_at: row.two_factor_confirmed_at,
    approved_at: row.approved_at,
    created_at: row.user_created_at,
    updated_at: row.user_updated_at
  });
}

export function mobileDeviceAuth({ allowRevoked = false } = {}) {
  return asyncHandler(async (req, res, next) => {
    const token = bearerToken(req);
    if (!token) throw new AppError(401, 'INVALID_DEVICE_TOKEN', 'Токен мобільного пристрою недійсний.');

    const row = await findMobileDeviceByAccessToken(token);
    if (!row || row.user_status !== 'approved') {
      throw new AppError(401, 'INVALID_DEVICE_TOKEN', 'Токен мобільного пристрою недійсний.');
    }
    if (row.revoked_at && !allowRevoked) {
      throw new AppError(401, 'DEVICE_REVOKED', 'Доступ цього пристрою відкликано.');
    }

    req.mobileDevice = serializeMobileDevice(row);
    req.user = serializeDeviceUser(row);
    if (!row.revoked_at) await touchMobileDeviceLastSeen(row.id);
    next();
  });
}

export const requireMobileDeviceAuth = mobileDeviceAuth();
