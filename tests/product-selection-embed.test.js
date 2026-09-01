import test from 'node:test';
import assert from 'node:assert/strict';
import { Script } from 'node:vm';
import { JSDOM } from 'jsdom';
import {
  productPromoLoaderScript,
  productSelectionEmbedScript
} from '../src/modules/product-selections/product-selection.embed.js';

const token = '8b8a6ef2-322a-4aa3-8260-a9c5f8501480';

function promoEnvelope() {
  return {
    ok: true,
    json: async () => ({ data: { mode: 'percent', value: 10, highlightPromoPrice: true } })
  };
}

async function evaluatePromo(markup, surfaceSelector) {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>${markup}</body></html>`, {
    runScripts: 'dangerously',
    url: `https://shop.example.com/product/?mt_promo=${token}`
  });
  let calls = 0;
  dom.window.fetch = async () => { calls += 1; return promoEnvelope(); };
  const script = dom.window.document.createElement('script');
  script.setAttribute('data-mt-product-promo-loader', '');
  script.textContent = productPromoLoaderScript('https://workspace.example.com');
  dom.window.document.body.appendChild(script);
  await new Promise((resolve) => dom.window.setTimeout(resolve, 30));
  const box = dom.window.document.querySelector(surfaceSelector);
  return { dom, box, calls };
}

test('selection embed renders its own responsive cards without rewriting native markup', () => {
  const code = productSelectionEmbedScript({
    id: 'selection-public-id',
    heading: 'Ми рекомендуємо',
    buttonLabel: 'Купити',
    desktopColumns: 4,
    mobileColumns: 2,
    products: [{
      title: 'Смартфон TECNO Spark 50', article: 'TECNO-50',
      imageUrl: 'https://cdn.example.com/tecno.webp',
      pageUrl: `https://shop.example.com/tecno/?mt_promo=${token}`,
      price: '8999', oldPrice: '9890', currency: 'UAH', buyId: '9001', highlightPrice: true
    }]
  });
  assert.doesNotThrow(() => new Script(code));
  assert.match(code, /document\.createElement\("article"\)/u);
  assert.match(code, /--mt-selection-mobile-columns/u);
  assert.match(code, /surfaceSelectors/u);
  assert.doesNotMatch(code, /innerHTML/u);
});

test('promo loader uses the verified desktop price contract', async () => {
  const { dom, box, calls } = await evaluatePromo(`
    <div class="product-price__box" itemprop="offers">
      <div class="product-price__item"><meta itemprop="price" content="8999"><meta itemprop="priceCurrency" content="UAH">8 999 грн</div>
    </div>
  `, '.product-price__box');
  assert.equal(calls, 1);
  assert.equal(box.querySelector('.mt-product-promo-old-price').textContent, '9\u00a0890 грн');
  assert.equal(box.querySelector('.mt-product-promo-old-price').getAttribute('data-mt-promo-surface'), 'desktop');
  assert.equal(box.querySelector('.product-price__item').classList.contains('mt-product-promo-current-price'), true);
  dom.window.close();
});

test('promo loader uses the independent mobile price contract', async () => {
  const { dom, box, calls } = await evaluatePromo(`
    <div class="product-card__price-box">
      <div class="product-card__price"><meta itemprop="price" content="1399"><meta itemprop="priceCurrency" content="UAH">1 399 грн</div>
    </div>
  `, '.product-card__price-box');
  assert.equal(calls, 1);
  assert.equal(box.querySelector('.mt-product-promo-old-price').textContent, '1\u00a0530 грн');
  assert.equal(box.querySelector('.mt-product-promo-old-price').getAttribute('data-mt-promo-surface'), 'mobile');
  assert.equal(box.querySelector('.product-card__price').classList.contains('mt-product-promo-current-price'), true);
  dom.window.close();
});

test('promo loader fails open without an opaque promo token', async () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body><main>Товар</main></body></html>', {
    runScripts: 'dangerously',
    url: 'https://shop.example.com/product/'
  });
  let called = false;
  dom.window.fetch = async () => { called = true; return promoEnvelope(); };
  const before = dom.window.document.body.innerHTML;
  const script = dom.window.document.createElement('script');
  script.textContent = productPromoLoaderScript('https://workspace.example.com');
  dom.window.document.body.appendChild(script);
  await new Promise((resolve) => dom.window.setTimeout(resolve, 10));
  assert.equal(called, false);
  assert.equal(dom.window.document.querySelector('.mt-product-promo-old-price'), null);
  assert.match(dom.window.document.body.innerHTML, /<main>Товар<\/main>/u);
  assert.notEqual(dom.window.document.body.innerHTML, before);
  dom.window.close();
});
