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
    await canvas.getByRole('button', { name: 'Редагувати: Заголовок', exact: true }).click();
    await inspector.getByRole('textbox', { name: 'Заголовок', exact: true }).fill('Особлива добірка');
    await expect(canvas.locator('[data-part=title]')).toHaveText('Особлива добірка');
    await page.getByRole('button', { name: 'Скасувати зміну' }).click();
    await expect(canvas.locator('[data-part=title]')).toHaveText('Твій наступний iPhone');
    await page.getByRole('button', { name: 'Повторити зміну' }).click();
    await page.getByRole('button', { name: 'Mobile', exact: true }).click();
    await page.getByRole('complementary', { name: 'Структура банера' }).getByRole('button', { name: /Композиція/ }).click();
    await inspector.getByLabel('Ширина банера').focus();
    await page.keyboard.press('End');
    await expect(inspector.getByLabel('Ширина банера')).toHaveValue('390');
    await page.getByRole('button', { name: 'Desktop', exact: true }).click();
    await expect(inspector.getByLabel('Ширина банера')).toHaveValue('580');
    await page.reload();
    await expect(canvas.locator('[data-part=title]')).toHaveText('Особлива добірка');
    await page.getByRole('complementary', { name: 'Структура банера' }).getByRole('button', { name: /Товари/ }).click();
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

  test('selects every product text separately, keeps typography independent and restores edits', async ({ page }, testInfo) => {
    await openPrototype(page);
    const inspector = page.getByRole('complementary', { name: 'Властивості елемента' });
    const canvas = page.getByRole('region', { name: 'Полотно конструктора' });
    const edits = [
      ['eyebrow', 'Надзаголовок', 'Лише цього тижня'],
      ['title', 'Заголовок', 'Знайди свій телефон'],
      ['body', 'Основний текст', 'Нова добірка для тебе'],
      ['productBadge', 'Позначка товару', 'Спецпропозиція'],
      ['productTitle', 'Назва товару', 'Мій iPhone Pro'],
      ['productVariant', 'Характеристики товару', '512 ГБ · Titanium'],
      ['oldPrice', 'Стара ціна', '55555'],
      ['price', 'Ціна товару', '44444']
    ];
    for (const [id, label, value] of edits) {
      await canvas.locator('[data-part="' + id + '"]').click();
      await expect(inspector.getByRole('heading', { name: label, exact: true })).toBeVisible();
      await inspector.getByLabel(label, { exact: true }).fill(value);
      await expect(canvas.locator('[data-part="' + id + '"]')).toHaveClass(/is-selected/);
      await expect(canvas.locator('[data-part=products]')).not.toHaveClass(/is-selected/);
    }
    await canvas.locator('[data-part=productTitle]').click();
    await inspector.getByLabel('Розмір тексту', { exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(canvas.locator('[data-part=productTitle]')).toHaveCSS('font-size', '21px');
    await expect(canvas.locator('[data-part=productVariant]')).toHaveCSS('font-size', '10px');
    await inspector.getByRole('checkbox', { name: 'Курсив', exact: true }).check();
    await expect(canvas.locator('[data-part=productTitle]')).toHaveCSS('font-style', 'italic');
    await page.getByRole('button', { name: 'Mobile', exact: true }).click();
    await expect(canvas.locator('[data-part=productTitle]')).toHaveCSS('font-size', '17px');
    await expect(canvas.locator('[data-part=productTitle]')).toHaveCSS('font-style', 'normal');
    await page.getByRole('button', { name: 'Desktop', exact: true }).click();
    await canvas.locator('[data-part=productImage]').click();
    await inspector.getByLabel('Висота фото').focus();
    await page.keyboard.press('ArrowRight');
    await expect(canvas.locator('[data-part=productImage]')).toHaveCSS('height', '221px');
    await canvas.getByRole('button', { name: 'Наступний товар', exact: true }).click();
    await expect(canvas.locator('[data-part=productTitle]')).toHaveText('iPhone 15');
    await expect(canvas.locator('[data-part=productTitle]')).toHaveCSS('font-size', '21px');
    await page.reload();
    for (const [id, , value] of edits.filter(([id]) => !['oldPrice', 'price'].includes(id))) {
      await expect(canvas.locator('[data-part="' + id + '"]')).toHaveText(value);
    }
    await expect(canvas.locator('[data-part=productTitle]')).toHaveCSS('font-style', 'italic');
    await expect(canvas.locator('[data-part=price]')).toContainText('44');
    await canvas.locator('[data-part=productTitle]').click();
    await page.screenshot({ path: testInfo.outputPath('individual-text-editor.png'), animations: 'disabled' });
  });

  test('zooms around the pointer, pans within bounds and recenters without editing the banner', async ({ page }, testInfo) => {
    await openPrototype(page);
    const viewport = page.locator('.pp-stage-viewport');
    const scene = page.locator('.pp-scene-shell');
    const banner = page.locator('.pp-sample-banner');
    const rect = (await viewport.boundingBox())!;
    await expect.poll(async () => Number(await viewport.getAttribute('data-scale'))).toBeGreaterThan(0.5);
    const before = (await scene.boundingBox())!;
    const point = { x: before.x + before.width / 2 + 25, y: before.y + before.height / 2 };
    const localBefore = (point.x - before.x) / before.width;
    const scaleBefore = Number(await viewport.getAttribute('data-scale'));
    await page.mouse.move(point.x, point.y);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -40);
    await page.keyboard.up('Control');
    await expect.poll(async () => Number(await viewport.getAttribute('data-scale'))).toBeGreaterThan(scaleBefore);
    const zoomed = (await scene.boundingBox())!;
    expect(Math.abs((point.x - zoomed.x) / zoomed.width - localBefore)).toBeLessThan(0.01);
    await page.keyboard.down('Space');
    await page.mouse.down();
    await page.mouse.move(point.x + 45, point.y + 30, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.up('Space');
    await expect.poll(async () => (await scene.boundingBox())!.x).toBeGreaterThan(zoomed.x + 30);
    await expect(page.getByRole('button', { name: 'Скасувати зміну' })).toBeDisabled();
    await page.getByRole('button', { name: 'Масштаб полотна' }).click();
    await page.getByRole('option', { name: '300%', exact: true }).click();
    await expect(viewport).toHaveAttribute('data-scale', '3');
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.wheel(0, 100000);
    await expect.poll(async () => {
      const box = (await scene.boundingBox())!;
      return box.y + box.height;
    }).toBeGreaterThanOrEqual(rect.y + rect.height - 65);
    await page.getByRole('button', { name: 'Вписати банер', exact: true }).click();
    await expect.poll(async () => {
      const box = (await banner.boundingBox())!;
      return box.x >= rect.x && box.y >= rect.y && box.x + box.width <= rect.x + rect.width && box.y + box.height <= rect.y + rect.height;
    }).toBe(true);
    await page.getByRole('button', { name: 'Розгорнути прев’ю' }).click();
    await expect(page.getByRole('button', { name: 'Збільшити масштаб' })).toBeVisible();
    await page.getByRole('button', { name: 'Збільшити масштаб' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('complementary', { name: 'Властивості елемента' })).toBeVisible();
    await page.getByRole('button', { name: 'Вписати банер', exact: true }).click();
    await page.screenshot({ path: testInfo.outputPath('compact-canvas.png'), animations: 'disabled' });
  });

  test('selects cover and reward texts without leaving the selected screen', async ({ page }) => {
    await openPrototype(page, 'lead-form');
    const canvas = page.getByRole('region', { name: 'Полотно конструктора' });
    const inspector = page.getByRole('complementary', { name: 'Властивості елемента' });
    await canvas.locator('[data-part=coverBody]').click();
    await inspector.getByLabel('Текст обкладинки', { exact: true }).fill('Твоя вигода');
    await page.getByRole('button', { name: 'Промокод отримано', exact: true }).click();
    for (const [id, label, value] of [['successTitle', 'Заголовок успіху', 'Готово!'], ['successBody', 'Повідомлення успіху', 'Забирай свій бонус'], ['discount', 'Опис знижки', 'Для тебе'], ['code', 'Текст промокоду', 'NEW10'], ['copyLabel', 'Кнопка копіювання', 'Копіювати код']]) {
      await canvas.locator('[data-part="' + id + '"]').click();
      await inspector.getByLabel(label, { exact: true }).fill(value);
      await expect(page.getByRole('button', { name: 'Промокод отримано', exact: true })).toHaveAttribute('aria-pressed', 'true');
    }
    await page.reload();
    await expect(canvas.locator('[data-part=coverBody]')).toHaveText('Твоя вигода');
    await page.getByRole('button', { name: 'Промокод отримано', exact: true }).click();
    await expect(canvas.locator('[data-part=successTitle]')).toHaveText('Готово!');
    await expect(canvas.locator('[data-part=code]')).toHaveText('NEW10');
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
      const viewportNode = page.locator('.pp-stage-viewport');
      const area = (await viewportNode.boundingBox())!;
      const center = { x: Math.round(area.x + area.width / 2), y: Math.round(area.y + area.height / 2) };
      const initialScale = Number(await viewportNode.getAttribute('data-scale'));
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: center.x - 25, y: center.y }, { id: 2, x: center.x + 25, y: center.y }] });
      for (const distance of [35, 45, 55]) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: center.x - distance, y: center.y }, { id: 2, x: center.x + distance, y: center.y }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect.poll(async () => Number(await viewportNode.getAttribute('data-scale'))).toBeGreaterThan(initialScale);
      await expect(page.getByRole('main')).toHaveClass(/is-panel-canvas/);
      await page.getByRole('button', { name: 'Вписати банер', exact: true }).click();
      await page.locator('[data-part=title]').tap();
      await expect(page.getByRole('main')).toHaveClass(/is-panel-properties/);
      await cdp.detach();
      await page.getByRole('button', { name: 'Структура', exact: true }).click();
      await page.getByRole('complementary', { name: 'Структура банера' }).getByRole('button', { name: 'Заголовок і текст', exact: true }).click();
      await page.getByRole('textbox', { name: 'Заголовок', exact: true }).fill('Мобільна пропозиція');
      await page.getByRole('button', { name: 'Полотно', exact: true }).click();
      await expect(page.locator('[data-part=title]')).toHaveText('Мобільна пропозиція');
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
