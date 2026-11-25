import { test, expect, devices } from '@playwright/test';
import { productSelectionEmbedScript } from '../../src/modules/product-selections/product-selection.embed.js';
import { campaignStyles, mountCampaign } from '../../src/modules/product-selections/campaign.embed.js';

const shop = 'https://campaign-shop.test';
const workspace = 'https://campaign-workspace.test';
const campaign = { id: 'winter', revision: 1, name: 'Різдво', sections: [
  { id: 'phones', name: 'Телефони', count: 25, brands: ['Samsung', 'Sony'] },
  { id: 'audio', name: 'Аудіо', count: 1, brands: ['JBL'] }
] };
for (const mobile of [false, true]) {
  test.describe(mobile ? 'mobile campaign' : 'desktop campaign', () => {
    const device = devices[mobile ? 'Pixel 7' : 'Desktop Chrome'];
    test.use({ viewport: device.viewport, userAgent: device.userAgent, isMobile: mobile, hasTouch: mobile });
    test('navigates categories, pages, returns from the product and buys through the native surface', async ({ page }) => {
      const calls: string[] = [];
      await page.route(shop + '/sale**', (route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body:
        `<meta name="viewport" content="width=device-width,initial-scale=1"><main><script async src="${workspace}/winter/embed.js"></script></main>
        <script>let added;window.AjaxCart={getInstance:()=>({getProductById:()=>added,appendProduct:()=>{added={quantity:1}}})}</script>`
      }));
      await page.route(workspace + '/winter/embed.js', (route) => route.fulfill({ contentType: 'application/javascript; charset=utf-8',
        body: productSelectionEmbedScript(campaign, '', { styles: campaignStyles, mount: mountCampaign }) }));
      await page.route(workspace + '/winter/products?**', (route) => {
        const params = new URL(route.request().url()).searchParams;
        const id = params.get('section') || 'all';
        const offset = Number(params.get('cursor'));
        calls.push(id + ':' + offset);
        const count = id === 'audio' ? 1 : id === 'phones' ? 25 : 26;
        const brands = params.getAll('brand');
        const products = Array.from({ length: count }, (_, i) => ({ title: id + '-' + i,
          brand: id === 'audio' || i === 25 ? 'JBL' : i === 24 ? 'Sony' : 'Samsung',
          article: 'P1', pageUrl: shop + '/product', imageUrl: shop + '/photo.svg', price: '500', currency: 'UAH', available: true, buyId: '42' }))
          .filter((p) => (!brands.length || brands.includes(p.brand.toLowerCase())) && p.title.includes(params.get('q') || ''));
        return route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: { data: {
          products: products.slice(offset, offset + 24), total: products.length, nextCursor: offset + 24 < products.length ? offset + 24 : null
        } } });
      });
      await page.route(shop + '/photo.svg', (route) => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>' }));
      await page.route(shop + '/product', (route) => {
        const uaMobile = /Android|Mobile/u.test(route.request().headers()['user-agent']);
        expect(uaMobile).toBe(mobile);
        const buy = '<button class="j-buy-button-add" id="j-buy-button-widget-42" data-quantity="1"></button>';
        const markup = uaMobile ? `<div class="product__block--orderBox"><div data-view-block="orderBox"><div class="product-card--main" itemprop="offers"><div class="product-card__buy-button">${buy}</div></div></div></div>`
          : `<div class="product-order__block--buy">${buy}</div>`;
        return route.fulfill({ contentType: 'text/html', body: '<meta itemprop="sku" content="P1">' + markup });
      });
      await page.goto(shop + '/sale?ref=mail');
      const cards = page.locator('.mt-product-selection__card');
      await expect(cards).toHaveCount(24);
      await expect(cards.first().locator('strong')).toHaveText('500 ₴');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (mobile) {
        await expect(page.getByRole('navigation')).toBeHidden();
        await page.getByRole('combobox', { name: 'Категорії' }).selectOption('phones');
      } else {
        await expect(page.getByRole('combobox')).toBeHidden();
        await page.getByRole('link', { name: 'Телефони 25' }).click();
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
      const search = page.getByRole('searchbox', { name: 'Пошук у добірці' });
      await search.fill('phones-24');
      await expect(cards).toHaveCount(1);
      await page.reload();
      await expect(search).toHaveValue('phones-24');
      await expect(sony).toHaveAttribute('aria-pressed', 'true');
      await search.fill('нічого');
      await expect(page.getByRole('status')).toHaveText('Товарів не знайдено.');
      await search.fill('');
      await expect(cards).toHaveCount(24);
      await page.getByRole('button', { name: 'Усі бренди' }).click();
      await expect(sony).toHaveAttribute('aria-pressed', 'false');
      await page.getByRole('button', { name: 'Показати ще' }).click();
      await expect(cards).toHaveCount(25);
      await cards.last().getByRole('link', { name: 'phones-24', exact: true }).last().click();
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
  });
}
