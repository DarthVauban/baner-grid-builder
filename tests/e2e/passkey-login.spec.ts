import { createHmac } from 'node:crypto';
import { expect, test } from '@playwright/test';

const account = {
  firstName: 'Passkey',
  lastName: 'Tester',
  email: 'passkey-e2e@test.local',
  password: 'Passkey-test-password-2026'
};

const base32Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(secret: string) {
  const normalized = secret.replace(/\s+/g, '').replace(/=+$/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of normalized) {
    const index = base32Alphabet.indexOf(char);
    if (index < 0) throw new Error('Invalid base32 secret');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function currentTotpCode(secret: string) {
  const counter = Math.floor(Date.now() / 1000 / 30);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuffer.writeUInt32BE(counter >>> 0, 4);
  const digest = createHmac('sha1', base32Decode(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

test('user registers a passkey and chooses code or phone QR on one login screen', async ({ page }) => {
  const registration = await page.request.post('/api/auth/register', { data: account });
  expect(registration.status()).toBe(202);
  const registrationPayload = await registration.json();
  const verification = await page.request.post('/api/auth/register/verify', {
    data: { email: account.email, code: registrationPayload.data.devCode }
  });
  expect(verification.status()).toBe(201);

  const twoFactorSetup = await page.request.post('/api/users/profile/2fa/setup');
  expect(twoFactorSetup.status()).toBe(200);
  const setupPayload = await twoFactorSetup.json();
  const secret = setupPayload.data.manualKey.replace(/\s+/g, '');
  const twoFactorConfirm = await page.request.post('/api/users/profile/2fa/confirm', {
    data: { code: currentTotpCode(secret) }
  });
  expect(twoFactorConfirm.status()).toBe(200);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const authenticator = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true
    }
  });

  // The production responses prefer the remote-device (QR) transport. The virtual
  // authenticator is local, so the test only changes the browser hint while keeping
  // the same server challenges and cryptographic verification flow.
  await page.route('**/api/users/profile/passkeys/options', async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    payload.data.options.hints = ['client-device'];
    payload.data.options.authenticatorSelection.authenticatorAttachment = 'platform';
    await route.fulfill({ response, json: payload });
  });
  await page.route('**/api/auth/login/passkey/options', async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    payload.data.options.hints = ['client-device'];
    await route.fulfill({ response, json: payload });
  });

  try {
    await page.goto('/profile');
    await page.getByRole('button', { name: 'Додати Passkey' }).click();
    await expect(page.getByRole('heading', { name: 'Підключити телефон' })).toBeVisible();

    const passkeyModal = page.getByRole('dialog', { name: 'Підключити телефон' });
    const desktopLayout = await passkeyModal.evaluate((element) => {
      const body = element.querySelector<HTMLElement>('.modal__body')!;
      const footer = element.querySelector<HTMLElement>('.modal__footer')!;
      const bodyStyle = getComputedStyle(body);
      const footerStyle = getComputedStyle(footer);
      return {
        modalOverflowY: getComputedStyle(element).overflowY,
        bodyOverflowY: bodyStyle.overflowY,
        footerPadding: [footerStyle.paddingTop, footerStyle.paddingRight, footerStyle.paddingBottom, footerStyle.paddingLeft]
          .map((value) => Number.parseFloat(value))
      };
    });
    expect(desktopLayout.modalOverflowY).toBe('hidden');
    expect(desktopLayout.bodyOverflowY).toBe('auto');
    expect(desktopLayout.footerPadding.every((value) => value >= 16)).toBe(true);

    await page.setViewportSize({ width: 390, height: 430 });
    const compactLayout = await passkeyModal.evaluate((element) => {
      const body = element.querySelector<HTMLElement>('.modal__body')!;
      const footer = element.querySelector<HTMLElement>('.modal__footer')!;
      const modalRect = element.getBoundingClientRect();
      const footerRect = footer.getBoundingClientRect();
      return {
        bodyScrolls: body.scrollHeight > body.clientHeight,
        footerVisible: footerRect.top >= modalRect.top && footerRect.bottom <= modalRect.bottom + 1
      };
    });
    expect(compactLayout).toEqual({ bodyScrolls: true, footerVisible: true });
    await page.setViewportSize({ width: 1280, height: 720 });

    await page.getByLabel('Назва пристрою').fill('E2E phone');
    await page.getByLabel('Поточний код 2FA').fill(currentTotpCode(secret));
    await page.getByRole('button', { name: 'Показати QR-код' }).click();
    await expect(page.getByText('Passkey успішно підключено.')).toBeVisible();
    await expect(page.getByText('E2E phone')).toBeVisible();

    await page.request.post('/api/auth/logout');
    await page.goto('/login');
    await page.getByLabel('Email').fill(account.email);
    await page.locator('input[name="password"]').fill(account.password);
    await page.getByRole('button', { name: 'Увійти' }).click();

    await expect(page.getByRole('heading', { name: 'Підтвердіть вхід' })).toBeVisible();
    await expect(page.getByLabel('6-значний код')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Відкрити QR-код' })).toBeVisible();
    await page.getByRole('button', { name: 'Відкрити QR-код' }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: 'Вітаємо, Passkey' })).toBeVisible();
  } finally {
    await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId: authenticator.authenticatorId }).catch(() => {});
    await cdp.send('WebAuthn.disable').catch(() => {});
  }
});
