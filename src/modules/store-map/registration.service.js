import { createHash, randomBytes } from 'node:crypto';
import { pool, query } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import { normalizeStoreMapText, scheduleFromHoursText } from './store-map.service.js';

const linkLifetimeMs = 7 * 24 * 60 * 60 * 1000;
const tokenHash = (token) => createHash('sha256').update(token).digest('hex');

export function serializeRegistrationLink(row) {
  return { id: row.id, label: row.label, createdAt: row.created_at, expiresAt: row.expires_at,
    revokedAt: row.revoked_at, usedAt: row.used_at };
}

export function serializeRegistrationRequest(row) {
  return {
    id: row.id, linkId: row.link_id, status: row.status, version: row.version,
    name: row.name, city: row.city, address: row.address, hoursText: row.hours_text,
    latitude: Number(row.latitude), longitude: Number(row.longitude),
    submittedData: row.submitted_data, measurement: row.measurement,
    reviewNote: row.review_note, reviewedBy: row.reviewed_by, reviewedAt: row.reviewed_at,
    pointId: row.point_id, createdAt: row.created_at, updatedAt: row.updated_at
  };
}

export async function createRegistrationLink(label, actorId) {
  const token = randomBytes(32).toString('base64url');
  const result = await query(
    `INSERT INTO store_map_registration_links (token_hash, label, created_by, expires_at)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [tokenHash(token), label, actorId, new Date(Date.now() + linkLifetimeMs)]
  );
  return { ...serializeRegistrationLink(result.rows[0]), token };
}

function assertLinkAvailable(link) {
  if (!link) throw new AppError(404, 'STORE_MAP_LINK_NOT_FOUND', 'Посилання не знайдено. Попросіть нове посилання у відповідального.');
  if (link.revoked_at || (!link.used_at && new Date(link.expires_at).getTime() <= Date.now())) {
    throw new AppError(410, 'STORE_MAP_LINK_EXPIRED', 'Посилання відкликане або строк його дії минув. Попросіть нове посилання.');
  }
}

export async function registrationLinkState(token) {
  if (!token) return { status: 'OPEN', expiresAt: null, reusable: true };
  const result = await query('SELECT * FROM store_map_registration_links WHERE token_hash = $1', [tokenHash(token)]);
  const link = result.rows[0];
  assertLinkAvailable(link);
  return { status: link.used_at ? 'SUBMITTED' : 'OPEN', expiresAt: link.expires_at };
}

async function transaction(action) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await action(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function submitRegistration(token, input) {
  return transaction(async (db) => {
    let link = null;
    if (token) {
      const result = await db.query('SELECT * FROM store_map_registration_links WHERE token_hash = $1 FOR UPDATE', [tokenHash(token)]);
      link = result.rows[0];
      assertLinkAvailable(link);
      if (link.used_at) return { status: 'SUBMITTED' };
    }
    const submittedData = { name: input.name, city: input.city, address: input.address, hoursText: input.hoursText,
      latitude: input.latitude, longitude: input.longitude, comment: input.comment };
    const submissionId = link ? null : input.submissionId;
    const submissionHash = link ? null : tokenHash(JSON.stringify({ ...submittedData, measurement: input.measurement }));
    // Each new form gets its own key. Retrying that form must not create a duplicate or silently replace data.
    const existingSubmission = async () => {
      const existing = await db.query('SELECT submission_hash FROM store_map_registration_requests WHERE submission_id = $1', [submissionId]);
      if (!existing.rows[0]) return false;
      if (existing.rows[0].submission_hash !== submissionHash) {
        throw new AppError(409, 'STORE_MAP_SUBMISSION_CHANGED', 'Цю заявку вже отримано з іншими даними. Відкрийте форму знову для нової заявки.');
      }
      return true;
    };
    if (submissionId && await existingSubmission()) return { status: 'SUBMITTED' };
    const age = Date.now() - new Date(input.measurement.observedAt).getTime();
    if (age > 15 * 60 * 1000 || age < -2 * 60 * 1000) {
      throw new AppError(422, 'STORE_MAP_LOCATION_STALE', 'Виміряйте місцезнаходження ще раз: потрібні свіжі координати. Перевірте час на телефоні.');
    }
    await db.query(
      `INSERT INTO store_map_registration_requests
       (link_id, name, city, address, hours_text, latitude, longitude, submitted_data, measurement, submission_id, submission_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::JSONB, $9::JSONB, $10, $11)
       ON CONFLICT (submission_id) DO NOTHING`,
      [link?.id || null, input.name, input.city, input.address, input.hoursText, input.latitude, input.longitude,
        JSON.stringify(submittedData), JSON.stringify(input.measurement), submissionId, submissionHash]
    );
    if (submissionId && !await existingSubmission()) {
      throw new AppError(409, 'STORE_MAP_SUBMISSION_RETRY', 'Не вдалося підтвердити заявку. Повторіть надсилання.');
    }
    if (link) await db.query('UPDATE store_map_registration_links SET used_at = NOW() WHERE id = $1', [link.id]);
    return { status: 'SUBMITTED' };
  });
}

export async function loadRegistrationRequest(id, db = { query }, lock = false) {
  const result = await db.query(`SELECT * FROM store_map_registration_requests WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [id]);
  if (!result.rows[0]) throw new AppError(404, 'STORE_MAP_REQUEST_NOT_FOUND', 'Заявку не знайдено.');
  return result.rows[0];
}

export async function reviewRegistration(id, input, actorId, decision) {
  return transaction(async (db) => {
    const row = await loadRegistrationRequest(id, db, true);
    if (row.status === decision) {
      const sameReview = row.reviewed_by === actorId && row.version === input.version + 1 && row.review_note === input.reviewNote;
      const sameStore = decision !== 'APPROVED' || (row.name === input.name && row.city === input.city
        && row.address === input.address && row.hours_text === input.hoursText
        && Math.abs(Number(row.latitude) - input.latitude) < 0.0000001
        && Math.abs(Number(row.longitude) - input.longitude) < 0.0000001);
      if (sameReview && sameStore) return serializeRegistrationRequest(row);
      throw new AppError(409, 'STORE_MAP_REQUEST_CHANGED', 'Заявку вже розглянуто з іншими даними або іншим відповідальним. Оновіть її.');
    }
    if (row.status !== 'NEW' || row.version !== input.version) {
      throw new AppError(409, 'STORE_MAP_REQUEST_CHANGED', 'Заявку вже змінено або розглянуто. Оновіть її перед продовженням.');
    }
    let pointId = null;
    if (decision === 'APPROVED') {
      const point = await db.query(
        `INSERT INTO store_map_points
         (name, normalized_name, city, normalized_city, address, hours_text, schedule,
          latitude, longitude, publication_status, open_status_override, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7::JSONB, $8, $9, 'ACTIVE', 'AUTO', $10, $10) RETURNING id`,
        [input.name, normalizeStoreMapText(input.name), input.city, normalizeStoreMapText(input.city),
          input.address, input.hoursText, JSON.stringify(scheduleFromHoursText(input.hoursText)),
          input.latitude, input.longitude, actorId]
      );
      pointId = point.rows[0].id;
    }
    const updated = await db.query(
      `UPDATE store_map_registration_requests
       SET status = $1, name = $2, city = $3, address = $4, hours_text = $5,
           latitude = $6, longitude = $7, review_note = $8, reviewed_by = $9,
           reviewed_at = NOW(), updated_at = NOW(), point_id = $10, version = version + 1
       WHERE id = $11 AND status = 'NEW' AND version = $12 RETURNING *`,
      [decision, decision === 'APPROVED' ? input.name : row.name, decision === 'APPROVED' ? input.city : row.city,
        decision === 'APPROVED' ? input.address : row.address, decision === 'APPROVED' ? input.hoursText : row.hours_text,
        decision === 'APPROVED' ? input.latitude : row.latitude, decision === 'APPROVED' ? input.longitude : row.longitude,
        input.reviewNote, actorId, pointId, id, input.version]
    );
    if (!updated.rows[0]) throw new AppError(409, 'STORE_MAP_REQUEST_CHANGED', 'Заявку вже розглянуто. Оновіть список.');
    return serializeRegistrationRequest(updated.rows[0]);
  });
}
