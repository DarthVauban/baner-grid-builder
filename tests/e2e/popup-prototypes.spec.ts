import { devices, expect, test, type Page } from '@playwright/test';

async function openPrototype(page: Page, kind = 'product') {
  await page.goto('/login');
  await page.getByLabel('Email').fill('e2e-admin@test.local');
  await page.locator('input[name="password"]').fill('E2E-admin-password-2026');
  await page.getByRole('button', { name: 'Увійти' }).click();
  await expect(page.getByRole('heading', { name: 'Вітаємо, E2E' })).toBeVisible();
  await page.goto(`/tools/popup-banners/prototypes/${kind}`);
  await expect(page.getByRole('main')).toHaveClass(/pp-studio/);
}

test.describe('popup builder prototypes on desktop', () => {
  test.use({ viewport: { width: 1600, height: 1000 } });

  test('edits products with independent device settings, undo and persistent local drafts', async ({ page }, testInfo) => {
    const writes: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/popup-banners') && request.method() !== 'GET') writes.push(request.url());
    });
    await openPrototype(page);
    const canvas = page.getByRole('region', { name: 'Полотно конструктора' });
    const inspector = page.getByRole('complementary', { name: 'Властивості елемента' });
    await canvas.getByRole('button', { name: 'Редагувати: Заголовок і текст', exact: true }).click();
    await inspector.getByRole('textbox', { name: 'Заголовок', exact: true }).fill('Особлива добірка');
    await expect(canvas.getByRole('heading', { name: 'Особлива добірка' })).toBeVisible();
    await page.getByRole('button', { name: 'Скасувати зміну' }).click();
    await expect(canvas.getByRole('heading', { name: 'Твій наступний iPhone' })).toBeVisible();
    await page.getByRole('button', { name: 'Повторити зміну' }).click();
    await page.getByRole('button', { name: 'Mobile', exact: true }).click();
    await page.getByRole('complementary', { name: 'Структура банера' }).getByRole('button', { name: /Композиція/ }).click();
    await inspector.getByLabel('Ширина банера').focus();
    await page.keyboard.press('End');
    await expect(inspector.getByLabel('Ширина банера')).toHaveValue('390');
    await page.getByRole('button', { name: 'Desktop', exact: true }).click();
    await expect(inspector.getByLabel('Ширина банера')).toHaveValue('580');
    await page.reload();
    await expect(canvas.getByRole('heading', { name: 'Особлива добірка' })).toBeVisible();
    await canvas.getByRole('button', { name: 'Редагувати: Картка товару', exact: true }).click();
    await inspector.getByRole('checkbox', { name: /iPhone 15/ }).uncheck();
    await expect(page.locator('.pp-carousel > span')).toHaveText('1 / 2');
    await page.getByRole('button', { name: 'Тестувати', exact: true }).click();
    await canvas.getByRole('button', { name: 'Наступний товар' }).click();
    await expect(canvas.getByRole('heading', { name: 'iPhone 16', exact: true })).toBeVisible();
    await canvas.getByRole('button', { name: 'Переглянути товар', exact: true }).click();
    await expect(canvas.getByRole('status')).toContainText('Тест: перехід до iPhone 16');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Експортувати макет' }).click();
    expect((await download).suggestedFilename()).toBe('popup-product-prototype.json');
    await page.screenshot({ path: testInfo.outputPath('product-studio.png'), animations: 'disabled' });
    expect(writes).toEqual([]);
  });

  test('builds a contact form and simulates validation, sending and coupon success without API writes', async ({ page }, testInfo) => {
    await openPrototype(page, 'lead-form');
    const writes: string[] = [];
    page.on('request', (request) => { if (request.method() !== 'GET' && /popup-banners/.test(request.url())) writes.push(request.url()); });
    const canvas = page.getByRole('region', { name: 'Полотно конструктора' });
    const structure = page.getByRole('complementary', { name: 'Структура банера' });
    const inspector = page.getByRole('complementary', { name: 'Властивості елемента' });
    await structure.getByRole('button', { name: /Поля форми/ }).click();
    await inspector.getByRole('button', { name: 'Телефон', exact: true }).click();
    await inspector.getByLabel('Назва поля', { exact: true }).fill('Контактний телефон');
    await inspector.getByRole('checkbox', { name: 'Обов’язкове поле' }).check();
    await expect(canvas.getByRole('textbox', { name: /Контактний телефон/ })).toBeVisible();
    await structure.getByRole('button', { name: /Поля форми/ }).click();
    await inspector.getByRole('button', { name: 'Список', exact: true }).click();
    await inspector.getByLabel('Назва поля', { exact: true }).fill('Зручний канал зв’язку');
    await inspector.getByRole('checkbox', { name: 'Обов’язкове поле' }).check();
    await page.getByRole('button', { name: 'Помилки', exact: true }).click();
    await expect(canvas.getByText('Перевір це поле')).toHaveCount(3);
    await page.getByRole('button', { name: 'Промокод отримано', exact: true }).click();
    await expect(canvas.getByText('HELLO10')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('lead-success-studio.png'), animations: 'disabled' });
    await page.getByRole('button', { name: 'Тестувати', exact: true }).click();
    await page.getByRole('button', { name: 'Помилки', exact: true }).click();
    await expect(canvas.getByText('Перевір це поле')).toHaveCount(3);
    await page.getByRole('button', { name: 'Форма', exact: true }).click();
    await canvas.getByRole('button', { name: 'Отримати промокод', exact: true }).click();
    await expect(canvas.getByText('Заповни це поле')).toHaveCount(3);
    await canvas.getByRole('textbox', { name: /Електронна пошта/ }).fill('sample@example.com');
    await canvas.getByRole('textbox', { name: /Контактний телефон/ }).fill('+380501234567');
    await canvas.getByRole('button', { name: /Зручний канал зв’язку/ }).click();
    await page.getByRole('option', { name: 'Варіант 2' }).click();
    await canvas.getByRole('button', { name: 'Отримати промокод', exact: true }).click();
    await expect(canvas.getByRole('button', { name: 'Надсилаємо…' })).toBeVisible();
    await expect(canvas.getByRole('heading', { name: 'Бонус уже твій!' })).toBeVisible();
    await page.getByRole('button', { name: 'Редагувати', exact: true }).click();
    await structure.getByRole('button', { name: /Поля форми/ }).click();
    await page.screenshot({ path: testInfo.outputPath('lead-form-studio.png'), animations: 'disabled' });
    await page.reload();
    await expect(canvas.getByRole('textbox', { name: /Контактний телефон/ })).toBeVisible();
    expect(writes).toEqual([]);
  });
});

test.describe('popup builder prototypes on mobile', () => {
  const phone = devices['iPhone 13'];
  test.use({ viewport: phone.viewport, userAgent: phone.userAgent, isMobile: phone.isMobile, hasTouch: phone.hasTouch, deviceScaleFactor: phone.deviceScaleFactor });
  for (const kind of ['product', 'lead-form']) {
    test(`supports panels and fullscreen controls for ${kind}`, async ({ page }, testInfo) => {
      await openPrototype(page, kind);
      await page.getByRole('button', { name: 'Mobile', exact: true }).click();
      await page.getByRole('button', { name: 'Структура', exact: true }).click();
      await page.getByRole('complementary', { name: 'Структура банера' }).getByRole('button', { name: 'Заголовок і текст', exact: true }).click();
      await page.getByRole('textbox', { name: 'Заголовок', exact: true }).fill('Мобільна пропозиція');
      await page.getByRole('button', { name: 'Полотно', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Мобільна пропозиція' })).toBeVisible();
      await page.getByRole('button', { name: 'Розгорнути прев’ю' }).click();
      const close = page.getByRole('button', { name: 'Повернутися до редактора' });
      await expect(close).toBeVisible();
      await page.getByRole('button', { name: 'Desktop', exact: true }).click();
      await page.getByRole('button', { name: 'Mobile', exact: true }).click();
      const viewport = (await page.locator('.pp-stage-viewport').boundingBox())!;
      await expect.poll(async () => {
        const banner = (await page.locator('.pp-sample-banner').boundingBox())!;
        return banner.y + banner.height;
      }).toBeLessThanOrEqual(viewport.y + viewport.height);
      await page.screenshot({ path: testInfo.outputPath(`${kind}-mobile.png`), animations: 'disabled' });
      await close.click();
      await expect(page.getByRole('button', { name: 'Властивості', exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
    });
  }
});
