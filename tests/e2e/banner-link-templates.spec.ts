import { devices, expect, test } from '@playwright/test';

for (const surface of [
  { name: 'desktop', device: devices['Desktop Chrome'] },
  { name: 'mobile', device: devices['iPhone 13'] }
]) {
  test.describe(`banner link templates ${surface.name}`, () => {
    test.use({ userAgent: surface.device.userAgent, viewport: surface.device.viewport,
      isMobile: surface.device.isMobile, hasTouch: surface.device.hasTouch, deviceScaleFactor: surface.device.deviceScaleFactor });

    test('creates a reusable base address and composes a banner link', async ({ page }) => {
      await page.goto('/login');
      await page.getByLabel('Email').fill('e2e-admin@test.local');
      await page.locator('input[name="password"]').fill('E2E-admin-password-2026');
      await page.getByRole('button', { name: 'Увійти' }).click();
      await expect(page.getByRole('heading', { name: 'Вітаємо, E2E' })).toBeVisible();
      await page.goto('/tools/banner-grid');
      await expect(page.getByRole('heading', { name: 'Дані банерів' })).toBeVisible();

      await page.getByRole('button', { name: 'Налаштувати шаблони' }).click();
      await page.getByRole('textbox', { name: 'Назва шаблону' }).fill(`Mobile Trend ${surface.name}`);
      await page.getByRole('textbox', { name: 'Базова адреса' }).fill('https://mobiletrend.com.ua/');
      await page.getByRole('button', { name: 'Додати шаблон' }).click();
      const templateSelect = page.getByRole('button', { name: 'Шаблон посилання банера' });
      await templateSelect.click();
      await page.getByRole('option', { name: `Mobile Trend ${surface.name} · https://mobiletrend.com.ua` }).click();
      await page.getByRole('textbox', { name: 'Шлях сторінки' }).fill('/teplo-vyhidnykh-pokupok/');
      await expect(page.locator('.banner-link-field output')).toHaveText('https://mobiletrend.com.ua/teplo-vyhidnykh-pokupok/');
      await page.reload();
      await page.getByRole('button', { name: 'Шаблон посилання банера' }).click();
      await expect(page.getByRole('option', { name: `Mobile Trend ${surface.name} · https://mobiletrend.com.ua` })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    });
  });
}
