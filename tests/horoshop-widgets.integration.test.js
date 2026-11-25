import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { JSDOM } from 'jsdom';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.HOROSHOP_WIDGETS_TEST_DATABASE_URL || 'pg-mem://horoshop-widgets-tests';
process.env.JWT_SECRET = 'horoshop-widgets-test-secret-0123456789';
process.env.APP_ORIGIN = 'https://mt-panel.example.com';

const { default: app } = await import('../src/app.js');
const { pool } = await import('../src/db/pool.js');
const { runMigrations } = await import('../src/db/migrate.js');
const { createAccessToken } = await import('../src/lib/jwt.js');

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

async function releaseActor(role, email, withTwoFactor) {
  const { rows: [user] } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, status, two_factor_enabled, two_factor_confirmed_at)
     VALUES ('Видавець', $1, 'fixture', $2, 'approved', $3, $4)
     RETURNING id, role`,
    [email, role, withTwoFactor, withTwoFactor ? new Date('2025-01-01T00:00:00Z') : null]
  );
  return `Bearer ${createAccessToken(user)}`;
}

function integrity(body) {
  return `sha384-${createHash('sha384').update(body).digest('base64')}`;
}

test('only an authenticated admin with 2FA can publish immutable assets and retrieve an earlier release', async () => {
  const releases = '/api/horoshop-widgets/releases';
  await request(app).get(releases).expect(401);
  await request(app).post(releases).expect(401);
  const editor = await releaseActor('editor', 'release-editor@example.test', true);
  await request(app).post(releases).set('Authorization', editor).expect(403);
  const noMfa = await releaseActor('admin', 'release-basic@example.test', false);
  await request(app).post(releases).set('Authorization', noMfa).expect(403);
  const publisher = await releaseActor('admin', 'release-admin@example.test', true);
  await request(app).post(releases).set('Authorization', publisher).set('Origin', 'https://foreign.example').expect(403);

  await pool.query("UPDATE horoshop_cart_theme_settings SET published_theme_id = 'balanced-upsell'");
  const { rows: [form] } = await pool.query(
    "INSERT INTO application_forms (name, title, status) VALUES ('Форма', 'Форма', 'published') RETURNING id"
  );
  const { rows: [connection] } = await pool.query('SELECT id, generation FROM search_horoshop_connections WHERE singleton = TRUE');
  await pool.query(
    `INSERT INTO application_form_campaigns (form_id, connection_id, connection_generation, name, status)
     VALUES ($1, $2, $3, 'Кампанія', 'active')`,
    [form.id, connection.id, connection.generation]
  );
  const response = await request(app).post(releases).set('Authorization', publisher).expect(201);
  const first = response.body.data;
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(first.publisherName, 'Видавець');
  assert.equal(first.storeDomain, 'shop.example.com');
  const installer = /src="([^"]+)" integrity="([^"]+)" crossorigin="anonymous"/u.exec(first.embedCode);
  assert.ok(installer);
  const path = new URL(installer[1]).pathname;
  const loader = await request(app).get(path).set('Origin', 'https://shop.example.com').expect(200);
  assert.equal(loader.headers['access-control-allow-origin'], '*');
  assert.equal(loader.headers['cache-control'], 'public, max-age=31536000, immutable');
  assert.equal(integrity(loader.text), installer[2]);
  assert.doesNotMatch(loader.text, /encrypted-test-credentials/u);

  let cart;
  let campaign;
  for (const mobile of [false, true]) {
    const dom = browser('https://shop.example.com/product/', loader.text, mobile);
    const scripts = [...dom.window.document.querySelectorAll('script[data-mt-horoshop-widget]')];
    assert.ok(scripts.length > 1);
    for (const script of scripts) {
      assert.match(script.src, /\/horoshop-widgets\/assets\/[a-f0-9]{96}\.js$/u);
      assert.equal(script.crossOrigin, 'anonymous');
      const asset = await request(app).get(new URL(script.src).pathname).expect(200);
      assert.equal(script.integrity, integrity(asset.text));
      if (script.dataset.mtHoroshopWidget === 'cart-theme') cart = asset.text;
      if (script.dataset.mtHoroshopWidget === 'form-buttons') campaign = asset.text;
    }
    dom.window.close();
  }
  assert.ok(cart);
  const css = /const stylesheetUrl = "(https:[^"]+\.css)";\s*const stylesheetIntegrity = "([^"]+)"/u.exec(cart);
  assert.ok(css);
  const stylesheet = await request(app).get(new URL(css[1]).pathname).expect('Content-Type', /text\/css/u).expect(200);
  assert.equal(integrity(stylesheet.text), css[2]);
  const formLoader = JSON.parse(/const formLoaderAsset = (\{[^}]+\});/u.exec(campaign)?.[1] || 'null');
  assert.ok(formLoader);
  const formScript = await request(app).get(formLoader.path).expect(200);
  assert.equal(integrity(formScript.text), formLoader.integrity);
  const badPath = path.replace(/[a-f0-9]{96}/u, '0'.repeat(96));
  await request(app).get(badPath).expect(404);

  await pool.query('UPDATE horoshop_cart_theme_settings SET enabled = FALSE');
  const next = await request(app).post(releases).set('Authorization', publisher).expect(201);
  assert.notEqual(next.body.data.embedCode, first.embedCode);
  assert.equal((await request(app).get(path).expect(200)).text, loader.text);
  const history = await request(app).get(releases).set('Authorization', editor).expect(200);
  assert.equal(history.body.data.canPublish, false);
  assert.ok(history.body.data.releases.some((release) => release.id === first.id && release.embedCode === first.embedCode));
});
