import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

export const popupBase = 'http://localhost:4176';
export async function startPopupServer() {
  Object.assign(process.env, { NODE_ENV: 'test', DATABASE_URL: 'pg-mem://popup-block-e2e-' + process.pid, APP_ORIGIN: popupBase, PORT: '4176', COOKIE_SECURE: 'false', JWT_SECRET: 'popup-block-e2e-secret-with-more-than-32-chars', ADMIN_EMAIL: 'popup-live@test.local', ADMIN_NAME: 'Popup Live', ADMIN_PASSWORD: 'Popup-live-password-2026' });
  const [{ default: app }, { pool }, { runMigrations }, { ensureBootstrapAdmin }] = await Promise.all([import('../../../src/app.js'), import('../../../src/db/pool.js'), import('../../../src/db/migrate.js'), import('../../../src/modules/users/user.service.js')]);
  await runMigrations(); await ensureBootstrapAdmin();
  const id = randomUUID(), generation = randomUUID();
  await pool.query("INSERT INTO search_horoshop_connections (id, generation, store_domain, encrypted_credentials, status) VALUES ($1, $2, 'localhost', 'test-only', 'connected')", [id, generation]);
  await pool.query(`INSERT INTO search_horoshop_products (id, connection_id, generation, external_id, sku, titles, price, old_price, currency, availability, visible, active, primary_image_url, canonical_url, source_data, last_seen_sync_id)
    VALUES ($1, $2, $3, 'phone-live', 'PHONE-LIVE', $4::JSONB, '19999', '21999', 'UAH', 'В наявності', TRUE, TRUE, $5, $6, $7::JSONB, $8)`, [randomUUID(), id, generation, JSON.stringify({ uk: 'Смартфон із живого каталогу' }), popupBase + '/popup-test-image.svg', popupBase + '/popup-test-product', JSON.stringify({ id: 9001 }), randomUUID()]);
  await pool.query(`INSERT INTO search_horoshop_categories (id, connection_id, generation, external_id, titles, active, last_seen_sync_id) VALUES ($1,$2,$3,'phones',$4::JSONB,TRUE,$5)`, [randomUUID(), id, generation, JSON.stringify({ uk: 'Смартфони' }), randomUUID()]);
  await pool.query("UPDATE search_horoshop_products SET category_external_id = 'phones', brand = 'Apple'");
  for (const [external, sku, title, stock, price, buyId, path] of [
    ['phone-missing', 'PHONE-MISSING', 'Відсутній смартфон', 'Немає в наявності', '21000', 9000, '/popup-test-store-missing'],
    ['phone-alternative', 'PHONE-ALTERNATIVE', 'Інша доступна модель', 'В наявності', '22000', 9002, '/popup-test-alternative']
  ]) await pool.query(`INSERT INTO search_horoshop_products (id, connection_id, generation, external_id, sku, titles, brand, category_external_id, price, currency, availability, visible, active, primary_image_url, canonical_url, source_data, last_seen_sync_id) VALUES ($1,$2,$3,$4,$5,$6::JSONB,'Apple','phones',$7,'UAH',$8,TRUE,TRUE,$9,$10,$11::JSONB,$12)`, [randomUUID(), id, generation, external, sku, JSON.stringify({ uk: title }), price, stock, popupBase + '/popup-test-image.svg', popupBase + path, JSON.stringify({ id: buyId }), randomUUID()]);
  const server = createServer((req, res) => {
    if (req.url?.startsWith('/popup-test-image.svg')) { res.setHeader('Content-Type', 'image/svg+xml'); res.end('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="160"><rect x="15" y="5" width="90" height="150" rx="15" fill="#6956bd"/></svg>'); return; }
    if (req.url?.startsWith('/popup-test-store')) {
      const mobile = /iPhone|Android/.test(String(req.headers['user-agent']));
      const nativeCard = mobile ? '<div class="j-product-container"><a href="/popup-test-product">Товар</a><button class="j-buy-button-add" id="j-buy-button-widget-9001" data-quantity="1" onclick="window.cartItems[9001]={quantity:1}">Купити на Mobile</button></div><div id="cart-drawer"></div>' : '<article class="catalogCard-box"><a href="/popup-test-product">Товар</a><button class="j-buy-button-add" id="j-buy-button-widget-9001" data-quantity="1" onclick="window.cartItems[9001]={quantity:1}">Купити на Desktop</button></article><div class="popup __cart" style="display:none"></div>';
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      const context = req.url.includes('missing') ? '<meta itemprop="sku" content="PHONE-MISSING">' + (mobile ? '<span data-product-availability>Немає в наявності</span>' : '<span class="product-header__availability product-header__availability--out-of-stock">Немає в наявності</span>') : '';
      res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><h1>Магазин</h1>' + context + nativeCard + '<script>window.cartItems={};window.AjaxCart={getInstance:()=>({getProductById:id=>window.cartItems[id],appendProduct:p=>{window.cartItems[p.id]={quantity:p.quantity}}})};</script><script src="/api/public/popup-banners/embed.js"></script></body></html>'); return;
    }
    app(req, res);
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(4176, resolve); });
  return async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); await pool.end(); };
}
