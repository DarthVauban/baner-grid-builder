import { describe, expect, it } from 'vitest';
import { buildBannerHtml, buildGridEmbedScriptTag, buildGridExport, getBannerDatePhrase, isBannerValid } from './banner-generator';
import type { BannerData } from '../types/workspace';

const banner: BannerData = {
  title: 'Літній розпродаж -20%',
  endDate: '2099-12-31',
  endTime: '20:00',
  imageUrl: 'https://example.com/banner.jpg',
  targetUrl: 'https://example.com/sale',
  disableWhenExpired: true
};

describe('banner generator', () => {
  it('validates complete banners and generates protected markup', () => {
    expect(isBannerValid(banner)).toBe(true);
    const html = buildBannerHtml(banner);
    expect(html).toContain('mt-banner-title-accent">-20%');
    expect(html).toContain('data-mt-disable-expired="true"');
    expect(html).toContain('https://example.com/banner.jpg');
  });

  it('includes metadata, styles and refresh script in grid exports', () => {
    const result = buildGridExport([banner], 'Літня кампанія');
    expect(result).toContain('<meta name="description" content="Літня кампанія">');
    expect(result).toContain('<style type="text/css">');
    expect(result).toContain('window.setInterval(refresh,60000)');
  });

  it('derives a readable deadline phrase', () => {
    expect(getBannerDatePhrase(banner, new Date('2099-12-30T00:00:00Z').getTime())).toContain('До закінчення акції');
  });

  it('builds a short dynamic embed tag for a saved grid', () => {
    const result = buildGridEmbedScriptTag('93ef3263-9d9b-4709-b6a2-65ff9a05a95d', 'https://workspace.example.com/tools/banner-grid');
    expect(result).toBe('<script async src="https://workspace.example.com/api/public/banner-grids/93ef3263-9d9b-4709-b6a2-65ff9a05a95d/embed.js"></script>');
  });
});
