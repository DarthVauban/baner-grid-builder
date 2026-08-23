import { query } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import { catalogMenuEmbedScript } from './catalog-menu.embed.js';

export const horoshopCatalogMenuToolId = 'horoshop_catalog_menu';
export const catalogMenuThemeIds = ['compact-columns', 'flat-directory', 'grouped-sections'];

export const catalogMenuThemes = [
  {
    id: 'compact-columns',
    name: 'Компактні колонки',
    description: 'Щільний список категорій зліва та чотири читабельні колонки праворуч.',
    recommended: true
  },
  {
    id: 'flat-directory',
    name: 'Плоский довідник',
    description: 'Більше повітря, три широкі колонки й мінімум декоративних елементів.',
    recommended: false
  },
  {
    id: 'grouped-sections',
    name: 'Груповані секції',
    description: 'Підкатегорії зібрані у світлі секції для складних і різнорідних каталогів.',
    recommended: false
  }
];

function assertTheme(themeId) {
  if (!catalogMenuThemeIds.includes(themeId)) {
    throw new AppError(422, 'CATALOG_MENU_THEME_INVALID', 'Невідомий варіант оформлення каталогу.');
  }
}

async function ensureSettings() {
  await query(
    `INSERT INTO horoshop_catalog_menu_settings (id)
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
    embedCode: origin ? catalogMenuEmbedCode(origin, row.public_id) : ''
  };
}

async function loadSettingsRow() {
  await ensureSettings();
  const result = await query(
    `SELECT settings.*,
            connection.store_domain
     FROM horoshop_catalog_menu_settings AS settings
     LEFT JOIN search_horoshop_connections AS connection ON connection.singleton = TRUE
     WHERE settings.id = TRUE
     LIMIT 1`
  );
  return result.rows[0];
}

export async function getCatalogMenuSettings(origin = '') {
  return serializeSettings(await loadSettingsRow(), origin);
}

export async function updateCatalogMenuDraft(themeId, userId, origin = '') {
  assertTheme(themeId);
  await ensureSettings();
  await query(
    `UPDATE horoshop_catalog_menu_settings
     SET draft_theme_id = $1, updated_by = $2, updated_at = NOW()
     WHERE id = TRUE`,
    [themeId, userId]
  );
  return getCatalogMenuSettings(origin);
}

export async function publishCatalogMenu(themeId, userId, origin = '') {
  assertTheme(themeId);
  await ensureSettings();
  await query(
    `UPDATE horoshop_catalog_menu_settings
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
  return getCatalogMenuSettings(origin);
}

export async function setCatalogMenuEnabled(enabled, userId, origin = '') {
  await ensureSettings();
  const result = await query(
    `UPDATE horoshop_catalog_menu_settings
     SET enabled = $1, updated_by = $2, updated_at = NOW()
     WHERE id = TRUE AND ($1 = FALSE OR published_theme_id IS NOT NULL)
     RETURNING id`,
    [enabled, userId]
  );
  if (!result.rows[0]) {
    throw new AppError(409, 'CATALOG_MENU_NOT_PUBLISHED', 'Спочатку опублікуйте один із варіантів оформлення.');
  }
  return getCatalogMenuSettings(origin);
}

export async function loadPublishedCatalogMenu(publicId) {
  const result = await query(
    `SELECT published_theme_id, published_version
     FROM horoshop_catalog_menu_settings
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

export function catalogMenuEmbedCode(origin, publicId) {
  return `<script async src="${origin}/api/public/horoshop-catalog-menu/embed.js?site=${encodeURIComponent(publicId)}"></script>`;
}

export { catalogMenuEmbedScript };
