import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';
import { productPriceEmbedScript } from '../src/modules/product-price/product-price.embed.js';

function normalizePriceText(value) {
  return String(value || '').replace(/\s/gu, ' ').replace(/\s+/gu, ' ').trim();
}

async function render(markup, query = '?mt_old_percent=10&mt_promo_price=1') {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => errors.push(error));
  const dom = new JSDOM(`<!doctype html><html><head><script>${productPriceEmbedScript()}</script></head><body>${markup}</body></html>`, {
    runScripts: 'dangerously',
    url: `https://shop.example.com/product/${query}`,
    virtualConsole
  });

  await new Promise((resolve) => dom.window.setTimeout(resolve, 10));
  return { dom, errors };
}

test('product price embed is valid JavaScript and stays inactive without promo parameters', async (t) => {
  const script = productPriceEmbedScript();
  assert.doesNotThrow(() => new Function(script));

  const { dom, errors } = await render(`
    <div class="product__block product__block--wide">
      <div class="product-price"><div class="product-price__box"><div class="product-price__item">8 999 грн</div></div></div>
    </div>
  `, '');
  t.after(() => dom.window.close());

  assert.deepEqual(errors, []);
  assert.equal(dom.window.document.querySelector('.mt-product-old-price'), null);
  assert.equal(dom.window.document.getElementById('mt-product-price-styles-v1'), null);
});

test('product price embed applies one desktop old price without a mutation loop', async (t) => {
  const { dom, errors } = await render(`
    <main class="product">
      <div class="product__block product__block--wide">
        <div class="product-price"><div class="product-price__box"><div class="product-price__item">8 999 грн</div></div></div>
      </div>
    </main>
  `);
  t.after(() => dom.window.close());

  const { document } = dom.window;
  assert.deepEqual(errors, []);
  assert.equal(document.querySelectorAll('.mt-product-old-price').length, 1);
  assert.equal(normalizePriceText(document.querySelector('.mt-product-old-price')?.textContent), '9 890 грн');
  assert.equal(document.querySelector('.product-price__item')?.classList.contains('mt-product-current-price'), true);
  assert.equal(document.querySelector('.mt-product-old-price')?.parentElement, document.querySelector('.product-price__box'));
  assert.equal(document.querySelector('.product-price__box')?.firstElementChild?.className, 'mt-product-old-price');
  assert.ok(document.getElementById('mt-product-price-styles-v1'));

  document.querySelector('.product')?.append(document.createElement('div'));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 20));
  assert.equal(document.querySelectorAll('.mt-product-old-price').length, 1);
});

test('product price embed does not fight Horoshop price-box reconciliation', async (t) => {
  const nativePriceMarkup = `
    <div class="product-price__item">
      <meta itemprop="price" content="8999">
      <meta itemprop="priceCurrency" content="UAH">
      8 999 грн
    </div>
    <link itemprop="availability" href="https://schema.org/InStock">
  `;
  const dom = new JSDOM(`<!doctype html><html><head></head><body>
    <main class="product">
      <div class="product__block product__block--wide">
        <div class="product-price"><div class="product-price__box">${nativePriceMarkup}</div></div>
      </div>
    </main>
  </body></html>`, {
    runScripts: 'dangerously',
    url: 'https://shop.example.com/product/?mt_old_percent=10&mt_promo_price=1'
  });
  t.after(() => dom.window.close());

  const { document, MutationObserver } = dom.window;
  const priceBox = document.querySelector('.product-price__box');
  let reconciliations = 0;
  const hostObserver = new MutationObserver(() => {
    if (!priceBox.querySelector('.mt-product-old-price') || reconciliations >= 5) return;
    reconciliations += 1;
    priceBox.innerHTML = nativePriceMarkup;
  });
  hostObserver.observe(priceBox, { childList: true, subtree: true });
  t.after(() => hostObserver.disconnect());

  const script = document.createElement('script');
  script.textContent = productPriceEmbedScript();
  document.head.append(script);
  await new Promise((resolve) => dom.window.setTimeout(resolve, 30));

  assert.equal(reconciliations, 1);
  assert.equal(document.querySelectorAll('.mt-product-old-price').length, 0);
  assert.equal(normalizePriceText(document.querySelector('.product-price__item')?.textContent), '8 999 грн');
});

test('product price embed targets the main mobile product and ignores recommendation prices', async (t) => {
  const { dom, errors } = await render(`
    <main class="product">
      <section class="recommendations">
        <div class="product-card__price-box"><div class="product-card__price">1 999 грн</div></div>
      </section>
      <div class="product__block product__block--orderBox">
        <div data-view-block="orderBox">
          <div class="product-card product-card--main" itemprop="offers">
            <div class="product-card__price-box">
              <div class="product-card__price-item"><div class="product-card__price">399 грн</div></div>
            </div>
          </div>
        </div>
      </div>
    </main>
  `);
  t.after(() => dom.window.close());

  const { document } = dom.window;
  assert.deepEqual(errors, []);
  assert.equal(document.querySelectorAll('.mt-product-old-price').length, 1);
  assert.equal(normalizePriceText(document.querySelector('.mt-product-old-price')?.textContent), '430 грн');
  assert.equal(document.querySelector('.product-card--main .product-card__price')?.classList.contains('mt-product-current-price'), true);
  assert.equal(document.querySelector('.recommendations .product-card__price')?.classList.contains('mt-product-current-price'), false);
  assert.equal(
    document.querySelector('.mt-product-old-price')?.parentElement,
    document.querySelector('.product-card--main .product-card__price-box')
  );
  assert.equal(document.querySelector('.product-card__price-item .mt-product-old-price'), null);
});

test('product price embed waits for delayed native price box markup', async (t) => {
  const { dom, errors } = await render('<main class="product"></main>');
  t.after(() => dom.window.close());

  const { document } = dom.window;
  document.querySelector('.product').innerHTML = `
    <div class="product__block product__block--wide">
      <div class="product-price"><div class="product-price__box"><div class="product-price__item">4 999 грн</div></div></div>
    </div>
  `;
  await new Promise((resolve) => dom.window.setTimeout(resolve, 20));

  assert.deepEqual(errors, []);
  assert.equal(normalizePriceText(document.querySelector('.mt-product-old-price')?.textContent), '5 490 грн');
  assert.equal(document.querySelector('.mt-product-old-price')?.parentElement, document.querySelector('.product-price__box'));
  assert.equal(document.querySelectorAll('.mt-product-old-price').length, 1);
});

test('promo and old-price URL parameters work independently', async (t) => {
  const promoOnly = await render(`
    <div class="product__block product__block--orderBox">
      <div class="product-card product-card--main">
        <div class="product-card__price-box">
          <div class="product-card__price-item"><div class="product-card__price">399 грн</div></div>
        </div>
      </div>
    </div>
  `, '?mt_promo_price=1');
  const oldPriceOnly = await render(`
    <div class="product__block product__block--wide">
      <div class="product-price__box"><div class="product-price__item">8 999 грн</div></div>
    </div>
  `, '?mt_old_percent=10');
  t.after(() => promoOnly.dom.window.close());
  t.after(() => oldPriceOnly.dom.window.close());

  assert.deepEqual(promoOnly.errors, []);
  assert.equal(promoOnly.dom.window.document.querySelector('.product-card__price')?.classList.contains('mt-product-current-price'), true);
  assert.equal(promoOnly.dom.window.document.querySelector('.mt-product-old-price'), null);

  assert.deepEqual(oldPriceOnly.errors, []);
  assert.equal(normalizePriceText(oldPriceOnly.dom.window.document.querySelector('.mt-product-old-price')?.textContent), '9 890 грн');
  assert.equal(oldPriceOnly.dom.window.document.querySelector('.product-price__item')?.classList.contains('mt-product-current-price'), false);
});
