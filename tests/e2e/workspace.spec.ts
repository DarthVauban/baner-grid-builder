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

test('admin can build, preview, save and export a blog article', async ({ page }) => {
  await login(page);
  await page.goto('/tools/blog-publications');
  await page.getByRole('button', { name: 'Нова публікація' }).click();
  await page.getByRole('textbox', { name: 'Робоча назва' }).fill('E2E blog editor article');
  await page.getByRole('textbox', { name: 'Опис та інструкції' }).fill('Editor end-to-end description.');
  await page.getByRole('button', { name: 'Створити картку' }).click();

  await page.locator('.publication-card').filter({ hasText: 'E2E blog editor article' }).getByRole('link', { name: 'Стаття' }).click();
  await expect(page.getByRole('heading', { name: 'E2E blog editor article' })).toBeVisible();
  await expect(page.getByTitle('Попередній перегляд статті')).toBeVisible();

  await page.getByLabel('Тип нового блоку').selectOption('faq');
  await page.getByRole('button', { name: 'Додати блок' }).click();
  const preview = page.frameLocator('iframe[title="Попередній перегляд статті"]');
  const previewFaq = preview.locator('.mt-blog-faq-item');
  await expect(previewFaq).toHaveAttribute('open', '');
  await preview.locator('.mt-blog-faq-question').click();
  await expect(previewFaq).not.toHaveAttribute('open', '');

  await page.getByRole('button', { name: 'Зберегти' }).click();
  await expect(page.getByText('Чернетку статті збережено.')).toBeVisible();
  await page.reload();
  await expect(page.locator('.blog-editor-block > header > span').filter({ hasText: /^FAQ$/ })).toBeVisible();

  await page.getByRole('button', { name: 'Код', exact: true }).click();
  const output = page.getByRole('textbox', { name: 'Згенерований код' });
  expect(await output.inputValue()).toContain('class="mt-blog-post"');
  expect(await output.inputValue()).toContain("querySelectorAll('a[href^=\"http\"]')");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
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
