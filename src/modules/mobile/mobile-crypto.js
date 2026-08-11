import crypto from 'node:crypto';
import { env } from '../../config/env.js';

const manualCodeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ234567';
const encryptionKey = crypto.scryptSync(
  env.mobileTokenPepper,
  'mt-workspace-mobile-encryption-v1',
  32
);

function hmac(scope, value) {
  return crypto.createHmac('sha256', env.mobileTokenPepper)
    .update(`mt-workspace:${scope}:v1\0`)
    .update(String(value || ''))
    .digest('base64url');
}

export function generateOpaqueMobileToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function generateManualPairingCode() {
  let raw = '';
  for (let index = 0; index < 12; index += 1) {
    raw += manualCodeAlphabet[crypto.randomInt(manualCodeAlphabet.length)];
  }
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
}

export function normalizeManualPairingCode(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z2-7]/g, '');
}

export function hashPairingQrToken(value) {
  return hmac('pairing-qr', String(value || '').trim());
}

export function hashPairingManualCode(value) {
  return hmac('pairing-manual', normalizeManualPairingCode(value));
}

export function hashDeviceAccessToken(value) {
  return hmac('device-access', String(value || '').trim());
}

export function hashFcmToken(value) {
  return hmac('fcm-token', String(value || '').trim());
}

export function encryptMobileValue(value, purpose) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
  cipher.setAAD(Buffer.from(`mt-workspace-mobile:${purpose}:v1`));
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return {
    ciphertext: encrypted.toString('base64url'),
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url')
  };
}

export function decryptMobileValue(encrypted, purpose) {
  if (!encrypted?.ciphertext || !encrypted?.iv || !encrypted?.tag) return '';
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    encryptionKey,
    Buffer.from(encrypted.iv, 'base64url')
  );
  decipher.setAAD(Buffer.from(`mt-workspace-mobile:${purpose}:v1`));
  decipher.setAuthTag(Buffer.from(encrypted.tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, 'base64url')),
    decipher.final()
  ]).toString('utf8');
}

export function createDeviceCredential() {
  const accessToken = generateOpaqueMobileToken();
  return { accessToken, accessTokenHash: hashDeviceAccessToken(accessToken) };
}
