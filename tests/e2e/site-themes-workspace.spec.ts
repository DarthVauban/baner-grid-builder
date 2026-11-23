import { expect, test } from '@playwright/test';
import type { SiteTheme, SiteThemeInput } from '../../client/src/types/site-theme';

test('the theme tool opens without the workspace sidebar and saves a draft with device-specific preview', async ({ page }) => {
  let draft: SiteTheme | null = null;
  await page.route('**/api/site-themes', (route) => {
    if (route.request().method() === 'POST') {
      const input = route.request().postDataJSON() as SiteThemeInput;
      draft = {
        ...input,
        id: 'b3468f76-57bc-4b3e-b976-9db8b60ecf91',
        promoBarEnabled: true,
        active: false,
        publishedAt: null,
        hasUnpublishedChanges: true,
        createdAt: '2026-11-23T12:00:00.000Z',
        updatedAt: '2026-11-23T12:00:00.000Z'
      };
      return route.fulfill({ status: 201, json: { data: draft } });
    }
    return draft ? route.fulfill({ json: { data: [draft] } }) : route.continue();
  });

  await page.goto('/login');
  await page.getByLabel('Email').fill('e2e-admin@test.local');
  await page.locator('input[name="password"]').fill('E2E-admin-password-2026');
  await page.getByRole('button', { name: 'Увійти', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Вітаємо, E2E' })).toBeVisible();

  const sidebar = page.getByRole('complementary', { name: 'Головне меню' });
  await sidebar.getByRole('link', { name: 'Інструменти', exact: true }).click();
  await page.getByRole('link', { name: /^Віджети для Хорошопа/u }).click();
  await expect(page.getByRole('heading', { name: 'Віджети Хорошопа' })).toBeVisible();
  await page.getByRole('link', { name: /^Теми сайту/u }).click();

  await expect(page).toHaveURL(/\/tools\/site-themes$/u);
  await expect(page.getByRole('heading', { name: 'Теми сайту', exact: true })).toBeVisible();
  await expect(sidebar).toHaveCount(0);
  await page.getByRole('button', { name: 'Створити тему' }).click();
  await expect(page.getByRole('switch', { name: 'Показувати верхню промосмугу' })).toBeVisible();

  const themeName = 'Зимова акція';
  const offer = 'Знижки на смартфони';
  await page.getByLabel('Назва теми').fill(themeName);
  await page.getByLabel('Текст промосмуги').fill(offer);
  await page.getByLabel('Текст кнопки').fill('До акцій');
  await page.getByLabel('Посилання кнопки').fill('/sale/');
  const preview = page.getByRole('region', { name: 'Попередній перегляд' });
  await expect(preview.getByText(offer, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Стилі', exact: true }).click();
  await page.getByRole('button', { name: 'Вирівнювання' }).click();
  await page.getByRole('option', { name: 'Праворуч' }).click();
  await expect(preview.locator('.site-themes__bar-inner')).toHaveCSS('justify-content', 'flex-end');
  await page.getByRole('spinbutton', { name: 'Розмір тексту промосмуги, px' }).fill('23');
  await page.getByRole('button', { name: 'Насиченість тексту промосмуги' }).click();
  await page.getByRole('option', { name: '700', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Розмір тексту кнопки, px' }).fill('19');
  await page.getByRole('button', { name: 'Насиченість тексту кнопки' }).click();
  await page.getByRole('option', { name: '800', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Вертикальні відступи кнопки, px' }).fill('11');
  await page.getByRole('spinbutton', { name: 'Горизонтальні відступи кнопки, px' }).fill('19');
  await expect(preview.getByText(offer, { exact: true })).toHaveCSS('font-size', '23px');
  await expect(preview.getByText(offer, { exact: true })).toHaveCSS('font-weight', '700');
  const previewButton = preview.getByText('До акцій', { exact: true });
  await expect(previewButton).toHaveCSS('font-size', '19px');
  await expect(previewButton).toHaveCSS('font-weight', '800');
  await expect(previewButton).toHaveCSS('padding', '11px 19px');
  await preview.getByRole('button', { name: 'Мобільний' }).click();
  await expect(preview.getByText(offer, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Показ', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Показувати на мобільному' }).uncheck();
  await expect(preview.getByText(offer, { exact: true })).toHaveCount(0);
  await preview.getByRole('button', { name: 'Десктоп' }).click();
  await expect(preview.getByText(offer, { exact: true })).toBeVisible();

  const [created] = await Promise.all([
    page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/site-themes')),
    page.getByRole('button', { name: 'Зберегти чернетку' }).click()
  ]);
  expect(created.status()).toBe(201);
  const input = created.request().postDataJSON() as SiteThemeInput;
  expect(input.name).toBe(themeName);
  expect(input.promoBar).toMatchObject({
    text: offer,
    alignment: 'right',
    textFontSize: 23,
    textFontWeight: 700,
    buttonFontSize: 19,
    buttonFontWeight: 800,
    buttonPaddingY: 11,
    buttonPaddingX: 19,
    showDesktop: true,
    showMobile: false
  });
  await page.getByRole('button', { name: 'Бібліотека тем' }).click();
  await expect(page.getByRole('heading', { name: themeName })).toBeVisible();

  await page.getByRole('button', { name: 'До інструментів' }).click();
  await expect(page).toHaveURL(/\/tools$/u);
  await expect(sidebar).toBeVisible();
});
