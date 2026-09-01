import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { JSDOM } from 'jsdom';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TITLE_LABELS_TEST_DATABASE_URL || 'pg-mem://title-labels-tests';
process.env.JWT_SECRET = 'title-labels-test-secret-0123456789';
process.env.COOKIE_SECURE = 'false';
process.env.APP_ORIGIN = 'https://mt-panel.example.com';
process.env.ADMIN_NAME = 'Title Labels Admin';
process.env.ADMIN_EMAIL = 'title-labels-admin@test.local';
process.env.ADMIN_PASSWORD = 'AdminPassword123!';

const { default: app } = await import('../src/app.js');
const { pool } = await import('../src/db/pool.js');
const { runMigrations } = await import('../src/db/migrate.js');
const { ensureBootstrapAdmin } = await import('../src/modules/users/user.service.js');
const { titleLabelsEmbedScript } = await import('../src/modules/horoshop-title-labels/title-labels.embed.js');
const { loadPublishedTitleLabels } = await import('../src/modules/horoshop-title-labels/title-labels.service.js');

const admin = request.agent(app);
const usedRule = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Вживана техніка',
  text: 'Вживаний',
  stickerKeys: ['id:used', 'id:used-premium'],
  backgroundColor: '#202020',
  textColor: '#ffe101',
  borderColor: '#202020',
  borderRadius: 4,
  enabled: true
};
const promoRule = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Акційна пропозиція',
  text: 'Акція',
  stickerKeys: ['id:sale'],
  backgroundColor: '#d92d20',
  textColor: '#ffffff',
  borderColor: '#d92d20',
  borderRadius: 6,
  enabled: true
};

before(async () => {
  await runMigrations();
  await ensureBootstrapAdmin();
  const connection = await pool.query(`
    INSERT INTO search_horoshop_connections (store_domain, encrypted_credentials, last_sync_at)
    VALUES ('shop.example.com', 'encrypted-test-credentials', NOW())
    RETURNING id, generation
  `);
  const { id, generation } = connection.rows[0];
  await pool.query(`
    INSERT INTO search_horoshop_products (
      connection_id, generation, external_id, sku, titles, canonical_url,
      visible, active, stickers, last_seen_sync_id
    ) VALUES
      ($1, $2, 'product-used', 'USED-1', '{"uk":"Вживаний смартфон"}'::JSONB,
       'https://shop.example.com/used-phone/', TRUE, TRUE,
       '[{"id":"used","title":"Вживаний"},{"id":"sale","title":"Акція"}]'::JSONB, $2),
      ($1, $2, 'product-sale', 'SALE-1', '{"uk":"Акційний смартфон"}'::JSONB,
       'https://shop.example.com/sale-phone/', TRUE, TRUE,
       '[{"id":"sale","title":"Акція"}]'::JSONB, $2)
  `, [id, generation]);
  await admin.post('/api/auth/login').send({
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD
  }).expect(200);
});

after(async () => {
  await pool.end();
});

test('constructor publishes ordered sticker rules and a current catalog URL map', async () => {
  await request(app).get('/api/horoshop-title-labels/settings').expect(401);

  const initial = await admin.get('/api/horoshop-title-labels/settings').expect(200);
  assert.equal(initial.body.data.enabled, false);
  assert.equal(initial.body.data.storeDomain, 'shop.example.com');
  assert.match(initial.body.data.embedCode, /<script async src=".*horoshop-title-labels\/embed\.js\?site=/u);
  assert.deepEqual(initial.body.data.stickerOptions.map((item) => item.title), ['Акція', 'Вживаний']);
  assert.equal(initial.body.data.stickerOptions.find((item) => item.key === 'id:sale').productCount, 2);

  const publicId = initial.body.data.publicId;
  const disabled = await request(app)
    .get('/api/public/horoshop-title-labels/embed.js')
    .query({ site: publicId })
    .expect(200);
  assert.match(disabled.text, /disabled/u);

  const draft = await admin.put('/api/horoshop-title-labels/settings/draft')
    .send({ rules: [usedRule, promoRule] })
    .expect(200);
  assert.equal(draft.body.data.draftRules[0].stickerKeys.length, 2);

  const published = await admin.post('/api/horoshop-title-labels/settings/publish')
    .send({ rules: [usedRule, promoRule] })
    .expect(200);
  assert.equal(published.body.data.enabled, true);
  assert.equal(published.body.data.publishedVersion, 1);

  const script = await request(app)
    .get('/api/public/horoshop-title-labels/embed.js')
    .query({ site: publicId })
    .expect(200);
  assert.match(script.headers['content-type'], /javascript/u);
  assert.match(script.headers['cache-control'], /max-age=120/u);
  assert.match(script.text, /h1\.product-title/u);
  assert.match(script.text, /h1\.heading\.heading--xl/u);
  assert.match(script.text, /\.cart-title/u);
  assert.match(script.text, /\.cart-item__link/u);
  assert.match(script.text, /used-phone/u);
  assert.match(script.text, /sale-phone/u);
  assert.match(script.text, /Вживаний/u);

  const config = await loadPublishedTitleLabels(publicId);
  assert.ok(config.assignments.find((group) => group.labelId === usedRule.id).paths.includes('/used-phone'));
  assert.ok(config.assignments.find((group) => group.labelId === promoRule.id).paths.includes('/used-phone'));
});

test('desktop adapter decorates product page, storefront card and cart without replacing native nodes', async () => {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>
    <h1 class="product-title" itemprop="name">Вживаний смартфон</h1>
    <article class="productsSlider-i">
      <a href="/sale-phone/"><span class="productsSlider-title"><span class="a-link">Акційний смартфон</span></span></a>
    </article>
    <section class="popup __cart"><table><tbody><tr class="cart-item j-cart-product">
      <td><a class="cart-image" href="/used-phone/">Фото</a></td>
      <td><a class="cart-title" href="/used-phone/">Вживаний смартфон</a></td>
    </tr></tbody></table></section>
  </body></html>`, { runScripts: 'outside-only', url: 'https://shop.example.com/used-phone/' });
  const cartLink = dom.window.document.querySelector('.cart-title');
  let clicks = 0;
  cartLink.addEventListener('click', (event) => { event.preventDefault(); clicks += 1; });

  dom.window.eval(titleLabelsEmbedScript({
    storeDomain: 'shop.example.com',
    version: 1,
    labels: [usedRule, promoRule],
    assignments: [
      { labelId: usedRule.id, paths: ['/used-phone'] },
      { labelId: promoRule.id, paths: ['/sale-phone', '/used-phone'] }
    ]
  }));

  assert.deepEqual(
    [...dom.window.document.querySelectorAll('h1.product-title [data-mt-title-label]')].map((node) => node.textContent),
    ['Вживаний', 'Акція']
  );
  assert.equal(dom.window.document.querySelector('.productsSlider-title [data-mt-title-label]')?.textContent, 'Акція');
  assert.equal(dom.window.document.querySelector('.cart-title [data-mt-title-label]')?.textContent, 'Вживаний');
  cartLink.click();
  assert.equal(clicks, 1);

  dom.window.eval(titleLabelsEmbedScript({
    storeDomain: 'shop.example.com', version: 2, labels: [usedRule],
    assignments: [{ labelId: usedRule.id, paths: ['/used-phone'] }]
  }));
  assert.equal(dom.window.document.querySelectorAll('.cart-title [data-mt-title-label]').length, 1);
  dom.window.close();
});

test('mobile adapter decorates its independent product, card and drawer contracts including AJAX content', async () => {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>
    <h1 class="heading heading--xl" itemprop="name">Вживаний смартфон</h1>
    <div class="catalog-card"><a class="catalog-card__link" href="/sale-phone/">
      <div class="catalog-card__title"><span class="link">Акційний смартфон</span></div>
    </a></div>
    <aside id="cart-drawer" class="cart"><div class="cart__item j-cart-product">
      <div class="cart-item__title"><a class="cart-item__link" href="/used-phone/">Вживаний смартфон</a></div>
    </div></aside>
  </body></html>`, { runScripts: 'outside-only', url: 'https://shop.example.com/used-phone/' });

  dom.window.eval(titleLabelsEmbedScript({
    storeDomain: 'shop.example.com',
    version: 1,
    labels: [usedRule, promoRule],
    assignments: [
      { labelId: usedRule.id, paths: ['/used-phone'] },
      { labelId: promoRule.id, paths: ['/sale-phone', '/used-phone'] }
    ]
  }));

  assert.deepEqual(
    [...dom.window.document.querySelectorAll('h1.heading--xl [data-mt-title-label]')].map((node) => node.textContent),
    ['Вживаний', 'Акція']
  );
  assert.equal(dom.window.document.querySelector('.catalog-card__title [data-mt-title-label]')?.textContent, 'Акція');
  assert.equal(dom.window.document.querySelector('.cart-item__link [data-mt-title-label]')?.textContent, 'Вживаний');

  const ajaxCard = dom.window.document.createElement('div');
  ajaxCard.className = 'catalog-card';
  ajaxCard.innerHTML = '<a class="catalog-card__link" href="/used-phone/"><div class="catalog-card__title"><span class="link">AJAX товар</span></div></a>';
  dom.window.document.body.appendChild(ajaxCard);
  await new Promise((resolve) => dom.window.setTimeout(resolve, 20));
  assert.equal(ajaxCard.querySelector('[data-mt-title-label]')?.textContent, 'Вживаний');
  dom.window.close();
});
