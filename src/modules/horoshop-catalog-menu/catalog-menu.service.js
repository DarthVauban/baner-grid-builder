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

function localizedTitle(value) {
  const titles = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const preferred = titles.uk || titles.ua || titles.ru || titles.en;
  if (typeof preferred === 'string' && preferred.trim()) return preferred.trim();
  return Object.values(titles).find((title) => typeof title === 'string' && title.trim())?.trim() || '';
}

function normalizedCategoryTitles(value) {
  const titles = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return Object.values(titles)
    .filter((title) => typeof title === 'string')
    .map((title) => title.trim().toLocaleLowerCase('uk-UA'));
}

function isHoroshopHomeContainer(category) {
  const homeTitles = new Set(['головна', 'главная', 'home']);
  return normalizedCategoryTitles(category.titles).some((title) => homeTitles.has(title));
}

export async function listCatalogMenuDefaultCategories() {
  const result = await query(
    `SELECT category.external_id, category.parent_external_id, category.titles
     FROM search_horoshop_connections AS connection
     INNER JOIN search_horoshop_categories AS category
       ON category.connection_id = connection.id
      AND category.generation = connection.generation
      AND category.active = TRUE
     WHERE connection.singleton = TRUE`
  );
  const categories = [...new Map(result.rows.map((row) => [row.external_id, row])).values()];
  const categoriesById = new Map(categories.map((category) => [category.external_id, category]));
  const parentIdsWithChildren = new Set(categories
    .map((category) => category.parent_external_id)
    .filter(Boolean));
  const structuralRoots = categories.filter((category) =>
    !category.parent_external_id || !categoriesById.has(category.parent_external_id));
  const homeContainerIds = new Set(structuralRoots
    .filter(isHoroshopHomeContainer)
    .map((category) => category.external_id));
  const menuRoots = homeContainerIds.size > 0
    ? categories.filter((category) => homeContainerIds.has(category.parent_external_id))
    : structuralRoots;

  return menuRoots
    .filter((category) => parentIdsWithChildren.has(category.external_id))
    .map((row) => ({ externalId: row.external_id, title: localizedTitle(row.titles) || row.external_id }))
    .sort((left, right) => left.title.localeCompare(right.title, 'uk-UA'));
}

async function assertDefaultCategory(defaultCategoryExternalId) {
  const categories = await listCatalogMenuDefaultCategories();
  if (!categories.length) {
    throw new AppError(
      409,
      'CATALOG_MENU_CATEGORIES_UNAVAILABLE',
      'Не знайдено кореневих розділів із підкатегоріями. Синхронізуйте каталог Хорошопа.'
    );
  }
  if (!categories.some((category) => category.externalId === defaultCategoryExternalId)) {
    throw new AppError(
      422,
      'CATALOG_MENU_DEFAULT_CATEGORY_INVALID',
      'Вибраний початковий розділ відсутній в актуальному каталозі Хорошопа.'
    );
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
    draftDefaultCategoryExternalId: row.draft_default_category_external_id || null,
    publishedDefaultCategoryExternalId: row.published_default_category_external_id || null,
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

export async function updateCatalogMenuDraft({ themeId, defaultCategoryExternalId }, userId, origin = '') {
  assertTheme(themeId);
  await assertDefaultCategory(defaultCategoryExternalId);
  await ensureSettings();
  await query(
    `UPDATE horoshop_catalog_menu_settings
     SET draft_theme_id = $1,
         draft_default_category_external_id = $2,
         updated_by = $3,
         updated_at = NOW()
     WHERE id = TRUE`,
    [themeId, defaultCategoryExternalId, userId]
  );
  return getCatalogMenuSettings(origin);
}

export async function publishCatalogMenu({ themeId, defaultCategoryExternalId }, userId, origin = '') {
  assertTheme(themeId);
  await assertDefaultCategory(defaultCategoryExternalId);
  await ensureSettings();
  await query(
    `UPDATE horoshop_catalog_menu_settings
     SET draft_theme_id = $1,
         published_theme_id = $1,
         draft_default_category_external_id = $2,
         published_default_category_external_id = $2,
         published_version = published_version + 1,
         enabled = TRUE,
         updated_by = $3,
         published_by = $3,
         updated_at = NOW(),
         published_at = NOW()
     WHERE id = TRUE`,
    [themeId, defaultCategoryExternalId, userId]
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
    `SELECT published_theme_id, published_default_category_external_id, published_version
     FROM horoshop_catalog_menu_settings
     WHERE public_id = $1 AND enabled = TRUE AND published_theme_id IS NOT NULL
     LIMIT 1`,
    [publicId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    themeId: row.published_theme_id,
    defaultCategoryExternalId: row.published_default_category_external_id || null,
    version: Number(row.published_version || 0)
  };
}

export function catalogMenuEmbedCode(origin, publicId) {
  return `<script async src="${origin}/api/public/horoshop-catalog-menu/embed.js?site=${encodeURIComponent(publicId)}"></script>`;
}

export { catalogMenuEmbedScript };
