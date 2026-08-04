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

test('dropped images show progress, become compact WebP cards and can be inserted', async ({ page }) => {
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

  await page.getByRole('button', { name: 'Нова папка' }).click();
  await expect(page.getByRole('heading', { name: 'Нова папка' })).toBeVisible();
  await page.getByLabel('Назва папки').fill('E2E банери');
  await page.getByRole('button', { name: 'Створити' }).click();
  await page.locator('.media-folder-card__open').filter({ hasText: 'E2E банери' }).click();
  await expect(page.getByRole('navigation', { name: 'Шлях у файловому сховищі' })).toContainText('E2E банери');

  const heroPng = await sharp({
    create: { width: 640, height: 360, channels: 3, background: '#ffe101' }
  }).png().toBuffer();
  const squarePng = await sharp({
    create: { width: 320, height: 320, channels: 3, background: '#6d55ff' }
  }).png().toBuffer();
  await page.route(/\/api\/media\?folderId=/, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, 450));
    await route.fulfill({ response });
  });
  const dataTransfer = await page.evaluateHandle(({ hero, square }) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(hero)], 'e2e-hero.png', { type: 'image/png' }));
    transfer.items.add(new File([new Uint8Array(square)], 'e2e-square.png', { type: 'image/png' }));
    return transfer;
  }, {
    hero: Array.from(heroPng),
    square: Array.from(squarePng)
  });
  await page.locator('.media-upload-zone').dispatchEvent('drop', { dataTransfer });

  await expect(page.getByRole('progressbar')).toHaveCount(2);
  await expect(page.locator('.media-upload-row--success')).toHaveCount(2, { timeout: 10_000 });
  await expect(page.locator('.media-upload-row')).toHaveCount(0, { timeout: 4_000 });
  await expect(page.locator('.media-asset-card')).toHaveCount(2);
  await page.locator('.media-asset-card').filter({ hasText: 'e2e-hero.png' }).getByRole('button', { name: 'Вставити' }).click();

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
  await page.locator('.media-folder-card__open').filter({ hasText: 'E2E банери' }).click();
  await expect(page.getByText('e2e-hero.png')).toBeVisible();
  await expect(page.getByText('e2e-square.png')).toBeVisible();
  await expect(page.getByText(/640×360 · .* · WebP/)).toBeVisible();
  const heroCard = page.locator('.media-asset-card').filter({ hasText: 'e2e-hero.png' });
  const cardLayout = await heroCard.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const image = element.querySelector('img');
    return { ratio: bounds.width / bounds.height, objectFit: image ? getComputedStyle(image).objectFit : '' };
  });
  expect(cardLayout.ratio).toBeGreaterThan(2);
  expect(cardLayout.objectFit).toBe('contain');

  const foldersResponse = await page.request.get('/api/media/folders');
  expect(foldersResponse.ok()).toBe(true);
  const folderFeed = (await foldersResponse.json()).data as { items: Array<{ id: string; name: string }> };
  const folder = folderFeed.items.find((item) => item.name === 'E2E банери');
  expect(folder).toBeTruthy();

  const feedResponse = await page.request.get(`/api/media?folderId=${folder!.id}`);
  expect(feedResponse.ok()).toBe(true);
  const feed = (await feedResponse.json()).data as { items: Array<{ id: string; name: string; mimeType: string; url: string }> };
  expect(feed.items).toHaveLength(2);
  const heroAsset = feed.items.find((item) => item.name === 'e2e-hero.png');
  expect(heroAsset?.mimeType).toBe('image/webp');
  const storedImage = await page.request.get(heroAsset!.url);
  expect(storedImage.ok()).toBe(true);
  expect(storedImage.headers()['content-type']).toContain('image/webp');

  await page.goto(`/tools/blog-publications/${publication.id}/editor`);
  await page.getByRole('button', { name: 'Завантажити або обрати' }).first().click();
  await page.locator('.media-folder-card__open').filter({ hasText: 'E2E банери' }).click();
  await page.getByRole('button', { name: 'Видалити e2e-hero.png' }).click();
  await expect(page.getByRole('heading', { name: 'Видалити зображення?' })).toBeVisible();
  const confirmZIndex = await page.locator('.confirm-dialog-backdrop').evaluate((element) => Number(getComputedStyle(element).zIndex));
  const pickerZIndex = await page.locator('.media-picker-backdrop').evaluate((element) => Number(getComputedStyle(element).zIndex));
  const confirmFooterPadding = await page.locator('.confirm-dialog__footer').evaluate((element) => Number.parseFloat(getComputedStyle(element).paddingTop));
  expect(confirmZIndex).toBeGreaterThan(pickerZIndex);
  expect(confirmFooterPadding).toBeGreaterThanOrEqual(16);
  await page.getByRole('button', { name: 'Скасувати', exact: true }).click();

  const heroCheckbox = heroCard.getByRole('checkbox', { name: 'Виділити e2e-hero.png' });
  const unselectedVisual = await heroCard.evaluate((element) => {
    const checkbox = element.querySelector('.media-asset-card__select span');
    return {
      border: getComputedStyle(element).borderColor,
      background: getComputedStyle(element).backgroundColor,
      checkboxBackground: checkbox ? getComputedStyle(checkbox).backgroundColor : ''
    };
  });
  await heroCheckbox.check();
  await expect(heroCard).toHaveClass(/media-asset-card--selected/);
  await expect(heroCard.locator('.media-asset-card__selected-label')).toHaveText('Вибрано');
  await expect.poll(() => heroCard.evaluate((element) => getComputedStyle(element).borderColor)).not.toBe(unselectedVisual.border);
  await expect.poll(() => heroCard.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(unselectedVisual.background);
  const selectedVisual = await heroCard.evaluate((element) => {
    const checkbox = element.querySelector('.media-asset-card__select span');
    const checkboxIcon = element.querySelector('.media-asset-card__select .icon');
    return {
      border: getComputedStyle(element).borderColor,
      background: getComputedStyle(element).backgroundColor,
      checkboxBackground: checkbox ? getComputedStyle(checkbox).backgroundColor : '',
      checkboxIconOpacity: checkboxIcon ? getComputedStyle(checkboxIcon).opacity : ''
    };
  });
  expect(selectedVisual.border).not.toBe(unselectedVisual.border);
  expect(selectedVisual.background).not.toBe(unselectedVisual.background);
  expect(selectedVisual.checkboxBackground).not.toBe(unselectedVisual.checkboxBackground);
  expect(selectedVisual.checkboxIconOpacity).toBe('1');
  const selectionToolbar = page.getByRole('toolbar', { name: 'Дії з вибраними файлами' });
  await expect(selectionToolbar).toContainText('Вибрано: 1');
  await selectionToolbar.getByRole('button', { name: 'Виділити усі' }).click();
  await expect(selectionToolbar).toContainText('Вибрано: 2');
  await expect(page.getByRole('checkbox', { name: 'Виділити e2e-square.png' })).toBeChecked();
  await selectionToolbar.getByRole('button', { name: 'Видалити (2)' }).click();
  await expect(page.getByRole('heading', { name: 'Видалити вибрані файли?' })).toBeVisible();
  await page.locator('.confirm-dialog').getByRole('button', { name: 'Видалити (2)' }).click();
  await expect(page.locator('.media-asset-card')).toHaveCount(0);

  await page.request.delete(`/api/media/folders/${folder!.id}`);
  await page.request.patch(`/api/publications/${publication.id}/status`, {
    data: { status: 'cancelled', publicationUrl: '' }
  });
});
