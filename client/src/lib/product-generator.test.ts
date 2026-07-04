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

  it('produces one-time global product price code', () => {
    expect(buildGlobalProductCode()).toContain('MT GLOBAL PRODUCT PRICE START');
  });
});
