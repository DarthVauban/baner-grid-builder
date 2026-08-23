import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { JSDOM } from 'jsdom';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.CATALOG_MENU_TEST_DATABASE_URL || 'pg-mem://catalog-menu-tests';
process.env.JWT_SECRET = 'catalog-menu-test-secret-0123456789';
process.env.COOKIE_SECURE = 'false';
process.env.APP_ORIGIN = 'https://mt-panel.example.com';
process.env.ADMIN_NAME = 'Catalog Menu Admin';
process.env.ADMIN_EMAIL = 'catalog-menu-admin@test.local';
process.env.ADMIN_PASSWORD = 'AdminPassword123!';

const { default: app } = await import('../src/app.js');
const { pool } = await import('../src/db/pool.js');
const { runMigrations } = await import('../src/db/migrate.js');
const { ensureBootstrapAdmin } = await import('../src/modules/users/user.service.js');
const { catalogMenuEmbedScript } = await import('../src/modules/horoshop-catalog-menu/catalog-menu.embed.js');

const admin = request.agent(app);

before(async () => {
  await runMigrations();
  await ensureBootstrapAdmin();
  await admin.post('/api/auth/login').send({
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD
  }).expect(200);
});

after(async () => {
  await pool.end();
});

test('catalog menu settings publish a selected visual without exposing catalog data', async () => {
  await request(app).get('/api/horoshop-catalog-menu/settings').expect(401);

  const initial = await admin.get('/api/horoshop-catalog-menu/settings').expect(200);
  assert.equal(initial.body.data.settings.enabled, false);
  assert.equal(initial.body.data.settings.draftThemeId, 'compact-columns');
  assert.equal(initial.body.data.settings.publishedThemeId, null);
  assert.deepEqual(
    initial.body.data.themes.map((theme) => theme.id),
    ['compact-columns', 'flat-directory', 'grouped-sections']
  );
  assert.match(initial.body.data.settings.embedCode, /horoshop-catalog-menu\/embed\.js\?site=/u);

  const publicId = initial.body.data.settings.publicId;
  const disabledScript = await request(app)
    .get('/api/public/horoshop-catalog-menu/embed.js')
    .query({ site: publicId })
    .expect(200);
  assert.match(disabledScript.text, /disabled/u);

  await admin.put('/api/horoshop-catalog-menu/settings/draft')
    .send({ themeId: 'unknown-theme' })
    .expect(422);

  const draft = await admin.put('/api/horoshop-catalog-menu/settings/draft')
    .send({ themeId: 'grouped-sections' })
    .expect(200);
  assert.equal(draft.body.data.draftThemeId, 'grouped-sections');
  assert.equal(draft.body.data.enabled, false);

  const published = await admin.post('/api/horoshop-catalog-menu/settings/publish')
    .send({ themeId: 'grouped-sections' })
    .expect(200);
  assert.equal(published.body.data.publishedThemeId, 'grouped-sections');
  assert.equal(published.body.data.publishedVersion, 1);
  assert.equal(published.body.data.enabled, true);

  const script = await request(app)
    .get('/api/public/horoshop-catalog-menu/embed.js')
    .query({ site: publicId })
    .expect(200);
  assert.match(script.headers['content-type'], /javascript/u);
  assert.match(script.headers['cache-control'], /max-age=300/u);
  assert.match(script.text, /data-mt-catalog-menu/u);
  assert.match(script.text, /grouped-sections/u);
  assert.match(script.text, /horoshop-catalog-menu\/theme\.css/u);
  assert.match(script.text, /productsMenu-tabs-list__link\[data-target\]/u);
  assert.doesNotMatch(script.text, /fetch\(/u);

  const stylesheet = await request(app)
    .get('/api/public/horoshop-catalog-menu/theme.css')
    .query({ site: publicId, v: 1 })
    .expect(200);
  assert.match(stylesheet.headers['content-type'], /text\/css/u);
  assert.match(stylesheet.text, /data-mt-catalog-theme="grouped-sections"/u);

  const disabled = await admin.patch('/api/horoshop-catalog-menu/settings/enabled')
    .send({ enabled: false })
    .expect(200);
  assert.equal(disabled.body.data.enabled, false);
});

test('embed adapter preserves Horoshop links, labels, icons and markup', () => {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>
    <div class="products-menu j-products-menu">
      <div class="productsMenu-submenu __hasTabs">
        <div class="productsMenu-tabs">
          <ul class="productsMenu-tabs-list">
            <li class="productsMenu-tabs-list__tab"><a class="productsMenu-tabs-list__link" data-target="menu-tab-1" href="/phones/"><span class="productsMenu-tabs-list__icon"><img src="/phone.jpg" alt="Телефони"></span>Телефони</a></li>
            <li class="productsMenu-tabs-list__tab"><a class="productsMenu-tabs-list__link" data-target="menu-tab-2" href="/laptops/"><span class="productsMenu-tabs-list__icon"><img src="/laptop.jpg" alt="Ноутбуки"></span>Ноутбуки</a></li>
          </ul>
          <div class="productsMenu-tabs-content"><ul class="productsMenu-submenu-w __visible" id="menu-tab-1"><li class="productsMenu-submenu-i"><a class="productsMenu-submenu-a" href="/smartphones/"><span class="productsMenu-submenu-t">Смартфони</span></a><ul class="productsMenu-list"><li class="productsMenu-list-i"><a href="/apple/">Apple</a></li></ul></li></ul></div>
        </div>
      </div>
    </div>
  </body></html>`, { runScripts: 'outside-only', url: 'https://mobiletrend.com.ua/' });
  const root = dom.window.document.querySelector('.j-products-menu');
  const originalMarkup = root.innerHTML;
  const originalLinks = [...root.querySelectorAll('a')].map((link) => ({
    href: link.getAttribute('href'),
    text: link.textContent.trim()
  }));
  const originalImages = [...root.querySelectorAll('img')].map((image) => ({
    src: image.getAttribute('src'),
    alt: image.getAttribute('alt')
  }));

  dom.window.eval(catalogMenuEmbedScript('compact-columns'));
  dom.window.eval(catalogMenuEmbedScript('compact-columns'));

  assert.equal(root.getAttribute('data-mt-catalog-menu'), 'v1');
  assert.equal(root.getAttribute('data-mt-catalog-theme'), 'compact-columns');
  assert.equal(root.innerHTML, originalMarkup);
  assert.deepEqual([...root.querySelectorAll('a')].map((link) => ({
    href: link.getAttribute('href'),
    text: link.textContent.trim()
  })), originalLinks);
  assert.deepEqual([...root.querySelectorAll('img')].map((image) => ({
    src: image.getAttribute('src'),
    alt: image.getAttribute('alt')
  })), originalImages);
  assert.equal(dom.window.document.querySelectorAll('#mt-horoshop-catalog-menu-v1').length, 1);
  dom.window.close();
});

test('embed adapter fails open when the Horoshop menu contract is absent', () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body><nav>Каталог</nav></body></html>', {
    runScripts: 'outside-only',
    url: 'https://mobiletrend.com.ua/'
  });
  const bodyMarkup = dom.window.document.body.innerHTML;
  dom.window.eval(catalogMenuEmbedScript('flat-directory'));
  assert.equal(dom.window.document.body.innerHTML, bodyMarkup);
  assert.equal(dom.window.document.getElementById('mt-horoshop-catalog-menu-v1'), null);
  dom.window.close();
});
