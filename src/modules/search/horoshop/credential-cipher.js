import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes
} from 'node:crypto';
import { env } from '../../../config/env.js';

const credentialVersion = 'v1';
const associatedData = Buffer.from('mt-workspace:search:horoshop-credentials:v1', 'utf8');

function encryptionKey() {
  return createHash('sha256')
    .update(env.JWT_SECRET)
    .update('\0search-horoshop-credentials')
    .digest();
}

export function encryptHoroshopCredentials(credentials) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAAD(associatedData);
  const plaintext = Buffer.from(JSON.stringify(credentials), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [credentialVersion, iv, tag, encrypted]
    .map((part) => typeof part === 'string' ? part : part.toString('base64url'))
    .join('.');
}

export function decryptHoroshopCredentials(payload) {
  const [version, ivValue, tagValue, encryptedValue, extra] = String(payload || '').split('.');
  if (version !== credentialVersion || !ivValue || !tagValue || !encryptedValue || extra) {
    throw new Error('Unsupported encrypted Horoshop credential payload');
  }

  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivValue, 'base64url'));
  decipher.setAAD(associatedData);
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64url')),
    decipher.final()
  ]);
  const credentials = JSON.parse(decrypted.toString('utf8'));

  if (typeof credentials?.login !== 'string' || typeof credentials?.password !== 'string') {
    throw new Error('Horoshop credential payload is invalid');
  }
  return { login: credentials.login, password: credentials.password };
}
