import test from 'node:test';
import assert from 'node:assert/strict';
import { injectStorefrontProductSeo, storefrontSeoData } from '../src/modules/catalog/storefront.seo.js';

const product = {
  name: 'iPhone 15 Pro <Black>',
  productCode: 'SM-000123',
  slug: 'iphone-15-pro-black',
  publicPath: '/storefront/smartphones/iphone-15-pro-black',
  condition: 'USED',
  priceUah: 35999,
  availability: { status: 'in_stock' },
  brand: { label: 'Apple' },
  mainImageUrl: '/media/catalog/iphone.webp',
  gallery: [{ url: '/media/catalog/iphone-side.webp' }],
  shortDescription: 'Fallback description',
  seoTitle: 'SEO title & offer',
  seoDescription: 'SEO description "quoted"',
  socialDescription: 'Social description <safe>',
  characteristics: {
    items: [{ key: 'storage', label: 'Пам’ять', displayValue: '256 ГБ', unit: 'ГБ' }]
  }
};

test('injects saved product SEO fields into the initial storefront HTML', () => {
  const source = '<!doctype html><html><head><meta name="description" content="Default" /><title>Default title</title></head><body></body></html>';
  const html = injectStorefrontProductSeo(source, product, { origin: 'https://shop.example.com' });

  assert.match(html, /<title>SEO title &amp; offer<\/title>/);
  assert.match(html, /name="description" content="SEO description &quot;quoted&quot;"/);
  assert.match(html, /rel="canonical" href="https:\/\/shop\.example\.com\/storefront\/smartphones\/iphone-15-pro-black"/);
  assert.match(html, /property="og:description" content="Social description &lt;safe&gt;"/);
  assert.match(html, /property="og:image" content="https:\/\/shop\.example\.com\/media\/catalog\/iphone\.webp"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(html, /name="robots" content="index, follow, max-image-preview:large"/);
  assert.equal((html.match(/name="description"/g) || []).length, 1);

  const jsonMatch = html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/);
  assert.ok(jsonMatch);
  const structuredData = JSON.parse(jsonMatch[1]);
  assert.equal(structuredData['@type'], 'Product');
  assert.equal(structuredData.sku, 'SM-000123');
  assert.equal(structuredData.offers.price, 35999);
  assert.equal(structuredData.image[0], 'https://shop.example.com/media/catalog/iphone.webp');
});

test('uses safe fallbacks and keeps preview product pages out of search indexes', () => {
  const seo = storefrontSeoData({
    ...product,
    seoTitle: '',
    seoDescription: '',
    socialDescription: ''
  }, { origin: 'https://panel.example.com', preview: true });

  assert.equal(seo.title, product.name);
  assert.equal(seo.description, product.shortDescription);
  assert.equal(seo.socialDescription, product.shortDescription);
  assert.equal(seo.robots, 'noindex, nofollow');
});
