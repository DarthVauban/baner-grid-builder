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
const { catalogMenuCss, catalogMenuEmbedScript } = await import('../src/modules/horoshop-catalog-menu/catalog-menu.embed.js');

const admin = request.agent(app);

before(async () => {
  await runMigrations();
  await ensureBootstrapAdmin();
  const connection = await pool.query(`
    INSERT INTO search_horoshop_connections (store_domain, encrypted_credentials, last_sync_at)
    VALUES ('mobiletrend.com.ua', 'encrypted-test-credentials', NOW())
    RETURNING id, generation
  `);
  const { id: connectionId, generation } = connection.rows[0];
  const syncId = '11111111-1111-4111-8111-111111111111';
  await pool.query(`
    INSERT INTO search_horoshop_categories (
      connection_id, generation, external_id, parent_external_id, titles, last_seen_sync_id
    ) VALUES
      ($1, $2, '900', NULL, '{"uk":"Головна"}'::jsonb, $3),
      ($1, $2, '901', '900', '{"uk":"Звичайна сторінка"}'::jsonb, $3),
      ($1, $2, '1000', '900', '{"uk":"Каталог"}'::jsonb, $3),
      ($1, $2, '1217', '1000', '{"uk":"Мобільна техніка"}'::jsonb, $3),
      ($1, $2, '1218', '1217', '{"uk":"Смартфони"}'::jsonb, $3),
      ($1, $2, '1282', '1000', '{"uk":"Комп''ютерна периферія"}'::jsonb, $3),
      ($1, $2, '1283', '1282', '{"uk":"Миші"}'::jsonb, $3),
      ($1, $2, '1600', '1000', '{"uk":"Порожній розділ"}'::jsonb, $3)
  `, [connectionId, generation, syncId]);
  await admin.post('/api/auth/login').send({
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD
  }).expect(200);
});

after(async () => {
  await pool.end();
});

test('catalog menu themes keep every submenu block aligned with its grid column', () => {
  for (const themeId of ['compact-columns', 'flat-directory', 'grouped-sections']) {
    assert.doesNotMatch(
      catalogMenuCss(themeId),
      /\.productsMenu-submenu-i:first-child\s*\{[^}]*padding-left:/su
    );
  }

  const compactCss = catalogMenuCss('compact-columns');
  assert.match(
    compactCss,
    /\.productsMenu-submenu-i:nth-child\(4n \+ 1\)\s*\{[^}]*border-left: 0 !important;[^}]*padding-left: 0 !important;/su
  );
});

test('catalog menu settings publish a selected visual without exposing catalog data', async () => {
  await request(app).get('/api/horoshop-catalog-menu/settings').expect(401);

  const initial = await admin.get('/api/horoshop-catalog-menu/settings').expect(200);
  assert.equal(initial.body.data.settings.enabled, false);
  assert.equal(initial.body.data.settings.draftThemeId, 'compact-columns');
  assert.equal(initial.body.data.settings.publishedThemeId, null);
  assert.equal(initial.body.data.settings.draftDefaultCategoryExternalId, null);
  assert.deepEqual(initial.body.data.defaultCategories, [
    { externalId: '1282', title: "Комп'ютерна периферія" },
    { externalId: '1217', title: 'Мобільна техніка' }
  ]);
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
    .send({ themeId: 'unknown-theme', defaultCategoryExternalId: '1217' })
    .expect(422);

  await admin.put('/api/horoshop-catalog-menu/settings/draft')
    .send({ themeId: 'compact-columns', defaultCategoryExternalId: '1600' })
    .expect(422);

  await admin.put('/api/horoshop-catalog-menu/settings/draft')
    .send({ themeId: 'compact-columns', defaultCategoryExternalId: '900' })
    .expect(422);

  await admin.put('/api/horoshop-catalog-menu/settings/draft')
    .send({ themeId: 'compact-columns', defaultCategoryExternalId: '1000' })
    .expect(422);

  const draft = await admin.put('/api/horoshop-catalog-menu/settings/draft')
    .send({ themeId: 'grouped-sections', defaultCategoryExternalId: '1217' })
    .expect(200);
  assert.equal(draft.body.data.draftThemeId, 'grouped-sections');
  assert.equal(draft.body.data.draftDefaultCategoryExternalId, '1217');
  assert.equal(draft.body.data.enabled, false);

  const published = await admin.post('/api/horoshop-catalog-menu/settings/publish')
    .send({ themeId: 'grouped-sections', defaultCategoryExternalId: '1217' })
    .expect(200);
  assert.equal(published.body.data.publishedThemeId, 'grouped-sections');
  assert.equal(published.body.data.publishedDefaultCategoryExternalId, '1217');
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
  assert.match(script.text, /menu-tab-.*defaultCategoryExternalId/u);
  assert.match(script.text, /"1217"/u);
  assert.doesNotMatch(script.text, /fetch\(/u);

  const stylesheet = await request(app)
    .get('/api/public/horoshop-catalog-menu/theme.css')
    .query({ site: publicId, v: 1 })
    .expect(200);
  assert.match(stylesheet.headers['content-type'], /text\/css/u);
  assert.match(stylesheet.text, /data-mt-catalog-theme="grouped-sections"/u);
  assert.match(stylesheet.text, /align-self: stretch !important/u);
  assert.match(stylesheet.text, /inset-inline-start: var\(--mt-menu-viewport-left\) !important/u);
  assert.match(stylesheet.text, /font-size: 16px !important/u);
  assert.match(stylesheet.text, /scrollbar-gutter: stable/u);
  assert.match(stylesheet.text, /width: var\(--mt-menu-viewport-width\) !important/u);
  assert.match(stylesheet.text, /height: var\(--mt-menu-viewport-height\) !important/u);
  assert.match(stylesheet.text, /\.productsMenu-tabs-list__tab \{[^}]*flex: 0 0 auto !important/us);
  assert.match(stylesheet.text, /html\.mt-catalog-menu-open,[^}]*overflow: hidden !important/us);
  assert.doesNotMatch(stylesheet.text, /width: min\(1280px/u);
  assert.match(stylesheet.text, /\.productsMenu-tabs-switch \{[^}]*flex: 0 0 var\(--mt-menu-root-width\) !important[^}]*transform: none !important/us);
  assert.doesNotMatch(stylesheet.text, /\.productsMenu-tabs-switch \{[^}]*transform: scale\(/us);

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
          <div class="productsMenu-tabs-switch">
            <ul class="productsMenu-tabs-list">
              <li class="productsMenu-tabs-list__tab"><a class="productsMenu-tabs-list__link" data-target="menu-tab-1" href="/phones/"><span class="productsMenu-tabs-list__icon"><img src="/phone.jpg" alt="Телефони"></span>Телефони</a></li>
              <li class="productsMenu-tabs-list__tab"><a class="productsMenu-tabs-list__link" data-target="menu-tab-2" href="/laptops/"><span class="productsMenu-tabs-list__icon"><img src="/laptop.jpg" alt="Ноутбуки"></span>Ноутбуки</a></li>
            </ul>
          </div>
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

test('embed adapter opens the first populated panel when Horoshop starts with an empty category', () => {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>
    <button class="j-productsMenu-toggleButton">Каталог</button>
    <div class="products-menu j-products-menu">
      <div class="productsMenu-submenu __hasTabs">
        <div class="productsMenu-tabs">
          <div class="productsMenu-tabs-switch">
            <ul class="productsMenu-tabs-list">
              <li class="productsMenu-tabs-list__tab __hover"><a class="productsMenu-tabs-list__link" data-target="menu-tab-empty" href="/sale/">Розпродаж</a></li>
              <li class="productsMenu-tabs-list__tab"><a class="productsMenu-tabs-list__link" data-target="menu-tab-filled" href="/phones/">Телефони</a></li>
            </ul>
          </div>
          <div class="productsMenu-tabs-content">
            <ul class="productsMenu-submenu-w __visible" id="menu-tab-empty"></ul>
            <ul class="productsMenu-submenu-w" id="menu-tab-filled"><li class="productsMenu-submenu-i"><a href="/apple/">Apple</a></li></ul>
          </div>
        </div>
      </div>
    </div>
  </body></html>`, { runScripts: 'outside-only', url: 'https://mobiletrend.com.ua/' });
  const root = dom.window.document.querySelector('.j-products-menu');
  const originalLinks = [...root.querySelectorAll('a')].map((link) => ({
    href: link.getAttribute('href'),
    text: link.textContent.trim()
  }));
  const originalElementCount = root.querySelectorAll('*').length;

  dom.window.eval(catalogMenuEmbedScript('compact-columns'));

  assert.equal(root.querySelector('#menu-tab-empty').classList.contains('__visible'), false);
  assert.equal(root.querySelector('#menu-tab-filled').classList.contains('__visible'), true);
  assert.equal(root.querySelector('[data-target="menu-tab-empty"]').closest('li').classList.contains('__hover'), false);
  assert.equal(root.querySelector('[data-target="menu-tab-filled"]').closest('li').classList.contains('__hover'), true);
  assert.equal(root.querySelectorAll('*').length, originalElementCount);
  assert.deepEqual([...root.querySelectorAll('a')].map((link) => ({
    href: link.getAttribute('href'),
    text: link.textContent.trim()
  })), originalLinks);
  dom.window.close();
});

test('embed adapter opens the configured Horoshop category on the first catalog view', () => {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>
    <button class="j-productsMenu-toggleButton">Каталог</button>
    <div class="products-menu j-products-menu">
      <div class="productsMenu-submenu __hasTabs">
        <div class="productsMenu-tabs">
          <div class="productsMenu-tabs-switch">
            <ul class="productsMenu-tabs-list">
              <li class="productsMenu-tabs-list__tab __hover"><a class="productsMenu-tabs-list__link" data-target="menu-tab-1474" href="/sale/">Розпродаж</a></li>
              <li class="productsMenu-tabs-list__tab"><a class="productsMenu-tabs-list__link" data-target="menu-tab-1217" href="/phones/">Мобільна техніка</a></li>
            </ul>
          </div>
          <div class="productsMenu-tabs-content">
            <ul class="productsMenu-submenu-w __visible" id="menu-tab-1474"><li class="productsMenu-submenu-i"><a href="/sale-items/">Акції</a></li></ul>
            <ul class="productsMenu-submenu-w" id="menu-tab-1217"><li class="productsMenu-submenu-i"><a href="/smartphones/">Смартфони</a></li></ul>
          </div>
        </div>
      </div>
    </div>
  </body></html>`, { runScripts: 'outside-only', url: 'https://mobiletrend.com.ua/' });
  const root = dom.window.document.querySelector('.j-products-menu');

  dom.window.eval(catalogMenuEmbedScript('compact-columns', '', '1217'));

  assert.equal(root.querySelector('#menu-tab-1474').classList.contains('__visible'), false);
  assert.equal(root.querySelector('#menu-tab-1217').classList.contains('__visible'), true);
  assert.equal(root.querySelector('[data-target="menu-tab-1474"]').closest('li').classList.contains('__hover'), false);
  assert.equal(root.querySelector('[data-target="menu-tab-1217"]').closest('li').classList.contains('__hover'), true);
  dom.window.close();
});

test('embed adapter sizes the menu to the viewport and locks page scroll only while it is open', async () => {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>
    <div class="products-menu j-products-menu">
      <div class="productsMenu-submenu __hasTabs">
        <div class="productsMenu-tabs">
          <div class="productsMenu-tabs-switch">
            <ul class="productsMenu-tabs-list">
              <li class="productsMenu-tabs-list__tab"><a class="productsMenu-tabs-list__link" data-target="menu-tab-1" href="/phones/">Телефони</a></li>
              <li class="productsMenu-tabs-list__tab"><a class="productsMenu-tabs-list__link" data-target="menu-tab-2" href="/laptops/">Ноутбуки</a></li>
            </ul>
          </div>
          <div class="productsMenu-tabs-content">
            <ul class="productsMenu-submenu-w __visible" id="menu-tab-1"><li class="productsMenu-submenu-i"><a href="/smartphones/">Смартфони</a></li></ul>
            <ul class="productsMenu-submenu-w" id="menu-tab-2"><li class="productsMenu-submenu-i"><a href="/ultrabooks/">Ультрабуки</a></li></ul>
          </div>
        </div>
      </div>
    </div>
  </body></html>`, { runScripts: 'outside-only', url: 'https://mobiletrend.com.ua/' });
  const root = dom.window.document.querySelector('.j-products-menu');
  const menu = root.querySelector('.productsMenu-submenu.__hasTabs');
  root.getBoundingClientRect = () => ({ left: 220, bottom: 100 });
  menu.getBoundingClientRect = () => ({ left: 220, top: 100 });

  dom.window.eval(catalogMenuEmbedScript('compact-columns'));

  const horizontalGap = Math.max(24, Math.min(48, Math.round(dom.window.innerWidth * 0.025)));
  assert.equal(root.style.getPropertyValue('--mt-menu-viewport-left'), `${horizontalGap - 220}px`);
  assert.equal(root.style.getPropertyValue('--mt-menu-viewport-width'), `${dom.window.innerWidth - horizontalGap * 2}px`);
  assert.match(root.style.getPropertyValue('--mt-menu-viewport-height'), /px$/u);
  assert.equal(dom.window.document.documentElement.classList.contains('mt-catalog-menu-open'), false);
  assert.equal(dom.window.document.body.classList.contains('mt-catalog-menu-open'), false);

  menu.classList.add('__visible');
  await new Promise((resolve) => dom.window.setTimeout(resolve, 10));
  assert.equal(dom.window.document.documentElement.classList.contains('mt-catalog-menu-open'), true);
  assert.equal(dom.window.document.body.classList.contains('mt-catalog-menu-open'), true);

  menu.classList.remove('__visible');
  await new Promise((resolve) => dom.window.setTimeout(resolve, 10));
  assert.equal(dom.window.document.documentElement.classList.contains('mt-catalog-menu-open'), false);
  assert.equal(dom.window.document.body.classList.contains('mt-catalog-menu-open'), false);
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
