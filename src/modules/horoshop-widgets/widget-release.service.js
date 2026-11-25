import { createHash } from 'node:crypto';
import { env } from '../../config/env.js';
import { pool, query } from '../../db/pool.js';
import { AppError } from '../../lib/app-error.js';
import { loaderScript } from '../applications/public.routes.js';
import { formCampaignEmbedScript } from '../applications/form-campaign.service.js';
import { cartThemeCss, cartThemeEmbedScript } from '../horoshop-cart-theme/cart-theme.embed.js';
import { loadPublishedCartTheme } from '../horoshop-cart-theme/cart-theme.service.js';
import { catalogMenuCss, catalogMenuEmbedScript } from '../horoshop-catalog-menu/catalog-menu.embed.js';
import { loadPublishedCatalogMenu } from '../horoshop-catalog-menu/catalog-menu.service.js';
import { checkoutTelegramEmbedScript } from '../horoshop-checkout-telegram/checkout-telegram.embed.js';
import { loadPublishedCheckoutTelegram } from '../horoshop-checkout-telegram/checkout-telegram.service.js';
import { titleLabelsEmbedScript } from '../horoshop-title-labels/title-labels.embed.js';
import { loadPublishedTitleLabels } from '../horoshop-title-labels/title-labels.service.js';
import { popupEmbedScript } from '../popup-banners/popup-banner.service.js';
import { productPromoLoaderScript } from '../product-selections/product-selection.embed.js';
import { siteThemeEmbedScript } from '../site-themes/site-theme.embed.js';
import { supportWidgetEmbedScript } from '../support-chat/support-chat.service.js';
import { horoshopWidgetLoaderScript, loadHoroshopWidgetManifest } from './widget.service.js';

function assetRef(sha384, extension) {
  return {
    sha384,
    path: `/api/public/horoshop-widgets/assets/${sha384}.${extension}`,
    integrity: `sha384-${Buffer.from(sha384, 'hex').toString('base64')}`
  };
}

function serializeRelease(row) {
  const loader = assetRef(row.loader_sha384, 'js');
  return {
    id: row.id,
    buildSha: row.build_sha,
    storeDomain: row.store_domain,
    publishedAt: row.published_at,
    publisherName: row.publisher_name,
    embedCode: `<script async src="${row.workspace_origin}${loader.path}" integrity="${loader.integrity}" crossorigin="anonymous"></script>`
  };
}

export async function listHoroshopWidgetReleases() {
  const result = await query('SELECT * FROM horoshop_widget_releases ORDER BY published_at DESC, id DESC');
  return result.rows.map(serializeRelease);
}

export async function findHoroshopWidgetAsset(filename) {
  const parts = /^([a-f0-9]{96})\.(js|css)$/u.exec(filename);
  if (!parts) return null;
  const result = await query(
    'SELECT extension, body FROM horoshop_widget_assets WHERE sha384 = $1 AND extension = $2',
    [parts[1], parts[2]]
  );
  return result.rows[0] || null;
}

async function renderWidget(widget, origin, db, saveAsset) {
  const site = new URL(widget.path, origin).searchParams.get('site');
  switch (widget.id) {
    case 'popup-banners':
      return popupEmbedScript(origin);
    case 'product-promo':
      return productPromoLoaderScript(origin);
    case 'site-themes':
      return siteThemeEmbedScript();
    case 'support-chat':
      return supportWidgetEmbedScript(origin);
    case 'form-buttons':
      return formCampaignEmbedScript(origin, await saveAsset(loaderScript(), 'js'));
    case 'title-labels': {
      const config = await loadPublishedTitleLabels(site, db);
      return config && titleLabelsEmbedScript(config);
    }
    case 'checkout-telegram': {
      const config = await loadPublishedCheckoutTelegram(site, db);
      return config && checkoutTelegramEmbedScript(config);
    }
    case 'cart-theme': {
      const config = await loadPublishedCartTheme(site, db);
      if (!config) return null;
      const css = await saveAsset(cartThemeCss(config.themeId), 'css');
      return cartThemeEmbedScript(config.themeId, origin + css.path, css.integrity);
    }
    case 'catalog-menu': {
      const config = await loadPublishedCatalogMenu(site, db);
      if (!config) return null;
      const css = await saveAsset(catalogMenuCss(config.themeId), 'css');
      return catalogMenuEmbedScript(config.themeId, origin + css.path, config.defaultCategoryExternalId, css.integrity);
    }
    default:
      throw new Error(`Missing release generator for Horoshop widget ${widget.id}`);
  }
}

export async function publishHoroshopWidgetRelease(origin, user) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    const manifest = await loadHoroshopWidgetManifest(db);
    if (!manifest.storeDomain) {
      throw new AppError(409, 'HOROSHOP_STORE_REQUIRED', 'Спочатку підключіть магазин Хорошопа.');
    }

    async function saveAsset(body, extension) {
      const sha384 = createHash('sha384').update(body, 'utf8').digest('hex');
      await db.query(
        'INSERT INTO horoshop_widget_assets (sha384, extension, body) VALUES ($1, $2, $3) ON CONFLICT (sha384) DO NOTHING',
        [sha384, extension, body]
      );
      return assetRef(sha384, extension);
    }

    const widgets = [];
    for (const widget of manifest.widgets) {
      const body = await renderWidget(widget, origin, db, saveAsset);
      if (body) widgets.push({ ...widget, ...await saveAsset(body, 'js') });
    }
    const loader = await saveAsset(horoshopWidgetLoaderScript({ ...manifest, widgets }, origin), 'js');
    const { rows: [release] } = await db.query(
      `INSERT INTO horoshop_widget_releases (loader_sha384, workspace_origin, store_domain, build_sha, published_by, publisher_name)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [loader.sha384, origin, manifest.storeDomain, env.APP_BUILD_SHA, user.id, user.name]
    );
    await db.query('COMMIT');
    return serializeRelease(release);
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}
