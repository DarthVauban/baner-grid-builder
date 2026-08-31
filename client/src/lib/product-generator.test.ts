import { describe, expect, it } from 'vitest';
import { buildGlobalProductCode, buildProductsCode } from './product-generator';

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

  it('produces one-time global product price code for desktop and mobile Horoshop markup', () => {
    const result = buildGlobalProductCode();

    expect(result).toContain('MT GLOBAL PRODUCT PRICE START');
    expect(result).toContain('.mt-product-current-price .product-price__item');
    expect(result).toContain('.mt-product-current-price .product-card__price');
    expect(result).toContain('".product-card--main .product-card__price"');
    expect(result).toContain('nestedPrice.classList.add("mt-product-current-price")');
  });
});
