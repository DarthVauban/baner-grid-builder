import { query } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import { cartThemeEmbedScript } from './cart-theme.embed.js';

export const horoshopCartThemeToolId = 'horoshop_cart_theme';
export const cartThemeIds = ['balanced-upsell', 'accessory-showcase', 'compact-wide'];

export const cartThemes = [
  {
    id: 'balanced-upsell',
    name: 'Збалансований допродаж',
    description: 'Широкий кошик, компактні товарні рядки та чотири великі картки рекомендацій.',
    recommended: true
  },
  {
    id: 'accessory-showcase',
    name: 'Вітрина аксесуарів',
    description: 'Найбільші фото й картки для максимально помітного блоку супутніх товарів.',
    recommended: false
  },
  {
    id: 'compact-wide',
    name: 'Компактний широкий',
    description: 'Помірна ширина кошика та збільшені рекомендації для невеликих ноутбуків.',
    recommended: false
  }
];

function assertTheme(themeId) {
  if (!cartThemeIds.includes(themeId)) {
    throw new AppError(422, 'CART_THEME_INVALID', 'Невідомий варіант оформлення кошика.');
  }
}

async function ensureSettings() {
  await query(
    `INSERT INTO horoshop_cart_theme_settings (id)
     VALUES (TRUE)
     ON CONFLICT (id) DO NOTHING`
  );
}

function serializeSettings(row, origin = '') {
  return {
    publicId: row.public_id,
    enabled: row.enabled === true,
    draftThemeId: row.draft_theme_id,
    publishedThemeId: row.published_theme_id || null,
    publishedVersion: Number(row.published_version || 0),
    storeDomain: row.store_domain || '',
    updatedAt: row.updated_at,
    publishedAt: row.published_at || null,
    embedCode: origin ? cartThemeEmbedCode(origin, row.public_id) : ''
  };
}

async function loadSettingsRow() {
  await ensureSettings();
  const result = await query(
    `SELECT settings.*,
            connection.store_domain
     FROM horoshop_cart_theme_settings AS settings
     LEFT JOIN search_horoshop_connections AS connection ON connection.singleton = TRUE
     WHERE settings.id = TRUE
     LIMIT 1`
  );
  return result.rows[0];
}

export async function getCartThemeSettings(origin = '') {
  return serializeSettings(await loadSettingsRow(), origin);
}

export async function updateCartThemeDraft({ themeId }, userId, origin = '') {
  assertTheme(themeId);
  await ensureSettings();
  await query(
    `UPDATE horoshop_cart_theme_settings
     SET draft_theme_id = $1,
         updated_by = $2,
         updated_at = NOW()
     WHERE id = TRUE`,
    [themeId, userId]
  );
  return getCartThemeSettings(origin);
}

export async function publishCartTheme({ themeId }, userId, origin = '') {
  assertTheme(themeId);
  await ensureSettings();
  await query(
    `UPDATE horoshop_cart_theme_settings
     SET draft_theme_id = $1,
         published_theme_id = $1,
         published_version = published_version + 1,
         enabled = TRUE,
         updated_by = $2,
         published_by = $2,
         updated_at = NOW(),
         published_at = NOW()
     WHERE id = TRUE`,
    [themeId, userId]
  );
  return getCartThemeSettings(origin);
}

export async function setCartThemeEnabled(enabled, userId, origin = '') {
  await ensureSettings();
  const result = await query(
    `UPDATE horoshop_cart_theme_settings
     SET enabled = $1, updated_by = $2, updated_at = NOW()
     WHERE id = TRUE AND ($1 = FALSE OR published_theme_id IS NOT NULL)
     RETURNING id`,
    [enabled, userId]
  );
  if (!result.rows[0]) {
    throw new AppError(409, 'CART_THEME_NOT_PUBLISHED', 'Спочатку опублікуйте один із варіантів оформлення.');
  }
  return getCartThemeSettings(origin);
}

export async function loadPublishedCartTheme(publicId) {
  const result = await query(
    `SELECT published_theme_id, published_version
     FROM horoshop_cart_theme_settings
     WHERE public_id = $1 AND enabled = TRUE AND published_theme_id IS NOT NULL
     LIMIT 1`,
    [publicId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    themeId: row.published_theme_id,
    version: Number(row.published_version || 0)
  };
}

export function cartThemeEmbedCode(origin, publicId) {
  return `<script async src="${origin}/api/public/horoshop-cart-theme/embed.js?site=${encodeURIComponent(publicId)}"></script>`;
}

export { cartThemeEmbedScript };
