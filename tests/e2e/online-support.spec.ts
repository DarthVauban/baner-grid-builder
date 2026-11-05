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
      const session = (await (await sessionResponse).json()).data;
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
      const restored = await page.request.get('/api/public/support-chat/session', { headers: { Authorization: `Bearer ${session.token}` } });
      expect((await restored.json()).data.conversation.id).toBe(conversation.id);
    });
  });
}
