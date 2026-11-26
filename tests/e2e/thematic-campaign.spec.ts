import { test, expect, devices } from '@playwright/test';
import { productPromoLoaderScript, productSelectionEmbedScript } from '../../src/modules/product-selections/product-selection.embed.js';
import { campaignStyles, mountCampaign } from '../../src/modules/product-selections/campaign.embed.js';

const shop = 'https://campaign-shop.test';
const workspace = 'https://campaign-workspace.test';
const trimmersName = 'Машинки для стрижки та тримери';
const campaign = { id: 'winter', revision: 1, name: 'Різдво', sections: [
  { id: 'phones', name: 'Телефони', count: 25, brands: ['Nokia', 'Samsung', 'Sony'] },
  { id: 'audio', name: 'Аудіо', count: 1, brands: ['JBL'] },
  { id: 'trimmers', name: trimmersName, count: 44, brands: [] }
] };
for (const mobile of [false, true]) {
  test.describe(mobile ? 'mobile campaign' : 'desktop campaign', () => {
    const device = devices[mobile ? 'Pixel 7' : 'Desktop Chrome'];
    test.use({ viewport: device.viewport, userAgent: device.userAgent, isMobile: mobile, hasTouch: mobile });
    test.beforeEach(async ({ page }) => {
      const article = (title: string, content: string) => mobile
        ? `<section class="blog wrapper"><div class="blog__inner"><nav class="breadcrumbs">Каталог</nav>
            <h1 class="heading heading--xl">${title}</h1><div class="catalog__banners"></div><div class="text">${content}</div></div></section>`
        : `<section class="page"><nav class="breadcrumbs">Каталог</nav><h1 class="main-h">${title}</h1>
            <div class="page-content"><div class="article-text __fullWidth text">${content}</div></div></section>`;
      await page.route(shop + '/sale**', (route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body:
        `<meta name="viewport" content="width=device-width,initial-scale=1"><style>.text a:hover { color: #4a4a4a }</style>
        <header><input placeholder="Пошук магазину"></header><main id="main">
        ${article('Акційні добірки товарів', '<script async src="' + workspace + '/winter/embed.js"></script>')}
        ${article('Інша стаття', '')}</main>
        <script>let added;window.AjaxCart={getInstance:()=>({getProductById:()=>added,appendProduct:()=>{added={quantity:1}}})}</script>`
      }));
      await page.route(workspace + '/winter/embed.js', (route) => route.fulfill({ contentType: 'application/javascript; charset=utf-8',
        body: productSelectionEmbedScript(campaign, '', { styles: campaignStyles, mount: mountCampaign }) }));
    });
    test('hides the blog heading, comments and sidebar around the campaign', async ({ page }) => {
      const commentsSelector = mobile ? '.blog__comments' : '#comments-container';
      const commentForm = '<form><label>Новий коментар<textarea></textarea></label></form>';
      const commentsBlock = mobile ? `<div class="blog__comments">${commentForm}</div>`
        : `<div id="comments-container" class="reviews">${commentForm}</div>`;
      const article = (title: string, content = '', comments = '') => mobile
        ? `<section class="blog wrapper"><div class="blog__inner"><div class="article">
            <nav class="breadcrumbs">Підбірки товарів</nav><h1 class="heading heading--xl">${title}</h1>
            <div class="article-meta">Дата публікації</div><div class="text">${content}</div>${comments}
          </div></div></section>`
        : `<div class="wrapper"><div class="layout"><div class="layout-main"><div class="layout-main-inner">
            <section class="page"><div class="article"><nav class="breadcrumbs">Підбірки товарів</nav>
            <h1 class="main-h">${title}</h1><div class="article__meta">Дата публікації</div>
            <div class="article-text __fullWidth text">${content}</div>${comments}</div></section>
          </div></div><aside class="layout-aside"><nav class="sideMenu">Меню: ${title}</nav></aside></div></div>`;
      const embed = `<script async src="${workspace}/winter/embed.js"></script>`;
      await page.route(shop + '/blog-*', (route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body:
        `<meta name="viewport" content="width=device-width,initial-scale=1"><style>
          .layout { display: flex } .layout-main { flex: 1 1 auto; min-width: 0 }
          .layout-main-inner { padding-left: 20px } .layout-aside { order: -1; flex: 0 0 220px }
        </style><header>Шапка магазину</header><main id="main">
        ${article('Чорна п’ятниця', route.request().url() === shop + '/blog-sale' ? embed : '', commentsBlock)}
        ${article('Інша стаття')}</main>`
      }));
      await page.route(workspace + '/winter/products?**', (route) => route.fulfill({
        headers: { 'access-control-allow-origin': '*' }, json: { data: { products: [], total: 0, nextCursor: null } }
      }));
      await page.goto(shop + '/blog-sale');
      const root = page.locator('.mt-campaign');
      const host = page.locator('.article').filter({ has: root });
      const other = page.locator('.article').filter({ hasText: 'Інша стаття' });
      await expect(root.getByRole('heading', { name: 'Різдво' })).toBeVisible();
      await expect(host.locator('h1')).toBeHidden();
      await expect(host.getByText('Дата публікації')).toBeHidden();
      const comments = host.locator(commentsSelector);
      await expect(comments).toHaveCount(1);
      await expect(comments).toBeHidden();
      await expect(host.locator('.breadcrumbs')).toBeVisible();
      await expect(other.getByRole('heading', { name: 'Інша стаття' })).toBeVisible();
      await expect(other.getByText('Дата публікації')).toBeVisible();
      await expect(page.getByRole('banner')).toBeVisible();
      if (!mobile) {
        const layout = page.locator('.layout').filter({ has: root });
        await expect(layout.locator('.layout-aside')).toBeHidden();
        await expect(page.getByText('Меню: Інша стаття')).toBeVisible();
        const bounds = await layout.boundingBox();
        expect(await root.boundingBox()).toMatchObject({ x: bounds?.x, width: bounds?.width });
      }
      await page.goto(shop + '/blog-post');
      await expect(page.getByRole('textbox', { name: 'Новий коментар' })).toBeVisible();
    });
    test('keeps the category count together beside a long name', async ({ page }) => {
      if (!mobile) await page.setViewportSize({ width: 920, height: 800 });
      await page.route(workspace + '/winter/products?**', (route) => route.fulfill({
        headers: { 'access-control-allow-origin': '*' }, json: { data: { products: [], total: 0, nextCursor: null } }
      }));
      await page.goto(shop + '/sale?mt-section-winter=trimmers');
      if (mobile) {
        const categories = page.getByRole('combobox', { name: 'Категорії' });
        await expect(categories).toBeVisible();
        await expect(categories.locator('option:checked')).toHaveText(`${trimmersName} (44)`);
      } else {
        const category = page.locator('.mt-campaign__nav a[aria-current=true]');
        const count = category.locator('small');
        await expect(count).toBeVisible();
        await expect(count).toHaveText('44');
        expect(await count.evaluate((node) => {
          const range = document.createRange();
          range.selectNodeContents(node);
          return range.getClientRects().length;
        })).toBe(1);
      }
    });
    test('navigates categories, pages, returns from the product and buys through the native surface', async ({ page }) => {
      const calls: string[] = [];
      const morePhones = Promise.withResolvers<void>();
      const promoToken = '00000000-0000-4000-8000-000000000001';
      const promoPage = shop + '/product?mt_promo=' + promoToken;
      await page.route(workspace + '/winter/products?**', async (route) => {
        const params = new URL(route.request().url()).searchParams;
        expect(params.has('q')).toBe(false);
        const id = params.get('section') || 'all';
        const offset = Number(params.get('cursor'));
        calls.push(id + ':' + offset);
        if (id === 'phones' && offset === 24) await morePhones.promise;
        const count = id === 'audio' ? 1 : id === 'phones' ? 25 : 26;
        const brands = params.getAll('brand');
        const products = Array.from({ length: count }, (_, i) => ({ title: id + '-' + i,
          brand: id === 'audio' || i === 25 ? 'JBL' : i === 24 ? 'Sony' : 'Samsung',
          article: 'P1', pageUrl: promoPage, imageUrl: shop + '/photo.svg', price: '500', oldPrice: '550',
          highlightPrice: true, currency: 'UAH', available: true, buyId: '42' }))
          .filter((p) => !brands.length || brands.includes(p.brand.toLowerCase()));
        return route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: { data: {
          products: products.slice(offset, offset + 24), total: products.length, nextCursor: offset + 24 < products.length ? offset + 24 : null
        } } });
      });
      await page.route(shop + '/photo.svg', (route) => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>' }));
      await page.route(workspace + '/promo-loader.js', (route) => route.fulfill({
        contentType: 'application/javascript; charset=utf-8', body: productPromoLoaderScript(workspace)
      }));
      await page.route(workspace + '/api/public/product-selections/promo/' + promoToken + '?**', (route) => {
        expect(new URL(route.request().url()).searchParams.get('page')).toBe(promoPage);
        return route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: {
          data: { mode: 'percent', value: 10, highlightPromoPrice: true }
        } });
      });
      await page.route(shop + '/product**', (route) => {
        const uaMobile = /Android|Mobile/u.test(route.request().headers()['user-agent']);
        expect(uaMobile).toBe(mobile);
        const buy = '<button class="j-buy-button-add" id="j-buy-button-widget-42" data-quantity="1"></button>';
        const markup = uaMobile ? `<div class="product__block--orderBox"><div data-view-block="orderBox"><div class="product-card--main" itemprop="offers"><div class="product-card__buy-button">${buy}</div></div></div></div>`
          : `<div class="product-order__block--buy">${buy}</div>`;
        const priceMeta = '<meta itemprop="price" content="500"><meta itemprop="priceCurrency" content="UAH">';
        const priceBox = uaMobile
          ? `<div class="product-card__price-box">${priceMeta}<span class="product-card__price">500 грн</span></div>`
          : `<div class="product-price__box">${priceMeta}<span class="product-price__item">500 грн</span></div>`;
        return route.fulfill({ contentType: 'text/html; charset=utf-8', body:
          `<meta name="viewport" content="width=device-width,initial-scale=1"><meta itemprop="sku" content="P1">
          ${markup}${priceBox}<script src="${workspace}/promo-loader.js"></script>` });
      });
      await page.goto(shop + '/sale?ref=mail&mt-q-winter=old-search');
      const cards = page.locator('.mt-product-selection__card');
      await expect(cards).toHaveCount(24);
      await expect(page).toHaveURL(shop + '/sale?ref=mail');
      await expect(page.locator('h1').filter({ hasText: 'Акційні добірки товарів' })).toBeHidden();
      await expect(page.getByRole('heading', { name: 'Інша стаття' })).toBeVisible();
      await expect(page.locator('.breadcrumbs').first()).toBeVisible();
      await expect(page.getByPlaceholder('Пошук магазину')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Різдво' })).toBeVisible();
      await expect(page.locator('.mt-campaign input')).toHaveCount(0);
      await expect(cards.first().locator('strong')).toHaveText('500 ₴');
      await expect(cards.first().locator('.mt-product-selection__price.is-promo del')).toHaveText('550 ₴');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (mobile) {
        await expect(page.getByRole('navigation', { name: 'Категорії акції' })).toBeHidden();
        await page.getByRole('combobox', { name: 'Категорії' }).selectOption('phones');
      } else {
        await expect(page.getByRole('combobox')).toBeHidden();
        const categories = page.getByRole('navigation', { name: 'Категорії акції' });
        const selectedCategory = categories.locator('a[aria-current=true]');
        await selectedCategory.hover();
        await expect(selectedCategory).toHaveCSS('color', 'rgb(0, 0, 0)');
        await expect(selectedCategory).toHaveCSS('background-color', 'rgb(255, 225, 1)');
        const phones = categories.getByRole('link', { name: 'Телефони 25' });
        await phones.hover();
        await expect(phones).toHaveCSS('color', 'rgb(255, 225, 1)');
        await phones.click();
      }
      await expect(cards.first()).toContainText('phones-0');
      await expect(page.getByRole('heading', { name: 'Телефони', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'JBL' })).toHaveCount(0);
      const sony = page.getByRole('button', { name: 'Sony', exact: true });
      await sony.click();
      await expect(cards).toHaveCount(1);
      await expect(cards.first()).toContainText('phones-24');
      await expect(sony).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.mt-campaign__count')).toHaveText('1');
      await page.getByRole('button', { name: 'Samsung' }).click();
      await expect(cards).toHaveCount(24);
      await page.reload();
      await expect(sony).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('button', { name: 'Samsung' })).toHaveAttribute('aria-pressed', 'true');
      await page.getByRole('button', { name: 'Усі бренди' }).click();
      await page.getByRole('button', { name: 'Nokia' }).click();
      await expect(page.getByRole('status')).toHaveText('Товарів не знайдено.');
      await page.getByRole('button', { name: 'Усі бренди' }).click();
      await expect(cards).toHaveCount(24);
      await expect(sony).toHaveAttribute('aria-pressed', 'false');
      await page.getByRole('button', { name: 'Показати ще' }).click();
      try {
        await expect(page.locator('.mt-campaign__skeletons')).toBeVisible();
        await expect(cards.first()).toBeVisible();
        await expect(cards).toHaveCount(24);
      } finally {
        morePhones.resolve();
      }
      await expect(cards).toHaveCount(25);
      await cards.last().getByRole('link', { name: 'phones-24', exact: true }).last().click();
      await expect(page).toHaveURL(promoPage);
      const oldPrice = page.locator('.mt-product-promo-old-price');
      await expect(oldPrice).toHaveText('550 грн');
      await expect(oldPrice).toHaveAttribute('data-mt-promo-surface', mobile ? 'mobile' : 'desktop');
      await expect(page.locator('.mt-product-promo-current-price')).toHaveText('500 грн');
      await page.goBack();
      await expect(cards).toHaveCount(25);
      await expect(page).toHaveURL(/ref=mail&mt-section-winter=phones/u);
      await cards.last().getByRole('button', { name: 'Купити' }).click();
      await expect(cards.last().getByRole('button')).toHaveText('У кошику');
      await page.goto(shop + '/sale?mt-section-winter=audio');
      await expect(cards).toHaveCount(1);
      expect(calls).toContain('phones:24');
      expect(calls.at(-1)).toBe('audio:0');
    });
    test('shows card skeletons for pending filters and reveals products independently of their photos', async ({ page }) => {
      if (!mobile) await page.setViewportSize({ width: 1520, height: 900 });
      const phonesData = Promise.withResolvers<void>();
      const phonesPhoto = Promise.withResolvers<void>();
      const sonyData = Promise.withResolvers<void>();
      const samsungPhoto = Promise.withResolvers<void>();
      const calls: string[] = [];
      await page.route(workspace + '/winter/products?**', async (route) => {
        const params = new URL(route.request().url()).searchParams;
        const result = params.get('brand') || params.get('section') || 'all';
        calls.push(result);
        if (result === 'phones') await phonesData.promise;
        if (result === 'sony') {
          await sonyData.promise;
          if (calls.filter((key) => key === 'sony').length === 1) {
            return route.fulfill({ status: 503, headers: { 'access-control-allow-origin': '*' }, body: '' });
          }
        }
        const products = Array.from({ length: 12 }, (_, i) => ({
          title: result + '-' + i,
          imageUrl: shop + '/' + (result === 'phones' && i === 1 ? 'missing' : result + (i ? '-other' : '')) + '.svg',
          pageUrl: shop + '/product',
          article: String(i), price: '500', currency: 'UAH', available: true
        }));
        await route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: { data: { products, total: products.length, nextCursor: null } } });
      });
      await page.route(shop + '/*.svg', async (route) => {
        if (route.request().url().endsWith('/missing.svg')) return route.fulfill({ status: 404, body: '' });
        if (route.request().url().endsWith('/phones.svg')) await phonesPhoto.promise;
        if (route.request().url().endsWith('/samsung.svg')) await samsungPhoto.promise;
        await route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"/>' });
      });
      await page.goto(shop + '/sale');
      const grid = page.locator('.mt-product-selection__grid');
      const placeholders = page.locator('.mt-campaign__skeletons');
      const title = grid.locator('.mt-product-selection__title').first();
      const photos = grid.locator('img');
      await expect(title).toHaveText('all-0');
      const columns = mobile ? 2 : 4;
      expect(await grid.evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(' ').length)).toBe(columns);
      await expect(photos.nth(columns - 1)).toHaveAttribute('fetchpriority', 'high');
      await expect(photos.nth(columns * 2 - 1)).toHaveAttribute('loading', 'eager');
      await expect(photos.nth(columns * 2)).toHaveAttribute('loading', 'lazy');
      const categoryRequest = page.waitForRequest((req) => new URL(req.url()).searchParams.get('section') === 'phones');
      if (mobile) {
        await page.getByRole('combobox').selectOption('phones');
      } else {
        const phones = page.getByRole('link', { name: 'Телефони 25' });
        await phones.hover();
        await categoryRequest;
        await phones.click();
      }
      try {
        await categoryRequest;
        await expect(grid).toHaveAttribute('aria-busy', 'true');
        await expect(page.getByRole('heading', { name: 'Телефони', exact: true })).toBeVisible();
        await expect(placeholders).toBeVisible();
        await expect(placeholders.locator('.mt-campaign__skeleton')).toHaveCount(columns * 2);
        expect(await placeholders.evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(' ').length)).toBe(columns);
        await expect(grid).toBeHidden();
        const photoRequest = page.waitForRequest(shop + '/phones.svg');
        phonesData.resolve();
        await photoRequest;
        await expect(title).toHaveText('phones-0');
        await expect(title).toBeVisible();
        await expect(grid).toHaveAttribute('aria-busy', 'false');
        await expect(placeholders).toBeHidden();
        const media = grid.locator('.mt-product-selection__media');
        await expect(media.first()).toHaveClass(/mt-campaign__photo-pending/u);
        await expect(grid.getByRole('button', { name: 'Купити' }).first()).toBeEnabled();
        await expect.poll(() => photos.nth(2).evaluate((img) => img.naturalWidth)).toBe(20);
        await expect(media.nth(2)).not.toHaveClass(/mt-campaign__photo-pending/u);
        await expect(media.nth(1)).not.toHaveClass(/mt-campaign__photo-pending/u);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        expect(await media.first().evaluate((node) => getComputedStyle(node, '::after').animationName)).toBe('none');
        phonesPhoto.resolve();
        await expect(media.first()).not.toHaveClass(/mt-campaign__photo-pending/u);
        expect(await photos.first().evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
        const firstPhone = await grid.locator('article').first().elementHandle();
        const sony = page.getByRole('button', { name: 'Sony', exact: true });
        const brandRequest = page.waitForRequest((req) => new URL(req.url()).searchParams.get('brand') === 'sony');
        await sony.click();
        await brandRequest;
        await expect(grid).toHaveAttribute('aria-busy', 'true');
        await expect(placeholders).toBeVisible();
        await expect(grid).toBeHidden();
        sonyData.resolve();
        await expect(page.getByRole('status')).toContainText('Показано попередні результати.');
        await expect(placeholders).toBeHidden();
        await expect(title).toHaveText('phones-0');
        await expect(title).toBeVisible();
        await page.getByRole('button', { name: 'Спробувати ще' }).click();
        await expect(title).toHaveText('sony-0');
        await placeholders.evaluate((node) => {
          new MutationObserver(() => { if (!node.hidden) node.dataset.flashed = 'true'; })
            .observe(node, { attributes: true, attributeFilter: ['hidden'] });
        });
        await page.getByRole('button', { name: 'Усі бренди' }).click();
        await expect(title).toHaveText('phones-0');
        expect(await grid.evaluate((node, original) => node.firstElementChild === original, firstPhone)).toBe(true);
        expect(calls).toEqual(['all', 'phones', 'sony', 'sony']);
        expect(await placeholders.getAttribute('data-flashed')).toBeNull();

        // A later selection wins even if an earlier result is waiting for its images.
        const pendingPhoto = page.waitForRequest(shop + '/samsung.svg');
        await page.getByRole('button', { name: 'Samsung' }).click();
        await pendingPhoto;
        await page.getByRole('button', { name: 'Усі бренди' }).click();
        const photoFinished = page.waitForResponse(shop + '/samsung.svg');
        samsungPhoto.resolve();
        await (await photoFinished).finished();
        await expect(grid).toHaveAttribute('aria-busy', 'false');
        await expect(title).toHaveText('phones-0');
      } finally {
        phonesData.resolve();
        phonesPhoto.resolve();
        sonyData.resolve();
        samsungPhoto.resolve();
      }
    });
  });
}
