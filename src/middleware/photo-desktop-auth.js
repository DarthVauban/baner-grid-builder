import { AppError } from '../lib/app-error.js';
import { asyncHandler } from '../lib/async-handler.js';
import { horoshopPhotoDesktopService } from '../modules/search/horoshop/photo-desktop.service.js';

function bearerToken(req) {
  const authorization = String(req.get('authorization') || '');
  return authorization.match(/^Bearer\s+([^\s]+)$/iu)?.[1] || '';
}

export const requirePhotoDesktopAuth = asyncHandler(async (req, _res, next) => {
  const token = bearerToken(req);
  if (!token) throw new AppError(401, 'PHOTO_DESKTOP_TOKEN_REQUIRED', 'Підключіть десктопний фото-парсер.');
  req.photoParserDevice = await horoshopPhotoDesktopService.authenticate(token);
  next();
});
