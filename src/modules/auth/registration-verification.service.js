import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { env } from '../../config/env.js';
import { pool, query } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import { serializeUser } from '../../lib/serializers.js';
import { getMailtrapCredentials } from '../integrations/integration.service.js';
import { parseAvatarDataUrl } from '../users/avatar.service.js';

const codeTtlMinutes = 10;
const resendCooldownSeconds = 60;
const maxVerificationAttempts = 5;

function createVerificationCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function hashVerificationCode(email, code) {
  return crypto
    .createHmac('sha256', env.JWT_SECRET)
    .update(`${email}:${code}`)
    .digest('hex');
}

function isHashMatch(expected, actual) {
  const expectedBuffer = Buffer.from(expected, 'hex');
  const actualBuffer = Buffer.from(actual, 'hex');
  return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

async function sendRegistrationCode(email, code) {
  if (env.NODE_ENV === 'test') return;

  const credentials = await getMailtrapCredentials();

  if (!credentials?.token || !credentials.senderEmail) {
    throw new AppError(503, 'MAILTRAP_NOT_CONFIGURED', 'Відправку кодів підтвердження ще не налаштовано.');
  }

  const response = await fetch('https://send.api.mailtrap.io/api/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${credentials.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: {
        email: credentials.senderEmail,
        name: credentials.senderName || 'MT Panel'
      },
      to: [{ email }],
      subject: 'Код підтвердження реєстрації MT Panel',
      text: `Ваш код підтвердження реєстрації: ${code}. Код діє ${codeTtlMinutes} хвилин.`,
      html: `<p>Ваш код підтвердження реєстрації:</p><p style="font-size:24px;font-weight:700;letter-spacing:4px">${code}</p><p>Код діє ${codeTtlMinutes} хвилин.</p>`,
      category: 'Registration verification'
    })
  });

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    console.error('Mailtrap registration email failed', response.status, details);
    throw new AppError(502, 'MAILTRAP_SEND_FAILED', 'Не вдалося надіслати код підтвердження.');
  }
}

export async function requestRegistrationVerification(input) {
  const email = input.email.toLowerCase();
  const existingUser = await query('SELECT 1 FROM users WHERE email = $1', [email]);
  if (existingUser.rowCount) throw new AppError(409, 'EMAIL_EXISTS', 'Користувач із таким email уже існує.');

  const existingRequest = await query(
    `SELECT resend_available_at
     FROM registration_verifications
     WHERE email = $1 AND expires_at > NOW()`,
    [email]
  );
  const existingResendAvailableAt = existingRequest.rows[0]?.resend_available_at;
  if (existingResendAvailableAt && new Date(existingResendAvailableAt).getTime() > Date.now()) {
    throw new AppError(429, 'REGISTRATION_CODE_RECENTLY_SENT', 'Код уже надіслано. Спробуйте повторити трохи пізніше.');
  }

  const legacyName = input.name?.trim() || '';
  const firstName = input.firstName?.trim() || legacyName;
  const lastName = input.lastName?.trim() || '';
  const fullName = `${firstName} ${lastName}`.trim();
  const passwordHash = await bcrypt.hash(input.password, 12);
  const avatar = parseAvatarDataUrl(input.avatarDataUrl);
  const code = createVerificationCode();
  const codeHash = hashVerificationCode(email, code);
  const expiresAt = new Date(Date.now() + codeTtlMinutes * 60 * 1000);
  const resendAvailableAt = new Date(Date.now() + resendCooldownSeconds * 1000);

  await sendRegistrationCode(email, code);

  const result = await query(
    `INSERT INTO registration_verifications (
       email, first_name, last_name, name, password_hash, avatar_data, avatar_mime,
       code_hash, attempts, expires_at, resend_available_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0,
             $9,
             $10,
             NOW())
     ON CONFLICT (email)
     DO UPDATE SET first_name = EXCLUDED.first_name,
                   last_name = EXCLUDED.last_name,
                   name = EXCLUDED.name,
                   password_hash = EXCLUDED.password_hash,
                   avatar_data = EXCLUDED.avatar_data,
                   avatar_mime = EXCLUDED.avatar_mime,
                   code_hash = EXCLUDED.code_hash,
                   attempts = 0,
                   expires_at = EXCLUDED.expires_at,
                   resend_available_at = EXCLUDED.resend_available_at,
                   updated_at = NOW()
     RETURNING email, expires_at, resend_available_at`,
    [
      email,
      firstName,
      lastName,
      fullName,
      passwordHash,
      avatar.data,
      avatar.mime,
      codeHash,
      expiresAt,
      resendAvailableAt
    ]
  );

  return {
    email: result.rows[0].email,
    expiresAt: result.rows[0].expires_at,
    resendAvailableAt: result.rows[0].resend_available_at,
    devCode: env.NODE_ENV === 'test' ? code : undefined
  };
}

export async function verifyRegistrationCode(emailInput, codeInput) {
  const email = emailInput.toLowerCase();
  const code = codeInput.trim();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const existingUser = await client.query('SELECT 1 FROM users WHERE email = $1', [email]);
    if (existingUser.rowCount) throw new AppError(409, 'EMAIL_EXISTS', 'Користувач із таким email уже існує.');

    const verificationResult = await client.query(
      `SELECT *
       FROM registration_verifications
       WHERE email = $1
       FOR UPDATE`,
      [email]
    );
    const verification = verificationResult.rows[0];
    if (!verification) throw new AppError(404, 'REGISTRATION_NOT_FOUND', 'Заявку на реєстрацію не знайдено.');

    if (new Date(verification.expires_at).getTime() <= Date.now()) {
      await client.query('DELETE FROM registration_verifications WHERE email = $1', [email]);
      throw new AppError(410, 'REGISTRATION_CODE_EXPIRED', 'Код підтвердження вже не діє. Надішліть код повторно.');
    }

    if (verification.attempts >= maxVerificationAttempts) {
      throw new AppError(429, 'REGISTRATION_CODE_LOCKED', 'Забагато невдалих спроб. Надішліть новий код.');
    }

    const submittedHash = hashVerificationCode(email, code);
    if (!isHashMatch(verification.code_hash, submittedHash)) {
      await client.query(
        'UPDATE registration_verifications SET attempts = attempts + 1, updated_at = NOW() WHERE email = $1',
        [email]
      );
      throw new AppError(422, 'INVALID_REGISTRATION_CODE', 'Неправильний код підтвердження.');
    }

    const userResult = await client.query(
      `INSERT INTO users (
         name, first_name, last_name, email, password_hash, avatar_data, avatar_mime,
         status, approved_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'approved', NOW())
       RETURNING id, name, first_name, last_name, email, department, position, avatar_mime,
                 role, status, can_manage_tool_access, two_factor_enabled,
                 two_factor_confirmed_at, approved_at, created_at, updated_at`,
      [
        verification.name,
        verification.first_name,
        verification.last_name,
        verification.email,
        verification.password_hash,
        verification.avatar_data,
        verification.avatar_mime
      ]
    );
    await client.query('DELETE FROM registration_verifications WHERE email = $1', [email]);
    await client.query('COMMIT');

    return serializeUser(userResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
