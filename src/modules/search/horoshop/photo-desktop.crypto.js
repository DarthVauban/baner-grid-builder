import crypto from 'node:crypto';
import { env } from '../../../config/env.js';

const pairingAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function hmac(scope, value) {
  return crypto.createHmac('sha256', env.mobileTokenPepper)
    .update(`mt-workspace:horoshop-photo-desktop:${scope}:v1\0`)
    .update(String(value || ''))
    .digest('hex');
}

export function generatePhotoDesktopPairingCode() {
  let value = '';
  for (let index = 0; index < 12; index += 1) {
    value += pairingAlphabet[crypto.randomInt(pairingAlphabet.length)];
  }
  return `${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8)}`;
}

export function normalizePhotoDesktopPairingCode(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z2-9]/gu, '');
}

export function hashPhotoDesktopPairingCode(value) {
  return hmac('pairing', normalizePhotoDesktopPairingCode(value));
}

export function createPhotoDesktopCredential() {
  const accessToken = crypto.randomBytes(32).toString('base64url');
  return { accessToken, accessTokenHash: hashPhotoDesktopAccessToken(accessToken) };
}

export function hashPhotoDesktopAccessToken(value) {
  return hmac('access-token', String(value || '').trim());
}
