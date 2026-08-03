import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';

const admin = {
  email: 'e2e-admin@test.local',
  password: 'E2E-admin-password-2026'
};

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(admin.email);
  await page.locator('input[name="password"]').fill(admin.password);
  await page.getByRole('button', { name: 'Увійти' }).click();
  await expect(page.getByRole('heading', { name: 'Вітаємо, E2E' })).toBeVisible();
}

test('uploaded image is converted to WebP and inserted into the hero field', async ({ page }) => {
  await login(page);
  const created = await page.request.post('/api/publications', {
    data: {
      title: 'Media picker article',
      description: 'Image upload flow',
      publishAt: new Date(Date.now() + 86_400_000).toISOString(),
      assigneeId: null,
      materials: []
    }
  });
  expect(created.ok()).toBe(true);
  const publication = (await created.json()).data as { id: string };

  await page.goto(`/tools/blog-publications/${publication.id}/editor`);
  await expect(page.getByRole('heading', { name: 'Media picker article' })).toBeVisible();
  await page.getByRole('button', { name: 'Завантажити або обрати' }).first().click();
  await expect(page.getByRole('heading', { name: 'Виберіть зображення' })).toBeVisible();

  const png = await sharp({
    create: { width: 640, height: 360, channels: 3, background: '#ffe101' }
  }).png().toBuffer();
  await page.getByLabel('Завантажити зображення').setInputFiles({
    name: 'e2e-hero.png',
    mimeType: 'image/png',
    buffer: png
  });

  await expect(page.getByRole('heading', { name: 'Виберіть зображення' })).not.toBeVisible();
  const heroUrl = page.getByLabel('Головне зображення');
  await expect(heroUrl).toHaveValue(/\/media\/catalog\/library\/.+\.webp$/);

  const preview = page.frameLocator('iframe[title="Попередній перегляд статті"]');
  const previewImage = preview.locator('.mt-blog-image img');
  await expect(previewImage).toBeVisible();
  await expect.poll(() => previewImage.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(640);
  const previewRatio = await previewImage.evaluate((image: HTMLImageElement) => {
    const bounds = image.getBoundingClientRect();
    return bounds.width / bounds.height;
  });
  expect(previewRatio).toBeCloseTo(16 / 9, 2);

  await page.goto('/tools/blog-publications/media');
  await expect(page.getByRole('heading', { name: 'Файлове сховище' })).toBeVisible();
  await expect(page.getByText('e2e-hero.png')).toBeVisible();
  await expect(page.getByText(/640×360 · .* · WebP/)).toBeVisible();

  const feedResponse = await page.request.get('/api/media?search=e2e-hero');
  expect(feedResponse.ok()).toBe(true);
  const feed = (await feedResponse.json()).data as { items: Array<{ id: string; mimeType: string; url: string }> };
  expect(feed.items).toHaveLength(1);
  expect(feed.items[0].mimeType).toBe('image/webp');
  const storedImage = await page.request.get(feed.items[0].url);
  expect(storedImage.ok()).toBe(true);
  expect(storedImage.headers()['content-type']).toContain('image/webp');

  await page.request.delete(`/api/media/${feed.items[0].id}`);
});
