import { isDeepStrictEqual } from 'node:util';
import { pool, query } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import { withPromoBarStyleDefaults } from './site-theme-promo-bar.js';

export const siteThemeToolId = 'site_themes';

const currentStoreCondition = `connection.singleton = TRUE AND connection.status IN ('connected', 'syncing', 'error')`;

function serializeSiteTheme(row) {
  const promoBar = withPromoBarStyleDefaults(row.draft_promo_bar);
  const publishedPromoBar = row.published_promo_bar && withPromoBarStyleDefaults(row.published_promo_bar);
  return {
    id: row.id,
    name: row.name,
    promoBar,
    promoBarEnabled: row.promo_bar_enabled,
    goldGlintEnabled: row.gold_glint_enabled,
    active: row.active,
    publishedAt: row.published_at?.toISOString() ?? null,
    hasUnpublishedChanges: row.name !== row.published_name || !isDeepStrictEqual(promoBar, publishedPromoBar),
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
    `, [connection.id, connection.generation, name, JSON.stringify(withPromoBarStyleDefaults(promoBar)), actorId]);
    return serializeSiteTheme(theme);
  });
}

export function updateSiteTheme(id, { name, promoBar }, actorId) {
  return withCurrentStore(async (client, connection) => {
    const current = await findSiteTheme(client, connection, id);
    const currentPromoBar = withPromoBarStyleDefaults(current.draft_promo_bar);
    const updatedPromoBar = { ...currentPromoBar, ...promoBar };
    if (current.name === name && isDeepStrictEqual(currentPromoBar, updatedPromoBar)) return serializeSiteTheme(current);

    const { rows: [theme] } = await client.query(`
      UPDATE site_themes SET name = $2, draft_promo_bar = $3::JSONB, updated_by = $4, updated_at = NOW()
      WHERE id = $1 RETURNING *
    `, [id, name, JSON.stringify(updatedPromoBar), actorId]);
    return serializeSiteTheme(theme);
  });
}

export function publishSiteTheme(id, actorId) {
  return withCurrentStore(async (client, connection) => {
    const current = await findSiteTheme(client, connection, id);
    const { text, buttonText, buttonUrl, mode } = withPromoBarStyleDefaults(current.draft_promo_bar);
    if (!text) throw new AppError(422, 'SITE_THEME_PROMO_TEXT_REQUIRED', 'Додайте текст промосмуги перед публікацією.');
    if (mode === 'standard' && Boolean(buttonText) !== Boolean(buttonUrl)) {
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

function setSiteThemeElementVisibility(id, enabled, actorId, field) {
  return withCurrentStore(async (client, connection) => {
    const current = await findSiteTheme(client, connection, id);
    if (current[field] === enabled) return serializeSiteTheme(current);

    const { rows: [theme] } = await client.query(`
      UPDATE site_themes SET ${field} = $2, updated_by = $3, updated_at = NOW()
      WHERE id = $1 RETURNING *
    `, [id, enabled, actorId]);
    return serializeSiteTheme(theme);
  });
}

export function setSiteThemePromoBarVisibility(id, enabled, actorId) {
  return setSiteThemeElementVisibility(id, enabled, actorId, 'promo_bar_enabled');
}

export function setSiteThemeGoldGlintVisibility(id, enabled, actorId) {
  return setSiteThemeElementVisibility(id, enabled, actorId, 'gold_glint_enabled');
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
    SELECT theme.published_promo_bar, theme.gold_glint_enabled, connection.store_domain FROM site_themes theme
    JOIN search_horoshop_connections connection
      ON connection.id = theme.connection_id AND connection.generation = theme.connection_generation
    WHERE ${currentStoreCondition} AND theme.active = TRUE AND theme.promo_bar_enabled = TRUE
    LIMIT 1
  `);
  if (!theme || normalStoreHost(storefront.hostname) !== normalStoreHost(theme.store_domain)) return null;
  const config = withPromoBarStyleDefaults(theme.published_promo_bar);
  if (!config.showDesktop && !config.showMobile) return null;
  return { ...config, goldGlint: theme.gold_glint_enabled ? config.goldGlint : null };
}
