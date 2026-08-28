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

  assert.match(balanced, /--mt-cart-product-row-height: 100px/u);
  assert.match(balanced, /--mt-cart-card-image-height: 270px/u);
  assert.match(showcase, /--mt-cart-product-row-height: 96px/u);
  assert.match(showcase, /--mt-cart-card-image-height: 300px/u);
  assert.match(compact, /--mt-cart-product-row-height: 92px/u);
  assert.match(compact, /--mt-cart-card-image-height: 240px/u);
  assert.match(balanced, /height: min\(820px, calc\(100dvh - 24px\)\)/u);
  assert.match(balanced, /grid-template-columns: minmax\(420px, 43fr\) minmax\(0, 57fr\) !important/u);
  assert.match(balanced, /grid-template-rows: minmax\(0, 1fr\) auto !important/u);
  assert.match(balanced, /\.cart-content \{[^}]*height: 100% !important;[^}]*grid-column: 1 !important;[^}]*grid-row: 1 \/ 3 !important;/su);
  assert.match(balanced, /\.cart-items \{[^}]*height: 100% !important;[^}]*overflow-y: auto !important;/su);
  assert.match(balanced, /\.cart-section \{[^}]*max-height: none !important;[^}]*overflow-y: visible !important;/su);
  assert.match(balanced, /\.cart-foot \{[^}]*grid-column: 2 !important;[^}]*grid-row: 2 !important;[^}]*position: static !important;/su);
  assert.match(balanced, /\.j-cart-additional \{[^}]*grid-column: 2 !important;[^}]*grid-row: 1 !important;/su);
  assert.match(balanced, /\.cart-btnOrder \{[^}]*width: 100% !important;[^}]*display: block !important;/su);
  assert.match(balanced, /\.cart-buttons \{[^}]*box-sizing: border-box !important;[^}]*padding: 0 !important;/su);
  assert.match(balanced, /\.cart-btnOrder \.btn \{[^}]*padding: 0 24px !important;/su);
  assert.match(balanced, /\.cart-buttons::before,[^}]*\.cart-buttons::after \{[^}]*content: none !important;[^}]*display: none !important;/su);
  assert.match(balanced, /\.productsSlider-wrapper \{[^}]*height: 100% !important;[^}]*min-height: 0 !important;[^}]*max-height: 100% !important;/su);
  assert.match(balanced, /\.productsSlider-i > a \{[^}]*min-height: 0 !important;[^}]*display: flex !important;[^}]*flex-direction: column !important;/su);
  assert.match(balanced, /\.productsSlider-image \{[^}]*min-height: 100px !important;[^}]*flex: 1 1 var\(--mt-cart-card-image-height\) !important;/su);
  assert.match(balanced, /\.productsSlider-img \{[^}]*min-height: 0 !important;[^}]*object-fit: contain !important;/su);
  assert.match(balanced, /\.productsSlider-i \{[^}]*width: var\(--mt-cart-slider-card-width, var\(--mt-cart-card-width\)\) !important;[^}]*margin-right: var\(--mt-cart-slider-card-gap, 14px\) !important;[^}]*border-radius: 14px !important;/su);
  assert.match(balanced, /\.productsSlider-container::before \{[^}]*width: 0 !important;[^}]*display: none !important;[^}]*content: none !important;/su);
  assert.match(balanced, /\.slideCarousel-nav-btn \{[^}]*background: var\(--mt-cart-accent\) !important;[^}]*transform: translateY\(-50%\) !important;/su);
  assert.match(balanced, /\.slideCarousel-nav-btn::before \{[^}]*position: static !important;[^}]*inset: auto !important;[^}]*margin: 0 !important;/su);
  assert.match(balanced, /\.slideCarousel-nav-btn\.__slideLeft::before \{[^}]*transform: translateX\(4px\) rotate\(135deg\) !important;/su);
  assert.match(balanced, /\.slideCarousel-nav-btn\.__slideRight::before \{[^}]*transform: translateX\(-4px\) rotate\(-45deg\) !important;/su);
  assert.match(balanced, /\.slideCarousel-nav-btn\.__disabled,[^}]*\.slideCarousel-nav-btn:disabled \{[^}]*visibility: hidden !important;[^}]*pointer-events: none !important;/su);
  assert.match(balanced, /\[data-mt-cart-overlay="v1"\]\[data-mt-cart-overlay-open="true"\]/u);
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
  assert.equal(desktopRoot.closest('.overlay').getAttribute('data-mt-cart-overlay-open'), 'true');
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

test('embed adapter preserves Horoshop slide geometry before applying desktop card styles', async () => {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>
    <div class="overlay">
      <section id="cart" class="popup __cart">
        <div class="productsSlider-container">
          <div class="productsSlider-wrapper">
            <article class="productsSlider-i" style="width: 284px; margin-right: 15px"><a href="/case/">Чохол</a></article>
          </div>
        </div>
      </section>
    </div>
  </body></html>`, { runScripts: 'outside-only', url: 'https://mobiletrend.com.ua/' });

  dom.window.eval(cartThemeEmbedScript('accessory-showcase'));
  const root = dom.window.document.querySelector('.popup.__cart');
  const cardWidth = Number.parseFloat(root.style.getPropertyValue('--mt-cart-slider-card-width'));
  const cardGap = Number.parseFloat(root.style.getPropertyValue('--mt-cart-slider-card-gap'));

  assert.equal(cardWidth, 284);
  assert.equal(cardGap, 15);
  assert.equal((cardWidth + cardGap) * 2, 598);

  await new Promise((resolve) => dom.window.setTimeout(resolve, 60));
  dom.window.close();
});

test('embed adapter organizes the desktop cart into list, recommendations and checkout zones', async () => {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>
    <div class="overlay">
      <section id="cart" class="popup __cart">
        <div class="cart">
          <div class="cart-content">
            <table class="cart-items">
              <tbody class="cart-section"><tr class="cart-item"><td>Товар</td></tr></tbody>
              <tfoot class="cart-foot"><tr><td><button class="j-coupon-add" type="button">Купон</button></td></tr></tfoot>
            </table>
          </div>
          <div class="j-cart-additional"><div class="cart-recommended">Рекомендації</div></div>
        </div>
      </section>
    </div>
  </body></html>`, { runScripts: 'outside-only', url: 'https://mobiletrend.com.ua/' });
  const root = dom.window.document.querySelector('.popup.__cart');
  const cart = root.querySelector('.cart');
  const content = root.querySelector('.cart-content');
  const recommendations = root.querySelector('.j-cart-additional');
  const footer = root.querySelector('.cart-foot');
  const couponButton = root.querySelector('.j-coupon-add');
  let couponClicks = 0;
  couponButton.addEventListener('click', () => { couponClicks += 1; });

  dom.window.eval(cartThemeEmbedScript('balanced-upsell'));

  assert.deepEqual(Array.from(cart.children), [content, recommendations, footer]);
  assert.equal(footer.parentElement, cart);
  couponButton.click();
  assert.equal(couponClicks, 1);

  await new Promise((resolve) => dom.window.setTimeout(resolve, 60));
  dom.window.close();
});

test('embed adapter releases the desktop overlay when Horoshop closes and reopens the cart', async () => {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>
    <div class="overlay" style="display: block">
      <section id="cart" class="popup __cart" style="display: block">
        <button class="popup-close" type="button">Закрити</button>
      </section>
    </div>
  </body></html>`, { runScripts: 'outside-only', url: 'https://mobiletrend.com.ua/' });
  const root = dom.window.document.querySelector('.popup.__cart');
  const overlay = dom.window.document.querySelector('.overlay');

  dom.window.eval(cartThemeEmbedScript('balanced-upsell'));
  assert.equal(overlay.getAttribute('data-mt-cart-overlay-open'), 'true');

  root.style.display = 'none';
  overlay.style.display = 'none';
  await new Promise((resolve) => dom.window.setTimeout(resolve, 20));
  assert.equal(overlay.getAttribute('data-mt-cart-overlay-open'), 'false');

  overlay.style.display = 'block';
  root.style.display = 'block';
  await new Promise((resolve) => dom.window.setTimeout(resolve, 20));
  assert.equal(overlay.getAttribute('data-mt-cart-overlay-open'), 'true');

  root.remove();
  await new Promise((resolve) => dom.window.setTimeout(resolve, 20));
  assert.equal(overlay.getAttribute('data-mt-cart-overlay-open'), 'false');

  await new Promise((resolve) => dom.window.setTimeout(resolve, 60));
  dom.window.close();
});

test('embed adapter upgrades undersized Horoshop recommendation thumbnails', async () => {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>
    <div class="overlay">
      <section id="cart" class="popup __cart">
        <div class="productsSlider-container">
          <img class="productsSlider-img" src="/content/images/11/104x130l80nn0/42270905754886.webp" alt="Смартфон">
          <img class="productsSlider-img" src="/content/images/12/313x390l80mc0/123.webp" alt="Чохол">
        </div>
      </section>
    </div>
  </body></html>`, { runScripts: 'outside-only', url: 'https://mobiletrend.com.ua/' });

  dom.window.eval(cartThemeEmbedScript('accessory-showcase'));
  const images = dom.window.document.querySelectorAll('.productsSlider-img');
  assert.equal(images[0].getAttribute('src'), '/content/images/11/312x390l80nn0/42270905754886.webp');
  assert.equal(images[1].getAttribute('src'), '/content/images/12/313x390l80mc0/123.webp');

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
