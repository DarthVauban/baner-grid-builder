import { JSDOM, VirtualConsole } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { buildGlobalProductCode, buildMinifiedGlobalProductCode, buildProductsCode } from './product-generator';

function extractScript(code: string) {
  const match = code.match(/<script>([\s\S]*?)<\/script>/u);
  if (!match) throw new Error('Generated global code does not contain a script.');
  return match[1];
}

async function renderGlobalCode(code: string, markup: string, query = '?mt_old_percent=10&mt_promo_price=1') {
  const errors: unknown[] = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => errors.push(error));
  const dom = new JSDOM(`<!doctype html><html><head>${code}</head><body>${markup}</body></html>`, {
    runScripts: 'dangerously',
    url: `https://example.com/product/${query}`,
    virtualConsole
  });

  await new Promise<void>((resolve) => dom.window.setTimeout(resolve, 0));
  return { dom, errors };
}

function normalizePriceText(value: string | null | undefined) {
  return String(value || '').replace(/\s/gu, ' ').replace(/\s+/gu, ' ').trim();
}

describe('product code generator', () => {
  it('embeds banner and old-price settings into the page code', () => {
    const result = buildProductsCode({
      imageUrl: 'https://example.com/hero.jpg',
      linkUrl: 'https://example.com/sale',
      alt: 'Sale',
      oldPricePercent: 20,
      oldPriceFixed: 500,
      shareDescription: 'Campaign'
    });
    expect(result).toContain('data-old-price-percent="20"');
    expect(result).toContain('data-old-price-fixed=""');
    expect(result).toContain('https://example.com/hero.jpg');
    expect(result).toContain('mt_promo_price');
  });

  it('produces syntactically valid global product price code for desktop and mobile Horoshop markup', () => {
    const result = buildGlobalProductCode();

    expect(result).toContain('MT GLOBAL PRODUCT PRICE START');
    expect(result).toContain('.mt-product-current-price .product-price__item');
    expect(result).toContain('.mt-product-current-price .product-card__price');
    expect(result).toContain(".product__block--orderBox [data-view-block='orderBox'] .product-card--main[itemprop='offers'] .product-card__price");
    expect(() => new Function(extractScript(result))).not.toThrow();
  });

  it('applies one old price to the desktop product and never enters a mutation loop', async () => {
    const { dom, errors } = await renderGlobalCode(buildGlobalProductCode(), `
      <main class="product">
        <div class="product__block product__block--wide">
          <div class="product-price"><div class="product-price__box"><div class="product-price__item">8 999 грн</div></div></div>
        </div>
      </main>
    `);

    try {
      const document = dom.window.document;
      expect(errors).toEqual([]);
      expect(document.querySelectorAll('.mt-product-old-price')).toHaveLength(1);
      expect(normalizePriceText(document.querySelector('.mt-product-old-price')?.textContent)).toBe('9 890 грн');
      expect(document.querySelector('.product-price__item')?.classList.contains('mt-product-current-price')).toBe(true);

      document.querySelector('.product')?.append(document.createElement('div'));
      await new Promise<void>((resolve) => dom.window.setTimeout(resolve, 10));
      expect(document.querySelectorAll('.mt-product-old-price')).toHaveLength(1);
    } finally {
      dom.window.close();
    }
  });

  it('targets only the main mobile product price and ignores recommendation cards', async () => {
    const { dom, errors } = await renderGlobalCode(buildGlobalProductCode(), `
      <main class="product">
        <section class="recommendations"><div class="product-card__price">1 999 грн</div></section>
        <div class="product__block product__block--orderBox">
          <div data-view-block="orderBox">
            <div class="product-card product-card--main" itemprop="offers">
              <div class="product-card__price-item"><div class="product-card__price">399 грн</div></div>
            </div>
          </div>
        </div>
      </main>
    `);

    try {
      const document = dom.window.document;
      expect(errors).toEqual([]);
      expect(document.querySelectorAll('.mt-product-old-price')).toHaveLength(1);
      expect(normalizePriceText(document.querySelector('.mt-product-old-price')?.textContent)).toBe('430 грн');
      expect(document.querySelector('.product-card--main .product-card__price')?.classList.contains('mt-product-current-price')).toBe(true);
      expect(document.querySelector('.recommendations .product-card__price')?.classList.contains('mt-product-current-price')).toBe(false);
    } finally {
      dom.window.close();
    }
  });

  it('waits safely for delayed product markup when installed in the document head', async () => {
    const { dom, errors } = await renderGlobalCode(buildGlobalProductCode(), '<main class="product"></main>');

    try {
      const document = dom.window.document;
      document.querySelector('.product')!.innerHTML = `
        <div class="product__block product__block--wide">
          <div class="product-price"><div class="product-price__box"><div class="product-price__item">4 999 грн</div></div></div>
        </div>
      `;
      await new Promise<void>((resolve) => dom.window.setTimeout(resolve, 10));

      expect(errors).toEqual([]);
      expect(document.querySelectorAll('.mt-product-old-price')).toHaveLength(1);
      expect(normalizePriceText(document.querySelector('.mt-product-old-price')?.textContent)).toBe('5 490 грн');
    } finally {
      dom.window.close();
    }
  });

  it('provides an equivalent single-line minified global code version', async () => {
    const readable = buildGlobalProductCode();
    const minified = buildMinifiedGlobalProductCode();

    expect(minified.length).toBeLessThan(readable.length);
    expect(minified).not.toContain('\n');
    expect(minified).toContain('<style type="text/css">');
    expect(minified).toContain('<script>');
    expect(() => new Function(extractScript(minified))).not.toThrow();

    const { dom, errors } = await renderGlobalCode(minified, `
      <main class="product">
        <div class="product__block product__block--wide">
          <div class="product-price"><div class="product-price__box"><div class="product-price__item">8 999 грн</div></div></div>
        </div>
      </main>
    `);

    try {
      expect(errors).toEqual([]);
      expect(dom.window.document.querySelectorAll('.mt-product-old-price')).toHaveLength(1);
      expect(normalizePriceText(dom.window.document.querySelector('.mt-product-old-price')?.textContent)).toBe('9 890 грн');
    } finally {
      dom.window.close();
    }
  });
});
