import { devices, expect, test } from '@playwright/test';

// Separate browser contexts prove each surface with both its UA and viewport.
for (const surface of [
  { name: 'desktop', device: devices['Desktop Chrome'] },
  { name: 'mobile', device: devices['iPhone 13'] }
]) {
  test.describe(`online support ${surface.name}`, () => {
    test.use({ userAgent: surface.device.userAgent, viewport: surface.device.viewport,
      isMobile: surface.device.isMobile, hasTouch: surface.device.hasTouch, deviceScaleFactor: surface.device.deviceScaleFactor });
    test('visitor send, operator reply and restored session preserve the embedded contract', async ({ page }) => {
      expect((await page.request.post('/api/auth/login', { data: {
        email: 'e2e-admin@test.local', password: 'E2E-admin-password-2026'
      } })).ok()).toBe(true);
      const current = (await (await page.request.get('/api/support-chat/settings')).json()).data;
      expect((await page.request.put('/api/support-chat/settings', { data: {
        ...current, enabled: true, allowedOrigins: [], workingHoursEnabled: false, contactFormEnabled: false
      } })).ok()).toBe(true);
      const sessionResponse = page.waitForResponse((response) => response.url().includes('/api/public/support-chat/session') && response.request().method() === 'POST');
      await page.goto(`/support-chat/widget?site=${current.publicId}&open=1`);
      const session = await sessionResponse;
      expect(session.headers()['cache-control']).toBe('no-store');
      expect((await session.json()).data.token).toBeUndefined();
      expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('mt-support-chat:')))).toEqual([]);
      const body = `Support ${surface.name} visitor message`;
      const sent = page.waitForResponse((response) => response.url().includes('/api/public/support-chat/messages') && response.request().method() === 'POST');
      await page.getByPlaceholder('Напишіть повідомлення…').fill(body);
      await page.getByRole('button', { name: 'Надіслати повідомлення', exact: true }).click();
      const conversation = (await (await sent).json()).data;
      await expect(page.locator('.support-message--visitor').getByText(body)).toBeVisible();
      const visitorMessage = conversation.messages.find((message: { senderType: string; body: string }) => message.senderType === 'visitor' && message.body === body);
      expect(typeof visitorMessage.sequence).toBe('string');
      expect(visitorMessage.clientMessageId).toBeTruthy();
      const reply = `Support ${surface.name} operator reply`;
      const response = await page.request.post(`/api/support-chat/conversations/${conversation.id}/messages`, {
        data: { body: reply, clientMessageId: crypto.randomUUID() }
      });
      expect(response.status()).toBe(201);
      await expect(page.locator('.support-message--operator').getByText(reply)).toBeVisible();
      await page.reload();
      await expect(page.locator('.support-message--visitor').getByText(body)).toBeVisible();
      await expect(page.locator('.support-message--operator').getByText(reply)).toBeVisible();
      const restored = await page.request.get('/api/public/support-chat/session', { headers: { 'X-Support-Chat-Site': current.publicId } });
      expect((await restored.json()).data.conversation.id).toBe(conversation.id);
    });

    test('visitor sees a pending message immediately and retries a lost response without duplicates', async ({ page }) => {
      expect((await page.request.post('/api/auth/login', { data: {
        email: 'e2e-admin@test.local', password: 'E2E-admin-password-2026'
      } })).ok()).toBe(true);
      const current = (await (await page.request.get('/api/support-chat/settings')).json()).data;
      expect((await page.request.put('/api/support-chat/settings', { data: {
        ...current, enabled: true, allowedOrigins: [], workingHoursEnabled: false, contactFormEnabled: false
      } })).ok()).toBe(true);
      await page.route('**/api/public/support-chat/stream', (route) => route.fulfill({ status: 204 }));
      let release!: () => void;
      const held = new Promise<void>((resolve) => { release = resolve; });
      let persisted!: () => void;
      const firstPersisted = new Promise<void>((resolve) => { persisted = resolve; });
      const payloads: Array<{ body: string; clientMessageId: string }> = [];
      await page.route('**/api/public/support-chat/messages', async (route) => {
        payloads.push(route.request().postDataJSON());
        if (payloads.length === 1) {
          expect((await route.fetch()).ok()).toBe(true);
          persisted();
          await held;
          await route.abort('failed');
        } else await route.continue();
      });
      const sessionResponse = page.waitForResponse((response) => response.url().includes('/api/public/support-chat/session') && response.request().method() === 'POST');
      await page.goto(`/support-chat/widget?site=${current.publicId}&open=1`);
      expect((await sessionResponse).ok()).toBe(true);
      const composer = page.getByPlaceholder('Напишіть повідомлення…');
      const body = `Pending ${surface.name} visitor message`;
      await composer.fill(body);
      await composer.press('Enter');
      try {
        await expect(composer).toHaveValue('');
        await expect(page.locator('.support-message--visitor').getByText(body)).toBeVisible();
        await expect(page.getByRole('status')).toHaveText('Надсилання…');
        await composer.fill('Наступна чернетка');
        await firstPersisted;
      } finally { release(); }
      const retry = page.getByRole('button', { name: 'Повторити надсилання', exact: true });
      await expect(retry).toBeInViewport();
      await expect(composer).toHaveValue('Наступна чернетка');
      const retried = page.waitForResponse((response) => response.url().includes('/api/public/support-chat/messages') && response.request().method() === 'POST');
      await retry.click();
      expect((await retried).ok()).toBe(true);
      await expect(retry).toHaveCount(0);
      await expect(page.locator('.support-message--visitor')).toHaveCount(1);
      await expect(composer).toHaveValue('Наступна чернетка');
      expect(payloads).toHaveLength(2);
      expect(payloads[1]).toEqual(payloads[0]);
      const restored = await page.request.get('/api/public/support-chat/session', { headers: { 'X-Support-Chat-Site': current.publicId } });
      const messages = (await restored.json()).data.conversation.messages;
      expect(messages.filter((message: { senderType: string }) => message.senderType === 'visitor')).toHaveLength(1);
      expect(messages.filter((message: { senderType: string }) => message.senderType === 'system')).toHaveLength(1);
    });

    test('cross-site HTTPS widget restores a private session and omits checkout data', async ({ page, baseURL }) => {
      const shopOrigin = 'https://shop.support-test.example';
      const panelOrigin = 'https://panel.support-test-alt.example';
      const panelHost = new URL(panelOrigin).host;
      await page.request.post('/api/auth/login', { data: { email: 'e2e-admin@test.local', password: 'E2E-admin-password-2026' } });
      const current = (await (await page.request.get('/api/support-chat/settings')).json()).data;
      expect((await page.request.put('/api/support-chat/settings', { data: {
        ...current, enabled: true, allowedOrigins: [shopOrigin], workingHoursEnabled: false
      } })).ok()).toBe(true);

      await page.route(`${shopOrigin}/**`, (route) => route.fulfill({ contentType: 'text/html', body: `
        <!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><title>Private order</title>
        <h1>Замовлення</h1><script src="${panelOrigin}/api/public/support-chat/embed.js" data-site="${current.publicId}"></script>
      ` }));
      await page.route(`${panelOrigin}/**`, async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.pathname.endsWith('/stream')) return route.fulfill({ status: 204 });
        const response = await route.fetch({
          url: new URL(`${url.pathname}${url.search}`, baseURL).href,
          headers: { ...await request.allHeaders(), Host: panelHost, 'X-Forwarded-Proto': 'https' }
        });
        if (url.pathname.endsWith('/session') && request.method() === 'POST') {
          expect(response.headers()['set-cookie']).toMatch(/; Partitioned(?:;|$)/u);
        }
        await route.fulfill({ response });
      });

      const sessionResponse = page.waitForResponse((response) => response.url() === `${panelOrigin}/api/public/support-chat/session`
        && response.request().method() === 'POST');
      await page.goto(`${shopOrigin}/checkout/complete/private-order?email=private#contact`);
      const response = await sessionResponse;
      expect(response.ok()).toBe(true);
      const session = (await response.json()).data;
      expect(session.token).toBeUndefined();
      expect(response.request().postDataJSON()).toMatchObject({ transport: 'cookie', pageUrl: '' });
      expect(response.request().postData()).not.toContain('Private order');
      const frame = page.frameLocator('iframe[title="Онлайн-підтримка"]');
      const frameSrc = await page.locator('iframe[title="Онлайн-підтримка"]').getAttribute('src');
      expect(frameSrc).not.toContain('private');
      expect(frameSrc).not.toContain('pageUrl');
      const sessionCookie = (await page.context().cookies(panelOrigin)).find((cookie) => cookie.name === `__Host-mt-support-${current.publicId}`);
      expect(sessionCookie).toMatchObject({ secure: true, httpOnly: true, sameSite: 'None' });
      await frame.getByRole('button', { name: 'Відкрити онлайн-підтримку' }).click();
      const composer = frame.getByPlaceholder('Напишіть повідомлення…');
      await composer.fill('Тест вкладеного чату');
      await frame.getByRole('button', { name: 'Надіслати повідомлення' }).click();
      await expect(frame.locator('.support-message--visitor').getByText('Тест вкладеного чату')).toBeVisible();
      const restoredResponse = page.waitForResponse((result) => result.url() === response.url() && result.request().method() === 'POST');
      await page.reload();
      const restored = (await (await restoredResponse).json()).data;
      expect(restored.visitor.id).toBe(session.visitor.id);
      expect(restored.conversation.messages[0].body).toBe('Тест вкладеного чату');
    });
  });
}
