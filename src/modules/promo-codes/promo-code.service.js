import { query } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';

function normalizeCode(value) {
  return String(value || '').trim().toLocaleUpperCase('uk-UA');
}

function promoCodeStatus(row, now = new Date()) {
  if (row.enabled !== true) return 'disabled';
  if (row.starts_at && new Date(row.starts_at) > now) return 'scheduled';
  if (row.ends_at && new Date(row.ends_at) <= now) return 'ended';
  return 'active';
}

export function promoCodeSnapshot(row, capturedAt = new Date()) {
  if (!row) return null;
  return {
    libraryId: row.id,
    internalName: row.internal_name,
    code: row.code,
    type: row.promo_type,
    discountValue: Number(row.discount_value),
    currency: row.currency || '',
    startsAt: row.starts_at || null,
    endsAt: row.ends_at || null,
    usageLimit: row.usage_limit === null ? null : Number(row.usage_limit),
    scopeNote: row.scope_note || '',
    status: promoCodeStatus(row, capturedAt),
    horoshopConfirmed: row.horoshop_confirmed === true,
    capturedAt: capturedAt.toISOString()
  };
}

function serializeCampaignUsage(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item?.id).map((item) => ({
    id: item.id,
    name: item.name,
    status: item.status,
    campaignType: item.campaignType
  }));
}

function serializePromoCode(row, campaigns = []) {
  return {
    id: row.id,
    connectionId: row.connection_id,
    storeDomain: row.store_domain || '',
    internalName: row.internal_name,
    code: row.code,
    type: row.promo_type,
    discountValue: Number(row.discount_value),
    currency: row.currency || '',
    startsAt: row.starts_at || null,
    endsAt: row.ends_at || null,
    usageLimit: row.usage_limit === null ? null : Number(row.usage_limit),
    scopeNote: row.scope_note || '',
    status: promoCodeStatus(row),
    enabled: row.enabled === true,
    horoshopConfirmed: row.horoshop_confirmed === true,
    campaigns: serializeCampaignUsage(campaigns),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function currentConnection(db = { query }) {
  const result = await db.query(
    `SELECT id, generation, store_domain
     FROM search_horoshop_connections
     WHERE singleton = TRUE LIMIT 1`
  );
  if (!result.rows[0]) {
    throw new AppError(409, 'HOROSHOP_NOT_CONNECTED', 'Підключіть магазин Хорошоп перед роботою з промокодами.');
  }
  return result.rows[0];
}

const listSql = `
  SELECT promo.*, connection.store_domain
  FROM horoshop_promo_codes AS promo
  JOIN search_horoshop_connections AS connection ON connection.id = promo.connection_id`;

async function campaignUsageByPromoCode(connectionId, db = { query }) {
  const result = await db.query(
    `SELECT campaign.promo_code_id, campaign.id, campaign.name, campaign.status,
            campaign.campaign_type AS "campaignType"
     FROM popup_banner_campaigns AS campaign
     JOIN horoshop_promo_codes AS promo ON promo.id = campaign.promo_code_id
     WHERE promo.connection_id = $1
     ORDER BY campaign.updated_at DESC`,
    [connectionId]
  );
  const grouped = new Map();
  for (const row of result.rows) {
    const current = grouped.get(row.promo_code_id) || [];
    current.push(row);
    grouped.set(row.promo_code_id, current);
  }
  return grouped;
}

export async function listPromoCodes({ search = '', status = '' } = {}) {
  const connection = await currentConnection();
  const result = await query(
    `${listSql}
     WHERE promo.connection_id = $1
       AND ($2::TEXT = '' OR promo.internal_name ILIKE '%' || $2 || '%' OR promo.code ILIKE '%' || $2 || '%')
     ORDER BY promo.updated_at DESC`,
    [connection.id, String(search || '').trim()]
  );
  const usage = await campaignUsageByPromoCode(connection.id);
  return result.rows.map((row) => serializePromoCode(row, usage.get(row.id) || []))
    .filter((item) => !status || item.status === status);
}

export async function getPromoCode(id, db = { query }) {
  const connection = await currentConnection(db);
  const result = await db.query(`${listSql} WHERE promo.id = $1 AND promo.connection_id = $2`, [id, connection.id]);
  if (!result.rows[0]) throw new AppError(404, 'PROMO_CODE_NOT_FOUND', 'Промокод не знайдено.');
  const usage = await campaignUsageByPromoCode(connection.id, db);
  return serializePromoCode(result.rows[0], usage.get(id) || []);
}

export async function loadPromoCodeRow(id, connectionId, db = { query }, lock = false) {
  const result = await db.query(
    `SELECT * FROM horoshop_promo_codes
     WHERE id = $1 AND connection_id = $2${lock ? ' FOR SHARE' : ''}`,
    [id, connectionId]
  );
  if (!result.rows[0]) throw new AppError(422, 'PROMO_CODE_NOT_FOUND', 'Оберіть промокод із бібліотеки поточного магазину.');
  return result.rows[0];
}

function databaseError(error) {
  if (error?.code === '23505') {
    throw new AppError(409, 'PROMO_CODE_DUPLICATE', 'Такий промокод уже є в бібліотеці цього магазину.');
  }
  throw error;
}

export async function createPromoCode(input, actorUserId) {
  const connection = await currentConnection();
  try {
    const result = await query(
      `INSERT INTO horoshop_promo_codes (
         connection_id, internal_name, code, code_normalized, promo_type, discount_value,
         currency, starts_at, ends_at, usage_limit, scope_note, enabled,
         horoshop_confirmed, created_by, updated_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14)
       RETURNING id`,
      [connection.id, input.internalName, input.code.trim(), normalizeCode(input.code), input.type,
        input.discountValue, input.type === 'amount_certificate' ? input.currency.trim().toUpperCase() : null,
        input.startsAt || null, input.endsAt || null, input.usageLimit || null, input.scopeNote || '',
        input.enabled, input.horoshopConfirmed, actorUserId]
    );
    return getPromoCode(result.rows[0].id);
  } catch (error) {
    databaseError(error);
  }
}

export async function updatePromoCode(id, input, actorUserId) {
  const connection = await currentConnection();
  try {
    const result = await query(
      `UPDATE horoshop_promo_codes
       SET internal_name = $3, code = $4, code_normalized = $5, promo_type = $6,
           discount_value = $7, currency = $8, starts_at = $9, ends_at = $10,
           usage_limit = $11, scope_note = $12, enabled = $13,
           horoshop_confirmed = $14, updated_by = $15, updated_at = NOW()
       WHERE id = $1 AND connection_id = $2 RETURNING id`,
      [id, connection.id, input.internalName, input.code.trim(), normalizeCode(input.code), input.type,
        input.discountValue, input.type === 'amount_certificate' ? input.currency.trim().toUpperCase() : null,
        input.startsAt || null, input.endsAt || null, input.usageLimit || null, input.scopeNote || '',
        input.enabled, input.horoshopConfirmed, actorUserId]
    );
    if (!result.rows[0]) throw new AppError(404, 'PROMO_CODE_NOT_FOUND', 'Промокод не знайдено.');
    return getPromoCode(id);
  } catch (error) {
    databaseError(error);
  }
}

export async function deletePromoCode(id) {
  const connection = await currentConnection();
  const usage = await query(
    'SELECT COUNT(*)::INTEGER AS count FROM popup_banner_campaigns WHERE promo_code_id = $1',
    [id]
  );
  if (Number(usage.rows[0]?.count || 0) > 0) {
    throw new AppError(409, 'PROMO_CODE_IN_USE', 'Промокод використовується в кампаніях. Вимкніть його замість видалення.');
  }
  const result = await query(
    'DELETE FROM horoshop_promo_codes WHERE id = $1 AND connection_id = $2 RETURNING id',
    [id, connection.id]
  );
  if (!result.rows[0]) throw new AppError(404, 'PROMO_CODE_NOT_FOUND', 'Промокод не знайдено.');
}
