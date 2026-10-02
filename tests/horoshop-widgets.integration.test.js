import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { JSDOM } from 'jsdom';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.HOROSHOP_WIDGETS_TEST_DATABASE_URL || 'pg-mem://horoshop-widgets-tests';
process.env.JWT_SECRET = 'horoshop-widgets-test-secret-0123456789';
process.env.APP_ORIGIN = 'https://mt-panel.example.com';

const { default: app } = await import('../src/app.js');
const { pool } = await import('../src/db/pool.js');
const { runMigrations } = await import('../src/db/migrate.js');

before(async () => {
  await runMigrations();
});

after(async () => {
  await pool.end();
});

function browser(url, script, mobile = false) {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    runScripts: 'outside-only', url
  });
  if (mobile) {
    Object.defineProperty(dom.window.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
      configurable: true
    });
    Object.defineProperty(dom.window, 'innerWidth', { value: 390, configurable: true });
  }
  dom.window.eval(script);
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
  return dom;
}

test('one installed script loads only enabled, published widgets for the connected Horoshop host', async () => {
  const disconnected = await request(app).get('/api/public/horoshop-widgets/embed.js').expect(200);
  assert.match(disconnected.headers['content-type'], /javascript/u);
  assert.match(disconnected.headers['cache-control'], /max-age=60/u);
  assert.doesNotMatch(disconnected.text, /popup-banners\/embed\.js/u);

  await pool.query(`
    INSERT INTO search_horoshop_connections (store_domain, encrypted_credentials)
    VALUES ('shop.example.com', 'encrypted-test-credentials')
  `);
  await pool.query('UPDATE horoshop_title_label_settings SET enabled = TRUE, published_version = 2');
  await pool.query('UPDATE horoshop_cart_theme_settings SET enabled = TRUE, published_version = 3');
  await pool.query('UPDATE horoshop_catalog_menu_settings SET enabled = TRUE, published_version = 4');
  await pool.query('UPDATE horoshop_checkout_telegram_settings SET enabled = TRUE, published_version = 5');

  const response = await request(app)
    .get('/api/public/horoshop-widgets/embed.js')
    .set('Origin', 'https://shop.example.com')
    .expect(200);
  assert.equal(response.headers['access-control-allow-origin'], '*');
  for (const path of [
    'popup-banners/embed.js', 'horoshop-title-labels/embed.js',
    'horoshop-cart-theme/embed.js', 'horoshop-catalog-menu/embed.js',
    'horoshop-checkout-telegram/embed.js', 'support-chat/embed.js',
    'product-selections/promo-loader.js'
  ]) assert.match(response.text, new RegExp(path.replace('.', '\\.')));
  assert.doesNotMatch(response.text, /encrypted-test-credentials/u);
  assert.doesNotMatch(response.text, /store-map\/embed\.js|application-form-campaigns\/embed\.js/u);

  const dom = browser('https://shop.example.com/product/', response.text);
  const scripts = [...dom.window.document.querySelectorAll('script[src]')];
  assert.equal(scripts.length, 6);
  assert.ok(scripts.every((script) => script.src.startsWith('https://mt-panel.example.com/api/public/')));
  assert.ok(scripts.some((script) => script.dataset.mtHoroshopWidget === 'support-chat' && script.dataset.site));
  assert.equal(scripts.some((script) => script.dataset.mtHoroshopWidget === 'product-promo'), false);
  dom.window.eval(response.text);
  assert.equal(dom.window.document.querySelectorAll('script[src]').length, 6);
  dom.window.close();

  const mobile = browser('https://shop.example.com/product/', response.text, true);
  assert.match(mobile.window.navigator.userAgent, /Mobile/u);
  assert.equal(mobile.window.innerWidth, 390);
  assert.equal(mobile.window.document.querySelectorAll('script[src]').length, 6);
  mobile.window.close();

  const promo = browser('https://shop.example.com/phone/?mt_promo=11111111-1111-4111-8111-111111111111', response.text);
  assert.ok(promo.window.document.querySelector('script[data-mt-product-promo-loader="true"]'));
  promo.window.close();

  const foreign = browser('https://another-shop.example.com/product/', response.text);
  assert.equal(foreign.window.document.querySelectorAll('script[src]').length, 0);
  foreign.window.close();
});

test('online support respects its allowed storefront origins', async () => {
  await pool.query("UPDATE support_chat_sites SET allowed_origins = '[\"https://other.example.com\"]'::jsonb");
  const blocked = await request(app).get('/api/public/horoshop-widgets/embed.js').expect(200);
  const blockedDom = browser('https://shop.example.com/', blocked.text);
  assert.equal(blockedDom.window.document.querySelector('[data-mt-horoshop-widget="support-chat"]'), null);
  blockedDom.window.close();

  await pool.query("UPDATE support_chat_sites SET allowed_origins = '[\"https://shop.example.com\"]'::jsonb");
  const allowed = await request(app).get('/api/public/horoshop-widgets/embed.js').expect(200);
  const allowedDom = browser('https://shop.example.com/', allowed.text);
  assert.ok(allowedDom.window.document.querySelector('[data-mt-horoshop-widget="support-chat"]'));
  allowedDom.window.close();
});

test('the loader skips an already installed legacy widget and follows publication switches', async () => {
  await pool.query('UPDATE horoshop_catalog_menu_settings SET enabled = FALSE');
  const response = await request(app).get('/api/public/horoshop-widgets/embed.js').expect(200);
  assert.doesNotMatch(response.text, /horoshop-catalog-menu\/embed\.js/u);

  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    runScripts: 'outside-only', url: 'https://shop.example.com/'
  });
  const labels = await pool.query('SELECT public_id FROM horoshop_title_label_settings WHERE id = TRUE');
  const legacy = dom.window.document.createElement('script');
  legacy.src = `https://mt-panel.example.com/api/public/horoshop-title-labels/embed.js?site=${labels.rows[0].public_id}`;
  dom.window.document.head.appendChild(legacy);
  dom.window.eval(response.text);
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
  const paths = [...dom.window.document.querySelectorAll('script[src]')]
    .map((script) => new URL(script.src).pathname);
  assert.equal(paths.filter((path) => path.endsWith('/horoshop-title-labels/embed.js')).length, 1);
  assert.equal(paths.some((path) => path.endsWith('/horoshop-catalog-menu/embed.js')), false);
  dom.window.close();
});
