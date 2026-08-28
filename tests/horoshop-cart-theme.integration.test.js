import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { JSDOM } from 'jsdom';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.CART_THEME_TEST_DATABASE_URL || 'pg-mem://cart-theme-tests';
process.env.JWT_SECRET = 'cart-theme-test-secret-0123456789';
process.env.COOKIE_SECURE = 'false';
process.env.APP_ORIGIN = 'https://mt-panel.example.com';
process.env.ADMIN_NAME = 'Cart Theme Admin';
process.env.ADMIN_EMAIL = 'cart-theme-admin@test.local';
process.env.ADMIN_PASSWORD = 'AdminPassword123!';

const { default: app } = await import('../src/app.js');
const { pool } = await import('../src/db/pool.js');
const { runMigrations } = await import('../src/db/migrate.js');
const { ensureBootstrapAdmin } = await import('../src/modules/users/user.service.js');
const { cartThemeCss, cartThemeEmbedScript } = await import('../src/modules/horoshop-cart-theme/cart-theme.embed.js');

const admin = request.agent(app);

before(async () => {
  await runMigrations();
  await ensureBootstrapAdmin();
  await pool.query(`
    INSERT INTO search_horoshop_connections (store_domain, encrypted_credentials, last_sync_at)
    VALUES ('mobiletrend.com.ua', 'encrypted-test-credentials', NOW())
  `);
  await admin.post('/api/auth/login').send({
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD
  }).expect(200);
});

after(async () => {
  await pool.end();
});

test('cart theme settings publish one visual contract without exposing cart data', async () => {
  await request(app).get('/api/horoshop-cart-theme/settings').expect(401);

  const initial = await admin.get('/api/horoshop-cart-theme/settings').expect(200);
  assert.equal(initial.body.data.settings.enabled, false);
  assert.equal(initial.body.data.settings.draftThemeId, 'balanced-upsell');
  assert.equal(initial.body.data.settings.publishedThemeId, null);
  assert.equal(initial.body.data.settings.storeDomain, 'mobiletrend.com.ua');
  assert.deepEqual(
    initial.body.data.themes.map((theme) => theme.id),
    ['balanced-upsell', 'accessory-showcase', 'compact-wide']
  );
  assert.match(initial.body.data.settings.embedCode, /horoshop-cart-theme\/embed\.js\?site=/u);

  const publicId = initial.body.data.settings.publicId;
  const disabledScript = await request(app)
    .get('/api/public/horoshop-cart-theme/embed.js')
    .query({ site: publicId })
    .expect(200);
  assert.match(disabledScript.text, /disabled/u);

  await admin.put('/api/horoshop-cart-theme/settings/draft')
    .send({ themeId: 'unknown-theme' })
    .expect(422);

  const draft = await admin.put('/api/horoshop-cart-theme/settings/draft')
    .send({ themeId: 'accessory-showcase' })
    .expect(200);
  assert.equal(draft.body.data.draftThemeId, 'accessory-showcase');
  assert.equal(draft.body.data.enabled, false);

  const published = await admin.post('/api/horoshop-cart-theme/settings/publish')
    .send({ themeId: 'accessory-showcase' })
    .expect(200);
  assert.equal(published.body.data.publishedThemeId, 'accessory-showcase');
  assert.equal(published.body.data.publishedVersion, 1);
  assert.equal(published.body.data.enabled, true);

  const script = await request(app)
    .get('/api/public/horoshop-cart-theme/embed.js')
    .query({ site: publicId })
    .expect(200);
  assert.match(script.headers['content-type'], /javascript/u);
  assert.match(script.headers['cache-control'], /max-age=300/u);
  assert.match(script.text, /data-mt-cart-theme/u);
  assert.match(script.text, /accessory-showcase/u);
  assert.match(script.text, /horoshop-cart-theme\/theme\.css/u);
  assert.match(script.text, /MutationObserver/u);
  assert.doesNotMatch(script.text, /fetch\(/u);

  const stylesheet = await request(app)
    .get('/api/public/horoshop-cart-theme/theme.css')
    .query({ site: publicId, v: 1 })
    .expect(200);
  assert.match(stylesheet.headers['content-type'], /text\/css/u);
  assert.match(stylesheet.text, /data-mt-cart-layout="accessory-showcase"/u);
  assert.match(stylesheet.text, /--mt-cart-desktop-width: 1280px/u);
  assert.match(stylesheet.text, /--mt-cart-card-width: 270px/u);
  assert.match(stylesheet.text, /--mt-cart-mobile-card-width: 178px/u);
  assert.match(stylesheet.text, /\.popup\.__cart\[data-mt-cart-theme="v1"\]/u);
  assert.match(stylesheet.text, /#cart-drawer\[data-mt-cart-theme="v1"\]/u);

  const disabled = await admin.patch('/api/horoshop-cart-theme/settings/enabled')
    .send({ enabled: false })
    .expect(200);
  assert.equal(disabled.body.data.enabled, false);
});

test('cart theme variants keep the ordered items compact and recommendations dominant', () => {
  const balanced = cartThemeCss('balanced-upsell');
  const showcase = cartThemeCss('accessory-showcase');
  const compact = cartThemeCss('compact-wide');

  assert.match(balanced, /--mt-cart-product-row-height: 84px/u);
  assert.match(balanced, /--mt-cart-card-image-height: 190px/u);
  assert.match(showcase, /--mt-cart-product-row-height: 80px/u);
  assert.match(showcase, /--mt-cart-card-image-height: 220px/u);
  assert.match(compact, /--mt-cart-product-row-height: 88px/u);
  assert.match(compact, /--mt-cart-card-image-height: 170px/u);
  assert.match(balanced, /max-height: calc\(var\(--mt-cart-product-row-height\) \* 2 \+ 9px\)/u);
  assert.match(balanced, /height: min\(820px, calc\(100dvh - 24px\)\)/u);
});

test('embed adapter preserves Horoshop cart markup, links and event handlers', async () => {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>
    <div class="overlay">
      <section id="cart" class="popup __cart">
        <div class="popup-block">
          <table class="cart-items"><tbody class="cart-section"><tr class="cart-item">
            <td class="cart-cell __image"><a class="cart-image" href="/product/"><img src="/product.jpg" alt="Товар"></a></td>
            <td class="cart-cell"><a class="cart-title" href="/product/">Смартфон</a></td>
            <td class="cart-cell"><button class="counter-plus" type="button">+</button></td>
            <td class="cart-cell"><span class="cart-cost">9 999 грн</span></td>
          </tr></tbody></table>
          <div class="cart-recommended"><div class="productsSlider-container"><div class="productsSlider-wrapper"><article class="productsSlider-i"><a href="/case/">Чохол</a></article></div></div></div>
        </div>
      </section>
    </div>
    <aside id="cart-drawer" class="cart">
      <a class="cart-item__title" href="/mobile-product/">Смартфон</a>
      <button class="cart__order" type="button">Оформити</button>
      <div class="cart__related-goods"><div class="carousel"><div class="carousel__wrapper"><article class="carousel__item"><a href="/glass/">Скло</a></article></div></div></div>
    </aside>
  </body></html>`, { runScripts: 'outside-only', url: 'https://mobiletrend.com.ua/' });
  const desktopRoot = dom.window.document.querySelector('.popup.__cart');
  const mobileRoot = dom.window.document.querySelector('#cart-drawer');
  const desktopMarkup = desktopRoot.innerHTML;
  const mobileMarkup = mobileRoot.innerHTML;
  const orderButton = mobileRoot.querySelector('.cart__order');
  let orderClicks = 0;
  orderButton.addEventListener('click', () => { orderClicks += 1; });

  dom.window.eval(cartThemeEmbedScript('balanced-upsell'));
  dom.window.eval(cartThemeEmbedScript('balanced-upsell'));

  assert.equal(desktopRoot.getAttribute('data-mt-cart-theme'), 'v1');
  assert.equal(desktopRoot.getAttribute('data-mt-cart-layout'), 'balanced-upsell');
  assert.equal(desktopRoot.getAttribute('data-mt-cart-surface'), 'desktop');
  assert.equal(mobileRoot.getAttribute('data-mt-cart-surface'), 'mobile');
  assert.equal(desktopRoot.closest('.overlay').getAttribute('data-mt-cart-overlay'), 'v1');
  assert.equal(desktopRoot.innerHTML, desktopMarkup);
  assert.equal(mobileRoot.innerHTML, mobileMarkup);
  assert.equal(desktopRoot.querySelector('.cart-title').getAttribute('href'), '/product/');
  assert.equal(mobileRoot.querySelector('.cart-item__title').getAttribute('href'), '/mobile-product/');
  orderButton.click();
  assert.equal(orderClicks, 1);
  assert.equal(dom.window.document.querySelectorAll('#mt-horoshop-cart-theme-v1').length, 1);

  await new Promise((resolve) => dom.window.setTimeout(resolve, 60));
  dom.window.close();
});

test('embed adapter enhances a cart injected later by Horoshop AJAX', async () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body><main></main></body></html>', {
    runScripts: 'outside-only',
    url: 'https://mobiletrend.com.ua/'
  });
  dom.window.eval(cartThemeEmbedScript('compact-wide'));
  assert.equal(dom.window.document.getElementById('mt-horoshop-cart-theme-v1'), null);

  const overlay = dom.window.document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = '<section id="cart" class="popup __cart"><div class="productsSlider-container"></div></section>';
  dom.window.document.body.appendChild(overlay);
  await new Promise((resolve) => dom.window.setTimeout(resolve, 20));

  const root = dom.window.document.querySelector('.popup.__cart');
  assert.equal(root.getAttribute('data-mt-cart-layout'), 'compact-wide');
  assert.equal(overlay.getAttribute('data-mt-cart-overlay'), 'v1');
  assert.ok(dom.window.document.getElementById('mt-horoshop-cart-theme-v1'));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 60));
  dom.window.close();
});

test('embed adapter fails open when the Horoshop cart contract is absent', () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body><main>Кошик ще не відкрито</main></body></html>', {
    runScripts: 'outside-only',
    url: 'https://mobiletrend.com.ua/'
  });
  const bodyMarkup = dom.window.document.body.innerHTML;
  dom.window.eval(cartThemeEmbedScript('accessory-showcase'));
  assert.equal(dom.window.document.body.innerHTML, bodyMarkup);
  assert.equal(dom.window.document.getElementById('mt-horoshop-cart-theme-v1'), null);
  dom.window.close();
});
