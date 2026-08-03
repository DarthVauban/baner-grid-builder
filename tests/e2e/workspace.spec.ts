import { expect, test, type Page } from '@playwright/test';

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

test('anonymous users are redirected and the bootstrap admin can sign in', async ({ page }) => {
  await page.goto('/tools/banner-grid');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Увійти до простору' })).toBeVisible();
  await login(page);
});

test('admin can save a banner grid through the browser', async ({ page }) => {
  await login(page);
  await page.goto('/tools/banner-grid');
  await expect(page.getByRole('heading', { name: 'Банерна сітка' })).toBeVisible();

  await page.getByLabel('Назва банерної сітки').fill('E2E smoke grid');
  await page.getByLabel('Заголовок *').fill('E2E banner');
  await page.getByLabel('Дата завершення *').fill('2030-12-31');
  await page.getByLabel('Посилання на зображення *').fill('https://example.com/banner.jpg');
  await page.getByLabel('Посилання банера *').fill('https://example.com/sale');
  await page.getByRole('button', { name: 'Зберегти сітку' }).click();

  await expect(page.getByText('Сітку збережено.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Оновити сітку' })).toBeVisible();
});

test('critical protected modules render with live API data', async ({ page }) => {
  await login(page);

  const screens = [
    ['/tools', 'Інструменти'],
    ['/catalog/products', 'Каталог смартфонів'],
    ['/trade-in/overview', 'Стара техніка може стати частиною нової покупки'],
    ['/tools/applications', 'Заявки']
  ] as const;

  for (const [path, heading] of screens) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
  }
});

test('public storefront and store map entrypoints render', async ({ page }) => {
  await page.goto('/storefront');
  await expect(page.locator('#storefront-root')).toBeVisible();
  await expect(page.locator('#storefront-root h1')).toBeVisible();

  await page.goto('/store-map/widget');
  await expect(page.locator('#store-map-root')).toBeVisible();
  await expect(page.locator('.store-map-widget')).toBeVisible();
});
