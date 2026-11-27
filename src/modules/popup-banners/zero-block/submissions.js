import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { query } from '../../../db/pool.js';
import { AppError } from '../../../lib/app-error.js';
import { storefrontPageUrl } from '../../../lib/storefront-page-context.js';
import { optimizeMediaImage } from '../../media/media.storage.js';
import { documentFormFields, validateFormValues } from './forms.mjs';
import { isZeroForm, zeroFieldTitle } from './zero-form.mjs';
import { currentZeroStore, transaction, zeroNotFound, zeroStoreOrigin } from './workspace.js';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const clientSecret = randomBytes(32);
const windowLength = 600_000;
const grantDuration = 86_400_000;
export const rewardFileLimit = 20 * 1024 * 1024;

export async function uploadZeroReward(name, bytes) {
  if (!name || name.length > 200 || /[\x00-\x1f\x7f/\\]/u.test(name) || !Buffer.isBuffer(bytes) || !bytes.length || bytes.length > rewardFileLimit) {
    throw new AppError(422, 'ZERO_BLOCK_INVALID_FILE', 'Вкажіть коректне ім’я та файл до 20 МіБ.');
  }
  const extension = name.split('.').at(-1).toLowerCase();
  let mime;
  if (['png', 'jpg', 'jpeg', 'webp'].includes(extension)) {
    const image = await optimizeMediaImage(bytes);
    bytes = image.buffer;
    mime = 'image/webp';
    name = name.replace(/\.[^.]+$/u, '.webp');
  } else if (extension === 'pdf' && bytes.subarray(0, 5).toString() === '%PDF-' && bytes.subarray(-1024).includes(Buffer.from('%%EOF'))) {
    mime = 'application/pdf';
  } else if (extension === 'zip' && ['504b0304', '504b0506'].includes(bytes.subarray(0, 4).toString('hex'))) {
    mime = 'application/zip';
  } else if (['txt', 'csv'].includes(extension)) {
    const text = new TextDecoder('utf-8', { fatal: true });
    try {
      if (/[\x00-\x08\x0e-\x1f]/u.test(text.decode(bytes))) throw new Error();
      mime = extension === 'csv' ? 'text/csv' : 'text/plain';
    } catch {
      throw new AppError(422, 'ZERO_BLOCK_INVALID_FILE', 'Текстовий файл має бути у форматі UTF-8.');
    }
  }
  if (!mime) throw new AppError(415, 'ZERO_BLOCK_INVALID_FILE', 'Підтримуються PDF, ZIP, TXT, CSV, PNG, JPEG та WebP.');
  const result = await query(
    `INSERT INTO popup_zero_reward_files (id, name, mime, bytes, byte_length, sha256)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (name, sha256) DO UPDATE SET name = EXCLUDED.name RETURNING id, name, mime, byte_length`,
    [randomUUID(), name, mime, bytes, bytes.length, hash(bytes)]
  );
  const row = result.rows[0];
  return { id: row.id, name: row.name, mime: row.mime, byteLength: row.byte_length };
}

export async function readZeroReward(token) {
  const result = await query(
    `SELECT f.name, f.mime, f.bytes FROM popup_zero_submissions s
     JOIN popup_zero_reward_files f ON f.id = s.reward_file_id
     WHERE s.reward_token = $1 AND s.reward_expires_at > NOW()`, [token]
  );
  if (!result.rows.length) throw new AppError(404, 'ZERO_BLOCK_REWARD_EXPIRED', 'Файл недоступний або посилання вже прострочене.');
  return result.rows[0];
}

function confirmed(row, repeated) {
  const reward = row.reward && {
    ...row.reward,
    ...(row.reward_token ? { href: `/api/public/popup-banners/zero-block/rewards/${row.reward_token}` } : {})
  };
  return { submissionId: row.contact_id, repeated, ...(reward ? { reward } : {}) };
}

export async function submitZeroBlock(publicId, input, requestOrigin, ip) {
  return transaction(async (db) => {
    const store = await currentZeroStore(db, true);
    if (!store || !zeroStoreOrigin(requestOrigin, store.store_domain)) {
      throw new AppError(403, 'ZERO_BLOCK_ORIGIN', 'Домен магазину не підтверджено.');
    }
    const result = await db.query(
      `SELECT * FROM popup_banner_campaigns WHERE public_id = $1 AND zero_block = TRUE
       AND status = 'active' AND connection_id = $2 AND connection_generation = $3 FOR UPDATE`,
      [publicId, store.id, store.generation]
    );
    const campaign = result.rows[0];
    if (!campaign) throw zeroNotFound();
    if (campaign.zero_publication_id !== input.versionId) throw new AppError(409, 'ZERO_BLOCK_VERSION_CHANGED', 'Банер оновлено. Перезавантажте сторінку.');
    const version = await db.query('SELECT snapshot FROM popup_banner_versions WHERE id = $1 AND campaign_id = $2', [input.versionId, campaign.id]);
    const { document, storeDomain } = version.rows[0].snapshot;
    if (storeDomain !== store.store_domain) throw zeroNotFound();
    const fields = documentFormFields(document, input.formId);
    if (!fields.length) throw new AppError(422, 'ZERO_BLOCK_FORM_MISSING', 'Форму не знайдено.');
    const content = document.elements.find((item) => item.type === 'form' && item.content.formId === input.formId)?.content;
    let values;
    try {
      values = validateFormValues(fields, input.values, { zero: isZeroForm(content), messages: content?.behavior?.errors });
    } catch (error) {
      throw new AppError(422, 'ZERO_BLOCK_INVALID_VALUES', error.message);
    }
    const payloadHash = hash(JSON.stringify([input.versionId, input.formId, values]));
    const dedupeKey = hash(input.requestKey);
    const prior = await db.query(
      `SELECT s.* FROM popup_zero_submissions s JOIN popup_banner_contacts c ON c.id = s.contact_id
       WHERE c.campaign_id = $1 AND c.dedupe_key = $2`, [campaign.id, dedupeKey]
    );
    if (prior.rows.length) {
      const row = prior.rows[0];
      if (row.payload_hash !== payloadHash) throw new AppError(409, 'ZERO_BLOCK_SUBMISSION_CONFLICT', 'Цей ключ уже використано для іншої заявки.');
      if (row.reward_token) await db.query('UPDATE popup_zero_submissions SET reward_expires_at = $2 WHERE contact_id = $1',
        [row.contact_id, new Date(Date.now() + grantDuration)]);
      return confirmed(row, true);
    }
    const windowStart = new Date(Math.floor(Date.now() / windowLength) * windowLength);
    const clientHash = createHmac('sha256', clientSecret).update(ip || 'unknown').digest('hex');
    const limit = await db.query(
      `INSERT INTO popup_zero_submit_limits (connection_id, form_id, client_hash, window_start, attempts)
       VALUES ($1, $2, $3, $4, 1) ON CONFLICT (connection_id, form_id, client_hash, window_start)
       DO UPDATE SET attempts = popup_zero_submit_limits.attempts + 1 WHERE popup_zero_submit_limits.attempts < 5
       RETURNING attempts`, [store.id, input.formId, clientHash, windowStart]
    );
    if (!limit.rows.length) throw new AppError(429, 'ZERO_BLOCK_SUBMISSION_LIMIT', 'Забагато спроб. Спробуйте пізніше.');
    await db.query('DELETE FROM popup_zero_submit_limits WHERE connection_id = $1 AND window_start < $2',
      [store.id, new Date(windowStart.valueOf() - 3_600_000)]);
    const contactId = randomUUID();
    const fieldSnapshot = fields.map((field) => ({ key: field.variable, label: zeroFieldTitle(field) }));
    let pageUrl = null;
    try {
      const url = new URL(input.pageUrl);
      if (url.origin === requestOrigin) pageUrl = storefrontPageUrl(url.href) || null;
    } catch { /* the verified Origin remains authoritative */ }
    await db.query(
      `INSERT INTO popup_banner_contacts (id, campaign_id, values, dedupe_key, page_url, form_id, form_revision, field_snapshot)
       VALUES ($1, $2, $3::JSONB, $4, $5, $6, $7, $8::JSONB)`,
      [contactId, campaign.id, JSON.stringify(values), dedupeKey, pageUrl, input.formId, input.versionId, JSON.stringify(fieldSnapshot)]
    );
    const reward = content?.flow ? structuredClone(content.flow.reward) : null;
    const fileId = reward?.type === 'file' ? reward.fileId : null;
    const token = fileId ? randomBytes(32).toString('hex') : null;
    if (fileId) {
      const file = await db.query('SELECT name FROM popup_zero_reward_files WHERE id = $1', [fileId]);
      if (!file.rows.length) throw new AppError(409, 'ZERO_BLOCK_REWARD_MISSING', 'Файл винагороди недоступний.');
      reward.fileName = file.rows[0].name;
      delete reward.fileId;
    }
    const saved = await db.query(
      `INSERT INTO popup_zero_submissions (contact_id, publication_id, payload_hash, reward, reward_file_id, reward_token, reward_expires_at)
       VALUES ($1, $2, $3, $4::JSONB, $5, $6, $7) RETURNING *`,
      [contactId, input.versionId, payloadHash, reward ? JSON.stringify(reward) : null,
        fileId, token, token ? new Date(Date.now() + grantDuration) : null]
    );
    return confirmed(saved.rows[0], false);
  });
}

export async function listZeroContacts({ page, campaignId }) {
  const pageSize = 30;
  const from = `FROM popup_zero_submissions s
    JOIN popup_banner_contacts c ON c.id = s.contact_id
    JOIN popup_banner_campaigns b ON b.id = c.campaign_id
    JOIN popup_banner_versions v ON v.id = s.publication_id
    ${campaignId ? 'WHERE c.campaign_id = $1' : ''}`;
  const scope = campaignId ? [campaignId] : [];
  const [result, count] = await Promise.all([
    query(`SELECT c.*, b.zero_deleted_at, v.snapshot ${from}
      ORDER BY c.created_at DESC, c.id DESC LIMIT ${pageSize} OFFSET $${scope.length + 1}`, [...scope, (page - 1) * pageSize]),
    query(`SELECT COUNT(*) AS total ${from}`, scope)
  ]);
  return {
    pageSize, total: Number(count.rows[0].total),
    items: result.rows.map((row) => ({
      id: row.id, campaignId: row.campaign_id, campaignName: row.snapshot.document.name,
      deleted: !!row.zero_deleted_at, createdAt: row.created_at,
      fields: row.field_snapshot.filter((field) => Object.hasOwn(row.values, field.key))
        .map((field) => ({ label: field.label, value: row.values[field.key] }))
    }))
  };
}
