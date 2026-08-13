import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from './LoginPage';

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  verifyLoginTwoFactor: vi.fn(),
  verifyLoginPasskey: vi.fn(),
  verifyMobileLogin: vi.fn(),
  cancelMobileLogin: vi.fn(),
  startPasskeyLogin: vi.fn(),
  completeQrLogin: vi.fn(),
  qrLoginConfig: vi.fn(),
  createQrLogin: vi.fn(),
  qrLoginStatus: vi.fn(),
  cancelQrLogin: vi.fn()
}));

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    login: mocks.login,
    verifyLoginTwoFactor: mocks.verifyLoginTwoFactor,
    verifyLoginPasskey: mocks.verifyLoginPasskey,
    verifyMobileLogin: mocks.verifyMobileLogin,
    completeQrLogin: mocks.completeQrLogin
  })
}));

vi.mock('../lib/api', () => ({
  api: {
    auth: {
      cancelMobileLogin: mocks.cancelMobileLogin,
      startPasskeyLogin: mocks.startPasskeyLogin,
      qrLoginConfig: mocks.qrLoginConfig,
      createQrLogin: mocks.createQrLogin,
      qrLoginStatus: mocks.qrLoginStatus,
      cancelQrLogin: mocks.cancelQrLogin
    }
  }
}));

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,qr') }
}));

vi.mock('@simplewebauthn/browser', () => ({
  browserSupportsWebAuthn: () => true,
  startAuthentication: vi.fn()
}));

const mobileChallenge = {
  twoFactorRequired: true as const,
  twoFactorMethod: 'mt_workspace' as const,
  passkeyAvailable: false,
  challengeToken: 'signed-mobile-login-challenge-token',
  expiresAt: '2099-08-12T12:05:00.000Z',
  email: 'dmytro@example.com',
  mobileApproval: {
    requestId: '10000000-0000-4000-8000-000000000001',
    status: 'pending' as const,
    pollingIntervalMs: 10_000,
    activeDeviceCount: 1
  }
};

async function startMobileLogin() {
  render(<MemoryRouter><LoginPage /></MemoryRouter>);
  await userEvent.type(await screen.findByLabelText('Email'), mobileChallenge.email);
  await userEvent.type(screen.getByLabelText('Пароль'), 'SecurePassword123!');
  await userEvent.click(screen.getByRole('button', { name: 'Увійти' }));
  expect(await screen.findByText('Очікуємо підтвердження')).toBeInTheDocument();
}

describe('LoginPage MT Workspace approval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.login.mockResolvedValue(mobileChallenge);
    mocks.verifyMobileLogin.mockResolvedValue({
      requestId: mobileChallenge.mobileApproval.requestId,
      status: 'pending',
      expiresAt: mobileChallenge.expiresAt,
      user: null
    });
    mocks.verifyLoginTwoFactor.mockResolvedValue(undefined);
    mocks.cancelMobileLogin.mockResolvedValue(undefined);
    mocks.cancelQrLogin.mockResolvedValue(undefined);
    mocks.qrLoginConfig.mockResolvedValue({
      enabled: false,
      multiAccountPairingEnabled: false,
      ttlSeconds: 120,
      pollAfterMs: 2_000,
      deployment: {
        deploymentId: 'test-workspace',
        environment: 'test',
        displayName: 'MT Workspace Test',
        webOrigin: 'http://localhost:3000'
      }
    });
  });

  it('polls the signed request and offers a recovery-code fallback', async () => {
    await startMobileLogin();

    await waitFor(() => expect(mocks.verifyMobileLogin).toHaveBeenCalledWith({
      challengeToken: mobileChallenge.challengeToken,
      requestId: mobileChallenge.mobileApproval.requestId
    }));
    await userEvent.click(screen.getByRole('button', { name: /Використати код/ }));
    await userEvent.type(screen.getByLabelText('6-значний код або recovery code'), 'abcd-234567');
    await userEvent.click(screen.getByRole('button', { name: 'Підтвердити код' }));

    expect(mocks.verifyLoginTwoFactor).toHaveBeenCalledWith({
      challengeToken: mobileChallenge.challengeToken,
      code: 'ABCD-234567'
    });
  });

  it('cancels the pending request when returning to the password form', async () => {
    await startMobileLogin();
    await userEvent.click(screen.getByRole('button', { name: 'Повернутися до пароля' }));

    await waitFor(() => expect(mocks.cancelMobileLogin).toHaveBeenCalledWith(
      mobileChallenge.challengeToken
    ));
    expect(screen.getByRole('button', { name: 'Увійти' })).toBeInTheDocument();
  });

  it('shows QR login behind the feature flag and cancels it before password fallback', async () => {
    mocks.qrLoginConfig.mockResolvedValue({
      enabled: true,
      multiAccountPairingEnabled: true,
      ttlSeconds: 120,
      pollAfterMs: 10_000,
      deployment: {
        deploymentId: 'test-workspace',
        environment: 'test',
        displayName: 'MT Workspace Test',
        webOrigin: 'http://localhost:3000'
      }
    });
    mocks.createQrLogin.mockResolvedValue({
      challengeId: '30000000-0000-4000-8000-000000000001',
      browserToken: 'browser-secret',
      qrPayload: 'mtw://login?v=1&c=challenge&s=scan',
      expiresAt: '2099-08-12T12:05:00.000Z',
      pollAfterMs: 10_000,
      deployment: {
        deploymentId: 'test-workspace',
        environment: 'test',
        displayName: 'MT Workspace Test',
        webOrigin: 'http://localhost:3000'
      }
    });
    mocks.qrLoginStatus.mockResolvedValue({
      status: 'pending',
      expiresAt: '2099-08-12T12:05:00.000Z'
    });

    render(<MemoryRouter><LoginPage /></MemoryRouter>);

    expect(await screen.findByRole('img', { name: /Одноразовий QR-код/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'QR-код' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('DEV')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Увійти за логіном і паролем' }));
    await waitFor(() => expect(mocks.cancelQrLogin).toHaveBeenCalledWith(
      '30000000-0000-4000-8000-000000000001',
      'browser-secret'
    ));
    expect(await screen.findByLabelText('Email')).toBeInTheDocument();
  });
});
