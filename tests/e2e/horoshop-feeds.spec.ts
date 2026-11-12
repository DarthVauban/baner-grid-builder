import { devices, expect, test } from '@playwright/test';

for (const surface of [
  { name: 'desktop', device: devices['Desktop Chrome'] },
  { name: 'mobile', device: devices['iPhone 13'] }
]) {
  test.describe(`feed workflow ${surface.name}`, () => {
    test.use({ userAgent: surface.device.userAgent, viewport: surface.device.viewport,
      isMobile: surface.device.isMobile, hasTouch: surface.device.hasTouch, deviceScaleFactor: surface.device.deviceScaleFactor });

    test.beforeEach(async ({ page, request }) => {
      await request.post('/__e2e/horoshop-feeds/reset', { data: {} });
      await page.goto('/login');
      await page.getByLabel('Email').fill('e2e-admin@test.local');
      await page.locator('input[name="password"]').fill('E2E-admin-password-2026');
      await page.getByRole('button', { name: 'Увійти' }).click();
      await expect(page.getByRole('heading', { name: 'Вітаємо, E2E' })).toBeVisible();
      await page.goto('/tools/horoshop-feeds');
      await expect(page.getByRole('heading', { name: 'Товарні фіди' })).toBeVisible();
      await expect(page.getByText('Товари · 27', { exact: true })).toBeVisible();
    });
    test.afterEach(async ({ request }) => { await request.post('/__e2e/horoshop-feeds/clear'); });

    test('selects a page or the entire filtered catalog and retains other selections when a row is removed', async ({ page }, testInfo) => {
      const allOnPage = page.getByRole('checkbox', { name: 'Вибрати товари на сторінці' });
      await allOnPage.check();
      await expect(page.getByRole('region', { name: 'Дії з вибіркою' })).toContainText('25 товарів вибрано');
      await page.getByRole('checkbox', { name: 'Вибрати FEED-001', exact: true }).uncheck();
      await expect(page.getByRole('region', { name: 'Дії з вибіркою' })).toContainText('24 товарів вибрано');
      await expect(allOnPage).not.toBeChecked();
      expect(await allOnPage.evaluate((element: HTMLInputElement) => element.indeterminate)).toBe(true);
      await page.getByRole('button', { name: 'Вибрати всі 27 за фільтром' }).click();
      await expect(page.getByRole('region', { name: 'Дії з вибіркою' })).toContainText('27 товарів вибрано');
      await page.getByRole('checkbox', { name: 'Вибрати FEED-001', exact: true }).uncheck();
      await expect(page.getByRole('region', { name: 'Дії з вибіркою' })).toContainText('26 товарів вибрано');
      await page.getByRole('button', { name: 'Далі', exact: true }).click();
      await expect(page.getByRole('checkbox', { name: 'Вибрати FEED-027', exact: true })).toBeChecked();
      await page.getByRole('button', { name: 'Масова дія', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Масова дія', exact: true })).toContainText('26 товарів вибрано');
      await page.getByRole('button', { name: 'Скасувати', exact: true }).click();
      await expect(page.getByRole('region', { name: 'Дії з вибіркою' })).toContainText('26 товарів вибрано');
      await page.screenshot({ path: testInfo.outputPath(`feeds-${surface.name}-selection.png`) });
    });

    test('uses real preview, apply, worker, verification and history routes without intercepted application responses', async ({ page, request }, testInfo) => {
      await page.getByRole('checkbox', { name: 'Вибрати товари на сторінці' }).check();
      await page.getByRole('button', { name: 'Масова дія', exact: true }).click();
      const drawer = page.getByRole('dialog', { name: 'Масова дія', exact: true });
      await drawer.getByRole('button', { name: 'Дія: Google Merchant Center' }).click();
      await page.getByRole('option', { name: 'Додати до фіда', exact: true }).click();
      await drawer.getByRole('button', { name: 'Дія: Facebook', exact: true }).click();
      await page.getByRole('option', { name: 'Прибрати з фіда', exact: true }).click();
      await drawer.getByRole('button', { name: 'Перевірити зміни', exact: true }).click();
      const preview = page.getByRole('region', { name: 'Перегляд майбутніх змін' });
      await expect(page.getByRole('heading', { name: 'Перевірте зміни', exact: true })).toBeVisible();
      await expect(drawer).toHaveCount(0);
      await expect(preview.getByRole('button', { name: 'Застосувати зміни', exact: true })).toBeEnabled();
      await expect(preview).toContainText('Буде: Увімкнено');
      await expect(preview).toContainText('Буде: Вимкнено');
      const before = await (await request.get('/__e2e/horoshop-feeds/state')).json();
      expect(before.exports).toBe(0);
      expect(before.imports).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`feeds-${surface.name}-preview.png`) });
      await preview.getByRole('button', { name: 'Застосувати зміни', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Результат операції', exact: true })).toBeVisible();
      await expect(page.getByText('Завершено', { exact: true }).first()).toBeVisible();
      const after = await (await request.get('/__e2e/horoshop-feeds/state')).json();
      expect(after.exports).toBeGreaterThanOrEqual(2);
      expect(after.imports.flat()).toHaveLength(26);
      expect(after.remote.find((offer: { article: string }) => offer.article === 'FEED-001-BLACK').export_to_marketplace).toBe('Google Feed for Merchant Center;Rozetka Feed');
      expect(after.remote.find((offer: { article: string }) => offer.article === 'FEED-027').export_to_marketplace).toBe('Facebook Feed;Rozetka Feed');
      await page.getByRole('button', { name: 'До історії', exact: true }).click();
      await expect(page.getByRole('table').getByRole('row').filter({ hasText: 'Завершено' })).toContainText('25 із 25');
      await page.getByRole('button', { name: 'Деталі', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Результат операції', exact: true })).toBeVisible();
      await expect(page.getByRole('table')).toContainText('Було: Увімкнено');
    });

    test('shows an actionable failure and records it in history when Horoshop cannot provide feed settings', async ({ page, request }) => {
      await request.post('/__e2e/horoshop-feeds/reset', { data: { mode: 'missing' } });
      await page.reload();
      await page.getByRole('row').filter({ hasText: 'FEED-001' }).getByRole('button', { name: 'Змінити', exact: true }).click();
      await page.getByRole('button', { name: 'Дія: Google Merchant Center', exact: true }).click();
      await page.getByRole('option', { name: 'Додати до фіда', exact: true }).click();
      await page.getByRole('button', { name: 'Перевірити зміни', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Перевірте зміни', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Застосувати зміни', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Результат операції', exact: true })).toBeVisible();
      await expect(page.getByRole('alert')).toContainText('API Хорошопа не надав поточні налаштування фідів');
      expect((await (await request.get('/__e2e/horoshop-feeds/state')).json()).imports).toEqual([]);
      await page.getByRole('button', { name: 'До історії', exact: true }).click();
      await expect(page.getByRole('table').getByRole('row').filter({ hasText: 'Помилка' })).toContainText('0 із 1');
    });

    test('combines Google and Facebook status filters and selects only matching products for preview', async ({ page, request }, testInfo) => {
      if (surface.name === 'desktop') await page.setViewportSize({ width: 1920, height: 1080 });
      await request.post('/__e2e/horoshop-feeds/reset', { data: { withFeedStatuses: true } });
      await page.reload();
      const setStatus = async (channel: string, label: string) => {
        await page.getByRole('button', { name: `Статус: ${channel}`, exact: true }).click();
        await expect(page.getByRole('option')).toHaveText(['Увімкнено', 'Вимкнено']);
        await page.getByRole('option', { name: label, exact: true }).click();
      };
      await setStatus('Google Merchant Center', 'Увімкнено');
      await setStatus('Facebook', 'Вимкнено');
      await expect(page.getByText('Товари · 1', { exact: true })).toBeVisible();
      await expect(page.getByRole('checkbox', { name: 'Вибрати FEED-003', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Вибрати всі 1 за фільтром', exact: true }).click();
      await expect(page.getByRole('region', { name: 'Дії з вибіркою' })).toContainText('1 товарів вибрано');
      await setStatus('Facebook', 'Увімкнено');
      await expect(page.getByText('Товари · 0', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Масова дія', exact: true })).toBeDisabled();
      await setStatus('Facebook', 'Вимкнено');
      await expect(page.getByText('Товари · 1', { exact: true })).toBeVisible();
      await expect(page.getByRole('checkbox', { name: 'Вибрати FEED-003', exact: true })).toBeVisible();
      await expect(page.getByRole('checkbox', { name: 'Вибрати FEED-001', exact: true })).toHaveCount(0);
      await page.screenshot({ path: testInfo.outputPath(`feeds-${surface.name}-status-filters.png`), fullPage: true });
      await page.getByRole('button', { name: 'Вибрати всі 1 за фільтром', exact: true }).click();
      await page.getByRole('button', { name: 'Масова дія', exact: true }).click();
      await page.getByRole('button', { name: 'Дія: Facebook', exact: true }).click();
      await page.getByRole('option', { name: 'Додати до фіда', exact: true }).click();
      await page.getByRole('button', { name: 'Перевірити зміни', exact: true }).click();
      const preview = page.getByRole('region', { name: 'Перегляд майбутніх змін' });
      await expect(preview).toContainText('FEED-003');
      await expect(preview).not.toContainText('FEED-001');
      await expect(preview).toContainText('Було: Вимкнено');
      const before = await (await request.get('/__e2e/horoshop-feeds/state')).json();
      expect(before.exports).toBe(0); expect(before.imports).toEqual([]);
      await preview.getByRole('button', { name: 'Повернутися', exact: true }).click();
      await page.getByRole('button', { name: 'Скинути фільтр: Facebook', exact: true }).click();
      await expect(page.getByText('Товари · 1', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Статус: Facebook', exact: true })).toHaveText('Оберіть статус');
      await page.getByRole('button', { name: 'Скинути фільтр: Google Merchant Center', exact: true }).click();
      await expect(page.getByText('Товари · 27', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Статус: Google Merchant Center', exact: true })).toHaveText('Оберіть статус');
      await expect(page.getByRole('checkbox', { name: 'Вибрати FEED-004', exact: true })).toBeVisible();
    });
  });
}
