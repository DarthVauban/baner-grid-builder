import { devices, expect, test } from '@playwright/test';
import type { StickerCatalog, StickerOperation, StickerPreparationProgress, StickerPreviewInput } from '../../client/src/types/horoshop-sticker';

const productId = '11111111-1111-4111-8111-111111111111';
const operationId = '33333333-3333-4333-8333-333333333333';
const catalog: StickerCatalog = {
  items: [{ id: productId, externalId: '101', sku: '0001', titles: { uk: 'Телефон' }, brand: 'Apple', categoryExternalId: 'phones', price: '100', availability: 'В наявності', visible: true, imageUrl: null, canonicalUrl: null, stickers: [{ id: '1', title: 'Хіт' }], horoshopCreatedAt: '2026-09-01', modifications: [] }],
  total: 1, page: 1, pageSize: 25, pageCount: 1, storeDomain: 'shop.example.com', lastSyncAt: null,
  categories: [{ externalId: 'phones', parentExternalId: null, title: 'Телефони' }], brands: ['Apple'], availabilityOptions: ['В наявності'],
  directory: [{ externalId: '1', title: 'Хіт', enabled: true }, { externalId: '11', title: 'Акція', enabled: true }]
};
const preview: StickerOperation = {
  id: operationId, name: 'Зміна стікерів', kind: 'change', parentId: null, actorName: 'Адмін', createdAt: '2026-09-28T10:00:00Z', startedAt: null, completedAt: null,
  status: 'draft', stopRequested: false, counts: { pending: 1 }, total: 1, page: 1, pageCount: 1,
  items: [{ id: 'item', productId, externalId: '101', article: '0001', title: 'Телефон', membership: ['0001'], before: [{ id: '1', title: 'Хіт' }], after: [{ id: '11', title: 'Акція' }], addIds: ['11'], removeIds: ['1'], status: 'pending', message: '' }]
};
type PreparationWindow = Window & typeof globalThis & {
  stickerWriter?: ReadableStreamDefaultController<Uint8Array>; stickerHeartbeat?: number; stickerInput?: StickerPreviewInput;
};

for (const surface of [
  { name: 'desktop', device: devices['Desktop Chrome'] },
  { name: 'mobile', device: devices['iPhone 13'] }
]) {
  test.describe(`sticker tool ${surface.name}`, () => {
    test.use({ userAgent: surface.device.userAgent, viewport: surface.device.viewport,
      isMobile: surface.device.isMobile, hasTouch: surface.device.hasTouch, deviceScaleFactor: surface.device.deviceScaleFactor });

    test('loads products and recovers sticker choices when a filter is opened during catalog loading', async ({ page }, testInfo) => {
      await page.goto('/login');
      await page.getByLabel('Email').fill('e2e-admin@test.local');
      await page.locator('input[name="password"]').fill('E2E-admin-password-2026');
      await page.getByRole('button', { name: 'Увійти' }).click();
      await expect(page.getByRole('heading', { name: 'Вітаємо, E2E' })).toBeVisible();

      let releaseCatalog!: () => void;
      const loadingCatalog = new Promise<void>((resolve) => { releaseCatalog = resolve; });
      const catalogRequests: Array<{ mode: string | null; sticker: string | null }> = [];
      let refreshed = false;
      let writes = 0;
      await page.route('**/api/users/tool-access', (route) => route.fulfill({ json: { data: ['horoshop_stickers'] } }));
      await page.route('**/api/search/horoshop/stickers/**', async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname.endsWith('/directory/refresh')) {
          refreshed = true;
          return route.fulfill({ json: { data: { refreshed: true } } });
        }
        if (url.pathname.endsWith('/catalog')) {
          const mode = url.searchParams.get('stickerMode');
          const sticker = url.searchParams.get('stickerId');
          catalogRequests.push({ mode, sticker });
          if (catalogRequests.length === 1) await loadingCatalog;
          const items = catalog.items.filter((product) => mode === 'present' ? product.stickers.some((item) => item.id === sticker)
            : mode === 'missing' ? !product.stickers.some((item) => item.id === sticker) : true);
          return route.fulfill({ json: { data: { ...catalog, items, total: items.length, pageCount: items.length ? 1 : 0,
            directory: refreshed ? catalog.directory : [], directoryWarning: refreshed ? null : 'Довідник тимчасово недоступний.' } } });
        }
        if (url.pathname.includes('/operations/')) writes += 1;
        return route.fulfill({ json: { data: [] } });
      });

      await page.goto('/tools/horoshop-stickers');
      await expect(page.getByText('Завантажуємо товари…')).toBeVisible();
      await page.getByRole('button', { name: 'Стікери', exact: true }).click();
      await page.getByRole('option', { name: 'Має вибраний стікер' }).click();
      await expect(page.getByText('Оберіть стікер для фільтра.')).toBeVisible();
      releaseCatalog();
      await expect(page.getByLabel('Обрати 0001')).toBeDisabled();
      await expect(page.getByText('1 товарних груп', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Вибрати всі 1 за фільтром' })).toBeDisabled();
      await page.getByRole('button', { name: 'Оновити', exact: true }).click();
      await expect(page.getByText('Довідник тимчасово недоступний.')).toHaveCount(0);
      await page.getByRole('button', { name: 'Стікер для фільтра', exact: true }).click();
      await expect(page.getByRole('option', { name: 'Хіт', exact: true })).toBeVisible();
      await expect(page.getByRole('option', { name: 'Акція', exact: true })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('sticker-options.png'), fullPage: true });
      await page.getByRole('option', { name: 'Хіт', exact: true }).click();
      await expect(page.getByLabel('Обрати 0001')).toBeEnabled();
      await page.getByRole('button', { name: 'Стікери', exact: true }).click();
      await page.getByRole('option', { name: 'Не має вибраного стікера' }).click();
      await expect(page.getByText('За цими умовами товарів немає.')).toBeVisible();
      await page.getByRole('button', { name: 'Стікер для фільтра', exact: true }).click();
      await page.getByRole('option', { name: 'Акція', exact: true }).click();
      await expect(page.getByLabel('Обрати 0001')).toBeEnabled();
      expect(catalogRequests).toEqual(expect.arrayContaining([{ mode: 'present', sticker: '1' }, { mode: 'missing', sticker: '1' }, { mode: 'missing', sticker: '11' }]));
      expect(catalogRequests.every(({ mode, sticker }) => !['present', 'missing'].includes(mode || '') || !!sticker)).toBe(true);
      expect(writes).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    });

    test('keeps preparation visible through failed access checks, then reviews and applies once', async ({ page }, testInfo) => {
      await page.goto('/login');
      await page.getByLabel('Email').fill('e2e-admin@test.local');
      await page.locator('input[name="password"]').fill('E2E-admin-password-2026');
      await page.getByRole('button', { name: 'Увійти' }).click();
      await expect(page.getByRole('heading', { name: 'Вітаємо, E2E' })).toBeVisible();

      let failAccess = false;
      let accessFailures = 0;
      let publications = 0;
      let operation = structuredClone(preview);
      await page.route('**/api/users/tool-access', (route) => {
        if (failAccess) accessFailures += 1;
        return route.fulfill({ status: failAccess ? 503 : 200, json: failAccess ? { error: { code: 'SERVICE_UNAVAILABLE', message: 'Тимчасова помилка.' } } : { data: ['horoshop_stickers'] } });
      });
      await page.route('**/api/search/horoshop/stickers/**', (route) => {
        const path = new URL(route.request().url()).pathname;
        const data = path.endsWith('/catalog') ? catalog
          : path.endsWith('/selection/summary') ? { total: 1, stickers: [{ ...catalog.directory[0], productCount: 1 }] }
          : path.endsWith('/selections') || path.endsWith('/operations') ? [] : operation;
        if (path.endsWith('/apply')) {
          publications += 1;
          operation = { ...operation, status: 'queued' };
          return route.fulfill({ status: 202, json: { data: operation } });
        }
        return route.fulfill({ json: { data } });
      });
      // An open browser stream lets us assert progress before the result arrives.
      await page.addInitScript(() => {
        const preparationWindow = window as PreparationWindow;
        const fetchOriginal = window.fetch.bind(window);
        window.fetch = async (input, init) => {
          const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
          if (!url.endsWith('/operations/preview/stream')) return fetchOriginal(input, init);
          preparationWindow.stickerInput = JSON.parse(String(init?.body));
          const body = new ReadableStream<Uint8Array>({ start(writer) {
            preparationWindow.stickerWriter = writer;
            preparationWindow.stickerHeartbeat = window.setInterval(() => writer.enqueue(new TextEncoder().encode('\n')), 10_000);
            writer.enqueue(new TextEncoder().encode(`${JSON.stringify({ type: 'progress', data: { stage: 'comparing', total: 1, processed: 0, productsRead: 0, pagesRead: 0 } })}\n`));
          } });
          return new Response(body, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } });
        };
      });
      await page.clock.install();
      await page.goto('/tools/horoshop-stickers');
      await page.getByLabel('Обрати 0001').check();
      await page.getByRole('tab', { name: 'Стікери', exact: true }).click();
      await page.getByLabel('Додати стікери: Акція').check();
      await page.getByLabel('Зняти стікери: Хіт').check();
      await page.getByRole('button', { name: 'Переглянути зміни' }).click();
      const preparation = page.getByRole('region', { name: 'Підготовка операції' });
      await expect(preparation).toBeVisible();
      await expect(preparation.getByRole('status')).toContainText('0 / 1 товарних груп');
      await expect(page.getByRole('button', { name: 'Зняти вибір', exact: true })).toBeDisabled();
      expect(publications).toBe(0);

      failAccess = true;
      await page.clock.runFor(31_000);
      await expect.poll(async () => { await page.clock.runFor(2_000); return accessFailures; }).toBeGreaterThanOrEqual(2);
      await page.clock.runFor(1_000);
      await expect(page).toHaveURL(/\/tools\/horoshop-stickers$/);
      await expect(preparation).toBeVisible();
      await page.getByRole('tab', { name: 'Історія', exact: true }).click();
      await expect(preparation).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Історія операцій' })).toBeVisible();
      const progress: StickerPreparationProgress = { stage: 'comparing', total: 1, processed: 1, productsRead: 0, pagesRead: 0 };
      await page.evaluate((progress) => {
        (window as PreparationWindow).stickerWriter?.enqueue(new TextEncoder().encode(`${JSON.stringify({ type: 'progress', data: progress })}\n`));
      }, progress);
      await expect(preparation.getByRole('progressbar')).toHaveAttribute('value', '1');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath('preparation.png'), fullPage: true });

      await page.evaluate((preview) => {
        const preparationWindow = window as PreparationWindow;
        window.clearInterval(preparationWindow.stickerHeartbeat);
        preparationWindow.stickerWriter?.enqueue(new TextEncoder().encode(`${JSON.stringify({ type: 'result', data: preview })}\n`));
        preparationWindow.stickerWriter?.close();
      }, preview);
      const dialog = page.getByRole('dialog', { name: 'Зміна стікерів' });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText(/Перегляд створено за останнім синхронізованим каталогом/u)).toBeVisible();
      await expect(preparation).toHaveCount(0);
      expect(await page.evaluate(() => (window as PreparationWindow).stickerInput)).toMatchObject({ productIds: [productId], addIds: ['11'], removeIds: ['1'] });
      await expect(dialog.getByText('+ Акція')).toBeVisible();
      await expect(dialog.getByText('− Хіт')).toBeVisible();
      expect(publications).toBe(0);
      await dialog.getByRole('button', { name: 'Застосувати зміни (1)' }).click();
      await expect(dialog.getByText('У черзі', { exact: true })).toBeVisible();
      expect(publications).toBe(1);
    });
  });
}
