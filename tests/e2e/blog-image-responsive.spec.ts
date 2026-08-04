import { expect, test } from '@playwright/test';
import { createBlogPostDocument, generateBlogPostExport } from '../../client/src/lib/blog-editor';

const svg = (width: number, height: number, color: string) => `
  <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="${color}" />
  </svg>`;

test('blog images keep their intrinsic aspect ratio in the mobile layout', async ({ page }) => {
  await page.route('https://assets.example/**', async (route) => {
    const isHero = route.request().url().endsWith('/hero.svg');
    await route.fulfill({
      contentType: 'image/svg+xml',
      body: isHero ? svg(1600, 400, '#ffe101') : svg(400, 1200, '#111111')
    });
  });

  const document = createBlogPostDocument('Mobile image test', 'Responsive article');
  document.hero.imageUrl = 'https://assets.example/hero.svg';
  document.sections[0].blocks.push({
    id: 'portrait-image',
    type: 'image',
    url: 'https://assets.example/portrait.svg',
    alt: 'Portrait',
    caption: ''
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.setContent(generateBlogPostExport(document).preview, { waitUntil: 'networkidle' });

  const hero = page.locator('.mt-blog-image img');
  const portrait = page.locator('.mt-blog-promo-banner img');
  await expect(hero).toHaveJSProperty('complete', true);
  await expect(portrait).toHaveJSProperty('complete', true);

  const layout = await page.evaluate(() => {
    const metrics = (selector: string) => {
      const image = document.querySelector<HTMLImageElement>(selector)!;
      const bounds = image.getBoundingClientRect();
      return {
        renderedRatio: bounds.width / bounds.height,
        naturalRatio: image.naturalWidth / image.naturalHeight,
        minHeight: getComputedStyle(image).minHeight
      };
    };

    return {
      bodyPadding: getComputedStyle(document.body).padding,
      hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
      hero: metrics('.mt-blog-image img'),
      portrait: metrics('.mt-blog-promo-banner img')
    };
  });

  expect(layout.bodyPadding).toBe('0px');
  expect(layout.hasHorizontalOverflow).toBe(false);
  expect(layout.hero.minHeight).toBe('0px');
  expect(layout.portrait.minHeight).toBe('0px');
  expect(layout.hero.renderedRatio).toBeCloseTo(layout.hero.naturalRatio, 2);
  expect(layout.portrait.renderedRatio).toBeCloseTo(layout.portrait.naturalRatio, 2);
});
