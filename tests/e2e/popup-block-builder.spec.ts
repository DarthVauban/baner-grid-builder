import { devices, expect, test, type Page } from '@playwright/test';

async function openBuilder(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('e2e-admin@test.local');
  await page.locator('input[name="password"]').fill('E2E-admin-password-2026');
  await page.getByRole('button', { name: 'Увійти' }).click();
  await expect(page.getByRole('heading', { name: 'Вітаємо, E2E' })).toBeVisible();
  await page.goto('/tools/popup-banners/builder');
  await expect(page.getByRole('main')).toHaveClass(/pb-studio/);
}
async function template(page: Page, name: string) {
  await page.getByRole('button', { name: 'Шаблони', exact: false }).click();
  await page.getByRole('group', { name: 'Шаблони банерів' }).getByRole('button', { name, exact: true }).click();
}
const inspector = (page: Page) => page.getByRole('complementary', { name: 'Властивості блока' });
const structure = (page: Page) => page.getByRole('complementary', { name: 'Структура банера' });
async function choose(page: Page, label: string, value: string) {
  await inspector(page).getByRole('button', { name: label, exact: true }).click();
  await page.getByRole('option', { name: value, exact: true }).click();
}

test.describe('nested banner builder desktop', () => {
  test.use({ viewport: { width: 1600, height: 1000 } });
  test('constructs nested blocks, edits individual text, inherits mobile styles and persists an undoable document', async ({ page }, testInfo) => {
    const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
    await openBuilder(page); await template(page, 'Чистий аркуш');
    await structure(page).getByRole('button', { name: 'Додати', exact: true }).click();
    await structure(page).getByRole('button', { name: 'Горизонтальний блок', exact: true }).click();
    await inspector(page).getByLabel('Назва в дереві').fill('Ряд карток');
    await structure(page).getByRole('button', { name: 'Вертикальний блок', exact: true }).click();
    await inspector(page).getByLabel('Назва в дереві').fill('Картка');
    await structure(page).getByRole('button', { name: 'Текст', exact: true }).click();
    await inspector(page).getByLabel('Текст елемента').fill('Мій власний банер');
    await inspector(page).getByLabel('Розмір шрифту', { exact: true }).fill('32');
    await inspector(page).getByLabel('Назва в дереві').fill('Заголовок картки');
    const text = page.locator('.pb-node[data-label="Заголовок картки"]');
    await expect(text).toHaveText('Мій власний банер');
    await expect(text).toHaveCSS('font-size', '32px');
    await expect(text.locator('..')).toHaveAttribute('data-label', 'Картка');
    await expect(text.locator('../..')).toHaveAttribute('data-label', 'Ряд карток');
    await page.getByRole('button', { name: 'Mobile', exact: true }).click();
    await expect(text).toHaveCSS('font-size', '32px');
    await expect(page.locator('.pb-node[data-label="Ряд карток"]')).toHaveCSS('flex-direction', 'column');
    await inspector(page).getByLabel('Розмір шрифту', { exact: true }).fill('22');
    await page.getByRole('button', { name: 'Desktop', exact: true }).click();
    await expect(text).toHaveCSS('font-size', '32px');
    await expect(page.locator('.pb-node[data-label="Ряд карток"]')).toHaveCSS('flex-direction', 'row');
    await structure(page).getByRole('button', { name: 'Дублювати блок' }).click();
    await expect(page.locator('.pb-node[data-label="Заголовок картки"]')).toHaveCount(2);
    await page.getByRole('button', { name: 'Скасувати зміну' }).click();
    await expect(text).toHaveCount(1);
    await page.getByRole('button', { name: 'Повторити зміну' }).click();
    await expect(text).toHaveCount(2);
    await structure(page).getByRole('button', { name: 'Видалити блок' }).click();
    await expect(text).toHaveCount(1);
    await text.click();
    await expect(inspector(page).getByLabel('Текст елемента')).toHaveValue('Мій власний банер');
    await page.reload(); await expect(text).toHaveText('Мій власний банер');
    await page.getByRole('button', { name: 'Mobile', exact: true }).click(); await expect(text).toHaveCSS('font-size', '22px');
    await text.click(); await inspector(page).getByRole('button', { name: 'Успадкувати всі стилі Desktop' }).click(); await expect(text).toHaveCSS('font-size', '32px');
    await page.screenshot({ path: testInfo.outputPath('nested-builder.png'), animations: 'disabled' });
    expect(errors).toEqual([]);
  });
  test('reparents with drag and drop, wraps and restores complete branches', async ({ page }) => {
    await openBuilder(page); await template(page, 'Чистий аркуш');
    await structure(page).getByRole('button', { name: 'Додати', exact: true }).click();
    await structure(page).getByRole('button', { name: 'Вертикальний блок', exact: true }).click();
    await inspector(page).getByLabel('Назва в дереві').fill('Контейнер A');
    await structure(page).getByRole('button', { name: 'Текст', exact: true }).click(); await inspector(page).getByLabel('Назва в дереві').fill('Переносний текст');
    await page.locator('.pb-breadcrumbs').getByRole('button', { name: 'Банер', exact: false }).click();
    await structure(page).getByRole('button', { name: 'Вертикальний блок', exact: true }).click(); await inspector(page).getByLabel('Назва в дереві').fill('Контейнер B');
    await structure(page).getByRole('button', { name: /Шари/ }).click();
    await structure(page).getByRole('button', { name: 'Обрати: Переносний текст', exact: true }).dragTo(structure(page).getByRole('button', { name: 'Обрати: Контейнер B', exact: true }));
    const text = page.locator('.pb-node[data-label="Переносний текст"]'); await expect(text.locator('..')).toHaveAttribute('data-label', 'Контейнер B');
    await text.click(); await structure(page).getByRole('button', { name: 'Обгорнути в ряд', exact: true }).click();
    await expect(text.locator('..')).toHaveCSS('flex-direction', 'row');
    await structure(page).getByRole('button', { name: 'Видалити блок' }).click(); await expect(text).toHaveCount(0);
    await page.getByRole('button', { name: 'Скасувати зміну' }).click(); await expect(text.locator('..')).toHaveCSS('flex-direction', 'row');
  });
  test('exports and imports validated trees and rejects malformed imports without losing the current layout', async ({ page }) => {
    await openBuilder(page); await page.getByLabel('Назва макета').fill('Переносний макет');
    const pending = page.waitForEvent('download'); await page.getByRole('button', { name: 'Експорт JSON' }).click(); const download = await pending;
    const stream = await download.createReadStream(); const chunks: Buffer[] = []; for await (const chunk of stream!) chunks.push(Buffer.from(chunk)); const buffer = Buffer.concat(chunks);
    expect(JSON.parse(buffer.toString()).name).toBe('Переносний макет');
    await template(page, 'Чистий аркуш'); await page.getByLabel('Імпорт макета').setInputFiles({ name: 'layout.json', mimeType: 'application/json', buffer });
    await expect(page.getByLabel('Назва макета')).toHaveValue('Переносний макет');
    await page.getByLabel('Імпорт макета').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{"root":null}') });
    await expect(page.getByRole('status').filter({ hasText: 'Некоректна структура блока' })).toBeVisible();
    await expect(page.getByLabel('Назва макета')).toHaveValue('Переносний макет');
  });
  test('validates selectable and phone fields and hides mobile-only elements in testing', async ({ page }) => {
    await openBuilder(page); await template(page, 'Форма за промокод');
    const email = page.locator('.pb-node[data-block-type="field"]').nth(1); await email.click();
    await choose(page, 'Тип поля', 'Список'); await inspector(page).getByLabel('Підпис поля').fill('Ваш вибір');
    await page.getByRole('button', { name: 'Тестувати', exact: true }).click();
    let form = page.locator('.pb-artboard form');
    await form.getByRole('button', { name: 'Отримати промокод' }).click();
    await expect(form.getByRole('alert')).toHaveText('Обери варіант зі списку');
    await form.getByRole('button', { name: 'Ваш вибір', exact: true }).click(); await page.getByRole('option', { name: 'Варіант 1', exact: true }).click();
    await form.getByRole('button', { name: 'Отримати промокод' }).click(); await expect(page.locator('.pb-artboard').getByRole('status')).toContainText('HELLO10');
    await page.getByRole('button', { name: 'Редагувати', exact: true }).click();
    await choose(page, 'Тип поля', 'Телефон'); await inspector(page).getByLabel('Підпис поля').fill('Ваш телефон');
    await page.getByRole('button', { name: 'Тестувати', exact: true }).click(); form = page.locator('.pb-artboard form');
    await form.getByLabel('Ваш телефон').fill('abc'); await form.getByRole('button', { name: 'Отримати промокод' }).click(); await expect(form).toBeVisible();
    await form.getByLabel('Ваш телефон').fill('+380 (67) 123-45-67'); await form.getByRole('button', { name: 'Отримати промокод' }).click(); await expect(page.locator('.pb-artboard').getByRole('status')).toContainText('HELLO10');
    await page.getByRole('button', { name: 'Редагувати', exact: true }).click();
    const title = page.locator('.pb-node[data-label="Заголовок"]'); await title.click();
    await page.getByRole('button', { name: 'Mobile', exact: true }).click(); await inspector(page).getByRole('checkbox', { name: 'Приховати на цьому пристрої' }).check();
    await expect(title).toHaveAttribute('data-hidden', 'true');
    await page.getByRole('button', { name: 'Тестувати', exact: true }).click(); await expect(title).toHaveCount(0);
    await page.getByRole('button', { name: 'Desktop', exact: true }).click(); await expect(title).toBeVisible();
  });
  test('tests a nested form, countdown expiry and bounded zoom', async ({ page }, testInfo) => {
    await openBuilder(page); await template(page, 'Форма за промокод');
    await page.getByRole('button', { name: 'Тестувати', exact: true }).click();
    const form = page.locator('.pb-artboard form');
    await form.getByRole('button', { name: 'Отримати промокод' }).click(); await expect(form).toBeVisible();
    await form.getByLabel('Електронна пошта').fill('preview@example.com');
    await form.getByRole('button', { name: 'Отримати промокод' }).click(); await expect(page.locator('.pb-artboard').getByRole('status')).toContainText('HELLO10');
    await page.getByRole('button', { name: 'Редагувати', exact: true }).click(); await template(page, 'Акція з таймером');
    await page.locator('.pb-node[data-block-type="countdown"]').click();
    await choose(page, 'Режим таймера', 'До дати й часу'); await inspector(page).getByLabel('Дата завершення').fill('2020-01-01T12:00');
    await page.getByRole('button', { name: 'Тестувати', exact: true }).click(); await expect(page.getByText('Банер приховано', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Редагувати', exact: true }).click();
    await page.getByRole('button', { name: 'Розгорнути прев’ю' }).click(); await page.getByRole('button', { name: 'Mobile', exact: true }).click();
    await page.getByRole('button', { name: 'Збільшити масштаб' }).click(); const viewport = page.getByLabel('Навігація полотном');
    const scale = Number(await viewport.getAttribute('data-scale')); expect(scale).toBeGreaterThan(0.1); expect(scale).toBeLessThanOrEqual(3);
    await page.screenshot({ path: testInfo.outputPath('fullscreen-mobile.png'), animations: 'disabled' });
    await page.keyboard.press('Escape'); await expect(page.getByRole('main')).not.toHaveClass(/is-focus/);
  });
});

test.describe('nested builder mobile browser', () => {
  test.use({ viewport: devices['iPhone 13'].viewport, userAgent: devices['iPhone 13'].userAgent, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  test('switches panels, edits a block and retains fullscreen controls on touch devices', async ({ page }, testInfo) => {
    await openBuilder(page);
    await page.getByRole('navigation', { name: 'Панелі конструктора' }).getByRole('button', { name: 'Структура' }).click();
    await structure(page).getByRole('button', { name: 'Обрати: Банер', exact: true }).click();
    await expect(inspector(page)).toBeVisible(); await inspector(page).getByLabel('Назва в дереві').fill('Мобільний банер');
    await page.getByRole('navigation', { name: 'Панелі конструктора' }).getByRole('button', { name: 'Полотно' }).click();
    await page.getByRole('button', { name: 'Розгорнути прев’ю' }).click(); await page.getByRole('button', { name: 'Mobile', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Повернутися до редактора' })).toBeVisible();
    await expect(page.locator('.pb-node[data-label="Мобільний банер"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('touch-builder.png'), animations: 'disabled' });
    await page.getByRole('button', { name: 'Повернутися до редактора' }).click(); await expect(page.getByRole('main')).not.toHaveClass(/is-focus/);
  });
});
