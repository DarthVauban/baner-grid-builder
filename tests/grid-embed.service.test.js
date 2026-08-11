import test from 'node:test';
import assert from 'node:assert/strict';
import { Script } from 'node:vm';
import { bannerGridEmbedScript, buildBannerGridEmbedPayload } from '../src/modules/grids/grid-embed.service.js';

test('banner grid embed payload resolves public media and rejects unsafe URLs', () => {
  const payload = buildBannerGridEmbedPayload({
    id: '93ef3263-9d9b-4709-b6a2-65ff9a05a95d',
    banners: [
      {
        title: 'Літній розпродаж -20%',
        endDate: '2099-12-31',
        endTime: '20:00',
        imageUrl: '/media/catalog/library/sale.webp',
        targetUrl: 'https://shop.example.com/sale',
        disableWhenExpired: true
      },
      {
        title: 'Unsafe banner',
        endDate: '2099-12-31',
        imageUrl: 'https://workspace.example.com/banner.webp',
        targetUrl: 'javascript:alert(1)'
      }
    ]
  }, 'https://workspace.example.com');

  assert.equal(payload.banners.length, 1);
  assert.equal(payload.banners[0].imageUrl, 'https://workspace.example.com/media/catalog/library/sale.webp');
  assert.equal(payload.banners[0].targetUrl, 'https://shop.example.com/sale');
});

test('banner grid embed script renders with DOM APIs and scoped refresh logic', () => {
  const script = bannerGridEmbedScript({
    id: '93ef3263-9d9b-4709-b6a2-65ff9a05a95d',
    banners: [{
      title: '</script><script>alert(1)</script> -20%',
      endDate: '2099-12-31',
      imageUrl: '/media/catalog/library/sale.webp',
      targetUrl: 'https://shop.example.com/sale'
    }]
  }, 'https://workspace.example.com');

  assert.match(script, /document\.createElement\("a"\)/);
  assert.match(script, /grid\.querySelectorAll/);
  assert.doesNotMatch(script, /innerHTML/);
  assert.match(script, /window\.setInterval\(refresh, 60000\)/);
  assert.doesNotThrow(() => new Script(script));
});
