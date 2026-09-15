import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { JSDOM } from 'jsdom';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.CHECKOUT_TELEGRAM_TEST_DATABASE_URL || 'pg-mem://checkout-telegram-tests';
process.env.JWT_SECRET = 'checkout-telegram-test-secret-0123456789';
process.env.COOKIE_SECURE = 'false';
process.env.APP_ORIGIN = 'https://mt-panel.example.com';
process.env.ADMIN_NAME = 'Checkout Telegram Admin';
process.env.ADMIN_EMAIL = 'checkout-telegram-admin@test.local';
process.env.ADMIN_PASSWORD = 'AdminPassword123!';

const { default: app } = await import('../src/app.js');
const { pool } = await import('../src/db/pool.js');
const { runMigrations } = await import('../src/db/migrate.js');
const { ensureBootstrapAdmin } = await import('../src/modules/users/user.service.js');
const { checkoutTelegramEmbedScript } = await import('../src/modules/horoshop-checkout-telegram/checkout-telegram.embed.js');

const admin = request.agent(app);
const config = {
  telegramUrl: 'https://t.me/mobiletrend_test_bot?start=order',
  buttonText: 'Написати в Telegram',
  buttonBackgroundColor: '#229ed9',
  buttonHoverBackgroundColor: '#168ac2',
  buttonTextColor: '#ffffff',
  buttonBorderColor: '#157cad',
  buttonBorderRadius: 14,
  buttonFontSize: 17,
  qrSize: 240
};

before(async () => {
  await runMigrations();
  await ensureBootstrapAdmin();
  await pool.query(`
    INSERT INTO search_horoshop_connections (store_domain, encrypted_credentials, last_sync_at)
    VALUES ('shop551651.horoshop.ua', 'encrypted-test-credentials', NOW())
  `);
  await admin.post('/api/auth/login').send({
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD
  }).expect(200);
});

after(async () => {
  await pool.end();
});

test('Telegram checkout settings validate, publish and serve a self-contained QR embed', async () => {
  await request(app).get('/api/horoshop-checkout-telegram/settings').expect(401);

  const initial = await admin.get('/api/horoshop-checkout-telegram/settings').expect(200);
  assert.equal(initial.body.data.enabled, false);
  assert.equal(initial.body.data.draftConfig.telegramUrl, '');
  assert.equal(initial.body.data.storeDomain, 'shop551651.horoshop.ua');
  assert.match(initial.body.data.embedCode, /horoshop-checkout-telegram\/embed\.js\?site=/u);

  const publicId = initial.body.data.publicId;
  const disabled = await request(app)
    .get('/api/public/horoshop-checkout-telegram/embed.js')
    .query({ site: publicId })
    .expect(200);
  assert.match(disabled.text, /disabled/u);

  await admin.post('/api/horoshop-checkout-telegram/settings/publish')
    .send({ ...config, telegramUrl: 'https://example.com/not-telegram' })
    .expect(422);

  const draft = await admin.put('/api/horoshop-checkout-telegram/settings/draft')
    .send(config)
    .expect(200);
  assert.equal(draft.body.data.draftConfig.buttonText, 'Написати в Telegram');
  assert.equal(draft.body.data.enabled, false);

  const published = await admin.post('/api/horoshop-checkout-telegram/settings/publish')
    .send(config)
    .expect(200);
  assert.equal(published.body.data.enabled, true);
  assert.equal(published.body.data.publishedVersion, 1);
  assert.equal(published.body.data.publishedConfig.telegramUrl, config.telegramUrl);

  const script = await request(app)
    .get('/api/public/horoshop-checkout-telegram/embed.js')
    .query({ site: publicId })
    .expect(200);
  assert.match(script.headers['content-type'], /javascript/u);
  assert.match(script.headers['cache-control'], /max-age=120/u);
  assert.match(script.text, /data:image\/png;base64,/u);
  assert.match(script.text, /section\.checkout\.__success/u);
  assert.match(script.text, /\.checkout-success/u);
  assert.match(script.text, /Написати в Telegram/u);
  assert.doesNotMatch(script.text, /fetch\(/u);
});

test('desktop adapter creates an isolated slot in the free area and preserves order content', () => {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>
    <section class="checkout __success">
      <h1 class="main-h">Ваше замовлення отримано</h1>
      <div class="checkout-main"><article id="order">Замовлення №299</article></div>
    </section>
  </body></html>`, { runScripts: 'outside-only', url: 'https://shop551651.horoshop.ua/checkout/complete/1415/' });
  const order = dom.window.document.getElementById('order');
  const root = dom.window.document.querySelector('section.checkout.__success');
  const main = root.querySelector(':scope > .checkout-main');
  root.getBoundingClientRect = () => ({ top: 100, right: 1600, bottom: 900, left: 160, width: 1440, height: 800, x: 160, y: 100, toJSON() {} });
  main.getBoundingClientRect = () => ({ top: 153, right: 1050, bottom: 850, left: 160, width: 890, height: 697, x: 160, y: 153, toJSON() {} });
  const originalOrder = order.outerHTML;
  const script = checkoutTelegramEmbedScript({ ...config, version: 1, qrCodeDataUrl: 'data:image/png;base64,dGVzdA==' });

  dom.window.eval(script);
  dom.window.eval(script);

  const slot = root.querySelector(':scope > .mt-checkout-telegram__desktop-slot');
  const card = slot?.querySelector('[data-mt-checkout-telegram="v1"]');
  assert.ok(slot);
  assert.ok(card);
  assert.equal(slot.style.top, '53px');
  assert.equal(slot.style.left, '890px');
  assert.equal(slot.style.width, '550px');
  assert.equal(card.getAttribute('data-mt-checkout-telegram-surface'), 'desktop');
  assert.equal(dom.window.document.querySelectorAll('[data-mt-checkout-telegram="v1"]').length, 1);
  assert.equal(card.querySelector('.mt-checkout-telegram__qr-link').href, config.telegramUrl);
  assert.equal(card.querySelector('.mt-checkout-telegram__button').href, config.telegramUrl);
  assert.equal(card.querySelector('.mt-checkout-telegram__button').textContent, config.buttonText);
  assert.equal(order.outerHTML, originalOrder);
  dom.window.close();
});

test('mobile adapter mounts after its independent success block and ignores other paths', () => {
  const mobile = new JSDOM(`<!doctype html><html><head></head><body>
    <main class="main wrapper"><section class="checkout-success">Ваше замовлення отримано</section><div class="order-details">Деталі</div></main>
  </body></html>`, { runScripts: 'outside-only', url: 'https://shop551651.horoshop.ua/checkout/complete/1416/' });
  const script = checkoutTelegramEmbedScript({ ...config, version: 1, qrCodeDataUrl: 'data:image/png;base64,dGVzdA==' });
  mobile.window.eval(script);

  const success = mobile.window.document.querySelector('.checkout-success');
  const card = mobile.window.document.querySelector('[data-mt-checkout-telegram="v1"]');
  assert.ok(card);
  assert.equal(card.previousElementSibling, success);
  assert.equal(card.getAttribute('data-mt-checkout-telegram-surface'), 'mobile');
  assert.equal(mobile.window.document.querySelector('.order-details').textContent, 'Деталі');
  mobile.window.close();

  const catalog = new JSDOM('<!doctype html><html><head></head><body><section class="checkout __success"><div class="checkout-aside"></div></section></body></html>', {
    runScripts: 'outside-only',
    url: 'https://shop551651.horoshop.ua/iphone/'
  });
  catalog.window.eval(script);
  assert.equal(catalog.window.document.querySelector('[data-mt-checkout-telegram="v1"]'), null);
  catalog.window.close();
});
