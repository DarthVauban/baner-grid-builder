import { isDeepStrictEqual } from 'node:util';
import { pool, query } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';

export const siteThemeToolId = 'site_themes';

const currentStoreCondition = `connection.singleton = TRUE AND connection.status IN ('connected', 'syncing', 'error')`;

function serializeSiteTheme(row) {
  return {
    id: row.id,
    name: row.name,
    promoBar: row.draft_promo_bar,
    promoBarEnabled: row.promo_bar_enabled,
    active: row.active,
    publishedAt: row.published_at?.toISOString() ?? null,
    hasUnpublishedChanges: row.name !== row.published_name || !isDeepStrictEqual(row.draft_promo_bar, row.published_promo_bar),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

async function withCurrentStore(operation) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serialize mutations for this connection, including swaps of active themes.
    const { rows: [connection] } = await client.query(`
      SELECT connection.id, connection.generation FROM search_horoshop_connections connection
      WHERE ${currentStoreCondition}
      FOR UPDATE
    `);
    if (!connection) {
      throw new AppError(409, 'HOROSHOP_NOT_CONNECTED', 'Підключіть магазин Хорошопа, щоб редагувати теми сайту.');
    }
    const result = await operation(client, connection);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function findSiteTheme(client, connection, id) {
  const { rows: [theme] } = await client.query(`
    SELECT * FROM site_themes
    WHERE id = $1 AND connection_id = $2 AND connection_generation = $3
  `, [id, connection.id, connection.generation]);
  if (!theme) throw new AppError(404, 'SITE_THEME_NOT_FOUND', 'Тему сайту не знайдено.');
  return theme;
}

export async function listSiteThemes() {
  const { rows } = await query(`
    SELECT theme.* FROM site_themes theme
    JOIN search_horoshop_connections connection
      ON connection.id = theme.connection_id AND connection.generation = theme.connection_generation
    WHERE ${currentStoreCondition}
    ORDER BY theme.updated_at DESC, theme.id DESC
  `);
  return rows.map(serializeSiteTheme);
}

export function createSiteTheme({ name, promoBar }, actorId) {
  return withCurrentStore(async (client, connection) => {
    const { rows: [theme] } = await client.query(`
      INSERT INTO site_themes (connection_id, connection_generation, name, draft_promo_bar, created_by, updated_by)
      VALUES ($1, $2, $3, $4::JSONB, $5, $5)
      RETURNING *
    `, [connection.id, connection.generation, name, JSON.stringify(promoBar), actorId]);
    return serializeSiteTheme(theme);
  });
}

export function updateSiteTheme(id, { name, promoBar }, actorId) {
  return withCurrentStore(async (client, connection) => {
    const current = await findSiteTheme(client, connection, id);
    if (current.name === name && isDeepStrictEqual(current.draft_promo_bar, promoBar)) return serializeSiteTheme(current);

    const { rows: [theme] } = await client.query(`
      UPDATE site_themes SET name = $2, draft_promo_bar = $3::JSONB, updated_by = $4, updated_at = NOW()
      WHERE id = $1 RETURNING *
    `, [id, name, JSON.stringify(promoBar), actorId]);
    return serializeSiteTheme(theme);
  });
}

export function publishSiteTheme(id, actorId) {
  return withCurrentStore(async (client, connection) => {
    const current = await findSiteTheme(client, connection, id);
    const { text, buttonText, buttonUrl } = current.draft_promo_bar;
    if (!text) throw new AppError(422, 'SITE_THEME_PROMO_TEXT_REQUIRED', 'Додайте текст промосмуги перед публікацією.');
    if (Boolean(buttonText) !== Boolean(buttonUrl)) {
      throw new AppError(422, 'SITE_THEME_PROMO_BUTTON_INCOMPLETE', 'Вкажіть текст і посилання для кнопки промосмуги.');
    }

    const { rows: [theme] } = await client.query(`
      UPDATE site_themes
      SET published_name = name, published_promo_bar = draft_promo_bar, published_at = NOW(),
          published_by = $2, updated_by = $2, updated_at = NOW()
      WHERE id = $1 RETURNING *
    `, [id, actorId]);
    return serializeSiteTheme(theme);
  });
}

export function setSiteThemeActive(id, active, actorId) {
  return withCurrentStore(async (client, connection) => {
    const current = await findSiteTheme(client, connection, id);
    if (current.active === active) return serializeSiteTheme(current);
    if (active) {
      if (!current.published_at) {
        throw new AppError(409, 'SITE_THEME_NOT_PUBLISHED', 'Спочатку опублікуйте тему, щоб увімкнути її на сайті.');
      }
      await client.query(`
        UPDATE site_themes SET active = FALSE, updated_by = $3, updated_at = NOW()
        WHERE connection_id = $1 AND connection_generation = $2 AND active = TRUE
      `, [connection.id, connection.generation, actorId]);
    }

    const { rows: [theme] } = await client.query(`
      UPDATE site_themes SET active = $2, updated_by = $3, updated_at = NOW()
      WHERE id = $1 RETURNING *
    `, [id, active, actorId]);
    return serializeSiteTheme(theme);
  });
}

export function setSiteThemePromoBarVisibility(id, enabled, actorId) {
  return withCurrentStore(async (client, connection) => {
    const current = await findSiteTheme(client, connection, id);
    if (current.promo_bar_enabled === enabled) return serializeSiteTheme(current);

    const { rows: [theme] } = await client.query(`
      UPDATE site_themes SET promo_bar_enabled = $2, updated_by = $3, updated_at = NOW()
      WHERE id = $1 RETURNING *
    `, [id, enabled, actorId]);
    return serializeSiteTheme(theme);
  });
}

export function deleteSiteTheme(id) {
  return withCurrentStore(async (client, connection) => {
    const current = await findSiteTheme(client, connection, id);
    if (current.active) {
      throw new AppError(409, 'SITE_THEME_ACTIVE', 'Вимкніть тему на сайті перед видаленням.');
    }
    await client.query('DELETE FROM site_themes WHERE id = $1', [id]);
  });
}

function normalStoreHost(host) {
  return host.toLowerCase().replace(/^www\./u, '');
}

export async function getPublishedSiteThemePromoBar(origin) {
  let storefront;
  try { storefront = new URL(origin); } catch { return null; }
  if (!['http:', 'https:'].includes(storefront.protocol) || storefront.origin !== origin) return null;

  const { rows: [theme] } = await query(`
    SELECT theme.published_promo_bar, connection.store_domain FROM site_themes theme
    JOIN search_horoshop_connections connection
      ON connection.id = theme.connection_id AND connection.generation = theme.connection_generation
    WHERE ${currentStoreCondition} AND theme.active = TRUE AND theme.promo_bar_enabled = TRUE
    LIMIT 1
  `);
  if (!theme || normalStoreHost(storefront.hostname) !== normalStoreHost(theme.store_domain)) return null;
  const config = theme.published_promo_bar;
  return config?.showDesktop || config?.showMobile ? config : null;
}
