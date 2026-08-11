import { expect, test, type APIRequestContext } from '@playwright/test';

const pairingAccount = {
  firstName: 'Mobile',
  lastName: 'Pairing',
  email: 'mobile-pairing-e2e@test.local',
  password: 'Mobile-pairing-password-2026'
};

const approvalAccount = {
  firstName: 'Mobile',
  lastName: 'Approval',
  email: 'mobile-approval-e2e@test.local',
  password: 'Mobile-approval-password-2026'
};

async function registerAccount(request: APIRequestContext, account: typeof pairingAccount) {
  const registration = await request.post('/api/auth/register', { data: account });
  expect(registration.status()).toBe(202);
  const registrationPayload = await registration.json();
  const verification = await request.post('/api/auth/register/verify', {
    data: { email: account.email, code: registrationPayload.data.devCode }
  });
  expect(verification.status()).toBe(201);
}

test('profile enables MT Workspace through a simulated mobile pairing claim', async ({ page }) => {
  await registerAccount(page.request, pairingAccount);
  await page.goto('/profile');
  await expect(page.getByRole('heading', { name: 'Мій профіль' })).toBeVisible();

  await page.getByRole('button', { name: 'Увімкнути', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Оберіть спосіб 2FA' })).toBeVisible();
  await page.getByRole('button', { name: /MT Workspace/ }).click();
  await expect(page.getByRole('heading', { name: 'Відскануйте код у застосунку' })).toBeVisible();
  await expect(page.getByAltText('QR-код для MT Workspace')).toBeVisible();

  const manualCode = await page.locator('.mobile-pairing-manual code').innerText();
  const claim = await page.request.post('/api/mobile/pairings/claim', {
    data: {
      pairingToken: manualCode,
      platform: 'android',
      deviceName: 'E2E Android phone'
    }
  });
  expect(claim.status()).toBe(201);

  await expect(page.getByRole('heading', { name: 'Збережіть резервні коди' })).toBeVisible();
  await expect(page.locator('.two-factor-recovery__codes code')).toHaveCount(10);
  await page.getByRole('button', { name: 'Я зберіг коди' }).click();

  await expect(page.getByText('MT Workspace · резервних кодів: 10.')).toBeVisible();
  await expect(page.getByText('E2E Android phone')).toBeVisible();
});

test('password login completes only after the simulated mobile device approves it', async ({ page }) => {
  await registerAccount(page.request, approvalAccount);
  const pairing = await page.request.post('/api/users/profile/mobile-pairings', {
    data: { purpose: 'enable_2fa', code: null }
  });
  expect(pairing.status()).toBe(201);
  const pairingPayload = await pairing.json();
  const claim = await page.request.post('/api/mobile/pairings/claim', {
    data: {
      pairingToken: pairingPayload.data.manualCode,
      platform: 'android',
      deviceName: 'Approval Android phone'
    }
  });
  expect(claim.status()).toBe(201);
  const mobileCredential = await claim.json();
  await page.request.post('/api/auth/logout');

  await page.goto('/login');
  await page.getByLabel('Email').fill(approvalAccount.email);
  await page.locator('input[name="password"]').fill(approvalAccount.password);
  const loginResponsePromise = page.waitForResponse((response) => (
    response.url().endsWith('/api/auth/login')
    && response.request().method() === 'POST'
  ));
  await page.getByRole('button', { name: 'Увійти' }).click();
  const loginResponse = await loginResponsePromise;
  expect(loginResponse.status()).toBe(202);
  const loginPayload = await loginResponse.json();

  await expect(page.getByRole('heading', { name: 'Підтвердіть вхід' })).toBeVisible();
  await expect(page.getByText('Очікуємо підтвердження')).toBeVisible();
  const approval = await page.request.post(
    `/api/mobile/login-requests/${loginPayload.data.mobileApproval.requestId}/approve`,
    { headers: { Authorization: `Bearer ${mobileCredential.data.accessToken}` } }
  );
  expect(approval.status()).toBe(200);

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Вітаємо, Mobile' })).toBeVisible();
});
