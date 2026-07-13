import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { query } from '../../db/pool.js';

const integrationKey = crypto.scryptSync(env.JWT_SECRET, 'mt-workspace-integrations-v1', 32);
const secretAad = Buffer.from('mt-workspace-integration-secret:v1');

function encryptSecret(secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', integrationKey, iv);
  cipher.setAAD(secretAad);

  const encrypted = Buffer.concat([
    cipher.update(secret, 'utf8'),
    cipher.final()
  ]);

  return {
    secretCiphertext: encrypted.toString('base64url'),
    secretIv: iv.toString('base64url'),
    secretTag: cipher.getAuthTag().toString('base64url')
  };
}

function decryptSecret(row) {
  if (!row?.secret_ciphertext || !row.secret_iv || !row.secret_tag) return '';

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    integrationKey,
    Buffer.from(row.secret_iv, 'base64url')
  );
  decipher.setAAD(secretAad);
  decipher.setAuthTag(Buffer.from(row.secret_tag, 'base64url'));

  return Buffer.concat([
    decipher.update(Buffer.from(row.secret_ciphertext, 'base64url')),
    decipher.final()
  ]).toString('utf8');
}

function serializeMailtrap(row) {
  const config = row?.public_config || {};

  return {
    configured: Boolean(row?.secret_ciphertext),
    senderEmail: config.senderEmail || '',
    senderName: config.senderName || '',
    domain: config.domain || '',
    updatedAt: row?.updated_at || null
  };
}

export async function getAdminIntegrations() {
  const result = await query(
    `SELECT key, public_config, secret_ciphertext, updated_at
     FROM integration_settings
     WHERE key = 'mailtrap'`
  );

  return {
    mailtrap: serializeMailtrap(result.rows[0])
  };
}

export async function saveMailtrapIntegration(input, userId) {
  const currentResult = await query(
    `SELECT secret_ciphertext, secret_iv, secret_tag
     FROM integration_settings
     WHERE key = 'mailtrap'`
  );
  const current = currentResult.rows[0];
  const token = input.token.trim();

  if (!token && !current?.secret_ciphertext) {
    throw new Error('MAILTRAP_TOKEN_REQUIRED');
  }

  const secret = token ? encryptSecret(token) : {
    secretCiphertext: current.secret_ciphertext,
    secretIv: current.secret_iv,
    secretTag: current.secret_tag
  };
  const senderEmail = input.senderEmail.toLowerCase();
  const publicConfig = {
    senderEmail,
    senderName: input.senderName,
    domain: senderEmail.split('@')[1] || ''
  };

  const result = await query(
    `INSERT INTO integration_settings (
       key, display_name, public_config, secret_ciphertext, secret_iv, secret_tag, updated_by, updated_at
     )
     VALUES ('mailtrap', 'Mailtrap', $1::jsonb, $2, $3, $4, $5, NOW())
     ON CONFLICT (key)
     DO UPDATE SET public_config = EXCLUDED.public_config,
                   secret_ciphertext = EXCLUDED.secret_ciphertext,
                   secret_iv = EXCLUDED.secret_iv,
                   secret_tag = EXCLUDED.secret_tag,
                   updated_by = EXCLUDED.updated_by,
                   updated_at = NOW()
     RETURNING key, public_config, secret_ciphertext, updated_at`,
    [
      JSON.stringify(publicConfig),
      secret.secretCiphertext,
      secret.secretIv,
      secret.secretTag,
      userId
    ]
  );

  return serializeMailtrap(result.rows[0]);
}

export async function getMailtrapCredentials() {
  const result = await query(
    `SELECT public_config, secret_ciphertext, secret_iv, secret_tag
     FROM integration_settings
     WHERE key = 'mailtrap'`
  );
  const row = result.rows[0];
  if (!row?.secret_ciphertext) return null;

  const config = row.public_config || {};

  return {
    token: decryptSecret(row),
    senderEmail: config.senderEmail || '',
    senderName: config.senderName || ''
  };
}
