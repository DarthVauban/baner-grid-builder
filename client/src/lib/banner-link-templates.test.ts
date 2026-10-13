import { describe, expect, it } from 'vitest';
import { bannerLinkPath, buildBannerTargetUrl, matchBannerLinkTemplate } from './banner-link-templates';
import type { BannerLinkTemplate } from '../types/workspace';

const template = (id: string, baseUrl: string): BannerLinkTemplate => ({
  id, name: id, baseUrl, createdAt: '', updatedAt: ''
});

describe('banner link templates', () => {
  it('joins a base address and path without duplicating slashes', () => {
    expect(buildBannerTargetUrl('https://mobiletrend.com.ua', '/teplo-vyhidnykh-pokupok/'))
      .toBe('https://mobiletrend.com.ua/teplo-vyhidnykh-pokupok/');
    expect(buildBannerTargetUrl('https://mobiletrend.com.ua/promo/', 'winter'))
      .toBe('https://mobiletrend.com.ua/promo/winter');
    expect(buildBannerTargetUrl('https://mobiletrend.com.ua', '')).toBe('https://mobiletrend.com.ua');
  });

  it('matches existing full links using the most specific template and never another host', () => {
    const templates = [template('site', 'https://mobiletrend.com.ua'), template('promo', 'https://mobiletrend.com.ua/promo')];
    expect(matchBannerLinkTemplate('https://mobiletrend.com.ua/promo/winter', templates))
      .toMatchObject({ template: { id: 'promo' }, path: '/winter' });
    expect(bannerLinkPath('https://mobiletrend.com.ua', 'https://mobiletrend.com.ua.evil.test/promo')).toBeNull();
  });
});
