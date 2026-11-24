import { expect, test } from '@playwright/test';
import type { SiteTheme, SiteThemeInput } from '../../client/src/types/site-theme';

test('the theme tool opens without the workspace sidebar and saves a draft with device-specific preview', async ({ page }) => {
  let draft: SiteTheme | null = null;
  const backgroundImageUrl = '/media/catalog/library/promo.webp';
  await page.route('**/api/site-themes/background-image', (route) => route.fulfill({
    status: 201, json: { data: { url: backgroundImageUrl } }
  }));
  await page.route('**/api/site-themes', (route) => {
    if (route.request().method() === 'POST') {
      const input = route.request().postDataJSON() as SiteThemeInput;
      draft = {
        ...input,
        id: 'b3468f76-57bc-4b3e-b976-9db8b60ecf91',
        promoBarEnabled: true,
        goldGlintEnabled: true,
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
  await page.route('**/api/site-themes/*/effects/gold-glint/visibility', (route) => {
    if (!draft) return route.abort();
    draft = { ...draft, goldGlintEnabled: route.request().postDataJSON().enabled };
    return route.fulfill({ json: { data: draft } });
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
  await expect.poll(() => preview.locator('.site-themes__bar-inner').evaluate((bar) => {
    const rightEdge = bar.getBoundingClientRect().right - Number.parseFloat(getComputedStyle(bar).paddingRight);
    return Math.abs(rightEdge - bar.lastElementChild!.getBoundingClientRect().right);
  })).toBeLessThan(1);
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
  const imageField = page.getByLabel('Посилання на фонове зображення');
  await imageField.fill('https://images.example.test/promo.webp');
  await expect(preview.locator('.site-themes__bar')).toHaveCSS('background-image', 'url("https://images.example.test/promo.webp")');
  await page.getByRole('button', { name: 'Прибрати фонове зображення' }).click();
  await expect(preview.locator('.site-themes__bar')).toHaveCSS('background-image', 'none');
  await page.getByLabel('Завантажити фонове зображення').setInputFiles({
    name: 'promo.png', mimeType: 'image/png', buffer: Buffer.from('test upload')
  });
  await expect(imageField).toHaveValue(backgroundImageUrl);

  await page.getByRole('button', { name: 'Контент', exact: true }).click();
  await page.getByRole('button', { name: 'Біжучий текст', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Швидкість тексту, px/с' }).fill('120');
  await expect(previewButton).toHaveCount(0);
  await expect(preview.locator('[data-mt-site-promo-track]')).toBeVisible();
  await page.getByRole('button', { name: 'Текст і кнопка', exact: true }).click();
  await expect(previewButton).toBeVisible();
  await page.getByRole('button', { name: 'Біжучий текст', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Швидкість тексту, px/с' })).toHaveValue('120');

  await preview.getByRole('button', { name: 'Мобільний' }).click();
  await expect(preview.locator('[data-mt-site-promo-track]')).toBeVisible();
  await page.getByRole('button', { name: 'Показ', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Показувати на мобільному' }).uncheck();
  await expect(preview.getByText(offer, { exact: true })).toHaveCount(0);
  await preview.getByRole('button', { name: 'Десктоп' }).click();
  await expect(preview.locator('[data-mt-site-promo-track]')).toBeVisible();

  await page.getByRole('button', { name: 'Бібліотека ефектів' }).click();
  await expect(page.getByRole('heading', { name: 'Чорна п’ятниця' })).toBeVisible();
  await page.getByRole('button', { name: 'Додати відблиск' }).click();
  await page.getByRole('slider', { name: 'Яскравість відблиску' }).press('End');
  await page.getByRole('slider', { name: 'Тривалість проходу' }).press('End');
  await page.getByRole('button', { name: 'З інтервалом' }).click();
  await page.getByRole('slider', { name: 'Інтервал повторення' }).press('Home');
  await page.getByRole('button', { name: 'Відтворити ефект' }).click();
  const glint = preview.locator('[data-mt-site-promo-gold-glint]');
  await expect(glint).toBeVisible();
  await expect(glint.locator('div')).toHaveCSS('opacity', '1');

  const [created] = await Promise.all([
    page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/api/site-themes')),
    page.getByRole('button', { name: 'Зберегти чернетку' }).click()
  ]);
  expect(created.status()).toBe(201);
  const input = created.request().postDataJSON() as SiteThemeInput;
  expect(input.name).toBe(themeName);
  expect(input.promoBar).toMatchObject({
    text: offer,
    mode: 'marquee',
    marqueeSpeed: 120,
    backgroundImageUrl,
    goldGlint: { color: '#ffcc48', intensity: 100, durationMs: 4000, repeat: 'interval', intervalSeconds: 5 },
    buttonText: 'До акцій',
    buttonUrl: '/sale/',
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
  const glintSwitch = page.getByRole('switch', { name: 'Показувати золотий відблиск' });
  await expect(glintSwitch).toHaveAttribute('aria-checked', 'true');
  await glintSwitch.click();
  await expect(glintSwitch).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByText('Є незбережені зміни', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Бібліотека тем' }).click();
  await expect(page.getByRole('heading', { name: themeName })).toBeVisible();

  await page.getByRole('button', { name: 'До інструментів' }).click();
  await expect(page).toHaveURL(/\/tools$/u);
  await expect(sidebar).toBeVisible();
});
