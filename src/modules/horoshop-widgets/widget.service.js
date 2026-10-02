import { query } from '../../db/pool.js';

export const horoshopWidgetEmbedPath = '/api/public/horoshop-widgets/embed.js';

export function horoshopWidgetEmbedCode(origin) {
  return `<script async src="${origin}${horoshopWidgetEmbedPath}"></script>`;
}

const publishedWidgets = [
  {
    id: 'title-labels',
    table: 'horoshop_title_label_settings',
    path: '/api/public/horoshop-title-labels/embed.js'
  },
  {
    id: 'cart-theme',
    table: 'horoshop_cart_theme_settings',
    path: '/api/public/horoshop-cart-theme/embed.js'
  },
  {
    id: 'catalog-menu',
    table: 'horoshop_catalog_menu_settings',
    path: '/api/public/horoshop-catalog-menu/embed.js'
  },
  {
    id: 'checkout-telegram',
    table: 'horoshop_checkout_telegram_settings',
    path: '/api/public/horoshop-checkout-telegram/embed.js'
  }
];

export async function loadHoroshopWidgetManifest() {
  const connection = await query(
    `SELECT id, generation, store_domain
     FROM search_horoshop_connections
     WHERE singleton = TRUE AND status IN ('connected', 'syncing', 'error')
     LIMIT 1`
  );
  const current = connection.rows[0];
  const storeDomain = current?.store_domain || '';
  if (!storeDomain) return { storeDomain: '', widgets: [] };

  const [settings, supportSites, formCampaigns] = await Promise.all([
    Promise.all(publishedWidgets.map(({ table }) => query(
    `SELECT public_id, published_version
     FROM ${table}
     WHERE id = TRUE AND enabled = TRUE AND published_version > 0
     LIMIT 1`
    ))),
    query('SELECT public_id, allowed_origins FROM support_chat_sites WHERE enabled = TRUE ORDER BY created_at'),
    query(`SELECT id FROM application_form_campaigns
           WHERE connection_id = $1 AND connection_generation = $2
             AND status = 'active' AND archived_at IS NULL
           LIMIT 1`, [current.id, current.generation])
  ]);
  const widgets = [
    { id: 'popup-banners', path: '/api/public/popup-banners/embed.js' },
    { id: 'product-promo', path: '/api/public/product-selections/promo-loader.js', when: 'promo-token' }
  ];
  publishedWidgets.forEach((widget, index) => {
    const row = settings[index].rows[0];
    if (!row) return;
    widgets.push({
      id: widget.id,
      path: `${widget.path}?site=${encodeURIComponent(row.public_id)}&v=${Number(row.published_version)}`
    });
  });
  if (formCampaigns.rows.length) {
    widgets.push({ id: 'form-buttons', path: '/api/public/application-form-campaigns/embed.js' });
  }
  if (supportSites.rows.length) {
    widgets.push({
      id: 'support-chat',
      path: '/api/public/support-chat/embed.js',
      sites: supportSites.rows.map((row) => ({
        publicId: row.public_id,
        allowedOrigins: Array.isArray(row.allowed_origins) ? row.allowed_origins : []
      }))
    });
  }
  return { storeDomain, widgets };
}

export function horoshopWidgetLoaderScript({ storeDomain, widgets }, origin) {
  const config = JSON.stringify({ storeDomain, widgets, origin }).replaceAll('<', '\\u003c');
  return `(() => {
  'use strict';
  const config = ${config};
  const normalizeHost = (host) => String(host || '').toLowerCase().replace(/^www\\./u, '');
  if (!config.storeDomain || normalizeHost(location.hostname) !== normalizeHost(config.storeDomain)) return;
  if (window.__mtHoroshopWidgetsV1) return;
  window.__mtHoroshopWidgetsV1 = true;
  const install = () => {
    for (const widget of config.widgets) {
      if (widget.when === 'promo-token' && !new URLSearchParams(location.search).has('mt_promo')) continue;
      let site = '';
      if (widget.sites) {
        const exact = widget.sites.find((candidate) => candidate.allowedOrigins.includes(location.origin));
        const unrestricted = widget.sites.filter((candidate) => candidate.allowedOrigins.length === 0);
        site = (exact || (unrestricted.length === 1 ? unrestricted[0] : null))?.publicId || '';
        if (!site) continue;
      }
      const url = new URL(widget.path, config.origin);
      const alreadyInstalled = Array.from(document.querySelectorAll('script[src]')).some((script) => {
        try {
          const existing = new URL(script.src, location.href);
          return existing.origin === url.origin && existing.pathname === url.pathname
            && (widget.id === 'support-chat' || existing.searchParams.get('site') === url.searchParams.get('site'));
        } catch { return false; }
      });
      if (alreadyInstalled) continue;
      const script = document.createElement('script');
      script.async = true;
      script.src = url.href;
      script.dataset.mtHoroshopWidget = widget.id;
      if (site) script.dataset.site = site;
      if (widget.id === 'product-promo') script.dataset.mtProductPromoLoader = 'true';
      (document.head || document.documentElement).appendChild(script);
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();`;
}
