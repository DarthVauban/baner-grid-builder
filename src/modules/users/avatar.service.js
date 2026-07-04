import { AppError } from '../../lib/app-error.js';

const avatarPattern = /^data:(image\/(?:png|jpeg|webp));base64,([a-z0-9+/=]+)$/i;
const maxAvatarBytes = 1024 * 1024;

export function parseAvatarDataUrl(value) {
  if (!value) return { data: null, mime: null };
  const match = avatarPattern.exec(value);
  if (!match) throw new AppError(422, 'INVALID_AVATAR', 'Підтримуються лише PNG, JPEG або WebP.');
  const data = Buffer.from(match[2], 'base64');
  if (data.length > maxAvatarBytes) throw new AppError(422, 'AVATAR_TOO_LARGE', 'Фото має бути меншим за 1 МБ.');
  return { data, mime: match[1].toLowerCase() };
}
