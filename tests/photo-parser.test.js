import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'pg-mem://photo-parser-unit-tests';
process.env.JWT_SECRET = '0123456789abcdef0123456789abcdef';
process.env.COOKIE_SECURE = 'false';

const {
  findPhotoParserAdapter,
  hostMatches,
  normalizePhotoParserImageUrls,
  sanitizePhotoParserAdapterInput
} = await import('../src/modules/catalog/photo-parser.adapters.js');
const {
  assertPublicPhotoParserUrl,
  isPrivateNetworkAddress
} = await import('../src/modules/catalog/photo-parser.browser.js');
const {
  convertPhotoParserImageToWebp
} = await import('../src/modules/catalog/photo-parser.service.js');
const { pool } = await import('../src/db/pool.js');

after(async () => pool.end());

test('photo parser matches exact store domains and prioritizes custom adapters', () => {
  assert.equal(hostMatches('www.comfy.ua', 'comfy.ua'), true);
  assert.equal(hostMatches('shop.comfy.ua', 'comfy.ua'), true);
  assert.equal(hostMatches('comfy.ua.example.com', 'comfy.ua'), false);

  const adapters = [
    { id: 'builtin', source: 'builtin', host: 'example.com', enabled: true },
    { id: 'custom', source: 'custom', host: 'shop.example.com', enabled: true }
  ];
  assert.equal(findPhotoParserAdapter('https://shop.example.com/product/1', adapters).id, 'custom');
  assert.equal(findPhotoParserAdapter('https://example.com/product/1', adapters).id, 'builtin');

  const sanitized = sanitizePhotoParserAdapterInput({
    name: '  Test   Store  ',
    storeUrl: 'www.example.com/catalog',
    gallerySelector: '.gallery img',
    fallback: true
  });
  assert.equal(sanitized.name, 'Test Store');
  assert.equal(sanitized.host, 'example.com');
  assert.equal(sanitized.storeUrl, 'https://www.example.com');
  assert.equal(sanitized.fallback, true);
});

test('photo parser normalizes marketplace image URLs and removes duplicates', () => {
  const rozetka = normalizePhotoParserImageUrls([
    'https://content1.rozetka.com.ua/goods/images/preview/123.jpg',
    'https://content1.rozetka.com.ua/goods/images/original/123.jpg'
  ], 'https://rozetka.com.ua/ua/product');
  assert.deepEqual(rozetka, ['https://content1.rozetka.com.ua/goods/images/original/123.jpg']);

  const comfy = normalizePhotoParserImageUrls([
    'https://cdn.comfy.ua/media/catalog/product/cache/abc/image/600x600/a/b/phone.jpg',
    'https://cdn.comfy.ua/media/catalog/product/small_image/a/b/thumb.jpg',
    'https://unrelated.example/phone.jpg'
  ], 'https://comfy.ua/product');
  assert.deepEqual(comfy, ['https://cdn.comfy.ua/media/catalog/product/b/phone.jpg']);
});

test('photo parser blocks local and private network targets before Chromium receives them', async () => {
  for (const address of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '192.168.1.20', '::1', 'fd00::1']) {
    assert.equal(isPrivateNetworkAddress(address), true, address);
  }
  assert.equal(isPrivateNetworkAddress('8.8.8.8'), false);
  assert.equal(isPrivateNetworkAddress('2606:4700:4700::1111'), false);

  await assert.rejects(
    () => assertPublicPhotoParserUrl('http://127.0.0.1/private'),
    (error) => error.code === 'PHOTO_PARSER_PRIVATE_URL'
  );
  await assert.rejects(
    () => assertPublicPhotoParserUrl('https://private.example/product', {
      resolver: async () => [{ address: '10.10.0.5', family: 4 }]
    }),
    (error) => error.code === 'PHOTO_PARSER_PRIVATE_URL'
  );
  const safe = await assertPublicPhotoParserUrl('https://public.example/product', {
    resolver: async () => [{ address: '93.184.216.34', family: 4 }]
  });
  assert.equal(safe.hostname, 'public.example');
});

test('photo parser converts supported source images to bounded WebP', async () => {
  const png = await sharp({
    create: {
      width: 640,
      height: 480,
      channels: 3,
      background: '#5f4bda'
    }
  }).png().toBuffer();
  const converted = await convertPhotoParserImageToWebp(png);
  const metadata = await sharp(converted.buffer).metadata();
  assert.equal(metadata.format, 'webp');
  assert.equal(converted.width, 640);
  assert.equal(converted.height, 480);
  assert.match(converted.contentSha256, /^[a-f0-9]{64}$/);
  assert.ok(converted.buffer.length < png.length);

  await assert.rejects(
    () => convertPhotoParserImageToWebp(Buffer.from('not-an-image')),
    /image|unsupported|header|format/i
  );
});
