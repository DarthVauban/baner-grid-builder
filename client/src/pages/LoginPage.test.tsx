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
  cancelQrLogin: vi.fn(),
  resumeSmartSearchAuthorization: vi.fn()
}));

vi.mock('../search/smart-search-auth', async (importOriginal) => ({
  ...await importOriginal<typeof import('../search/smart-search-auth')>(),
  resumeSmartSearchAuthorization: mocks.resumeSmartSearchAuthorization
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

const searchReturnPath = `/api/integrations/smart-search/authorize?${new URLSearchParams({
  response_type: 'code', client_id: 'smart-search-dev',
  redirect_uri: 'https://smart-search.mt-panel.sbs/auth/workspace/callback',
  scope: 'smart-search:admin', state: 's'.repeat(43), code_challenge_method: 'S256', code_challenge: 'c'.repeat(43)
})}`;

function renderSearchLogin() {
  return render(<MemoryRouter initialEntries={[`/login?${new URLSearchParams({ returnTo: searchReturnPath })}`]}><LoginPage /></MemoryRouter>);
}

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

  it('resumes the exact Search authorization only after complete second-factor verification', async () => {
    renderSearchLogin();
    await userEvent.type(await screen.findByLabelText('Email'), mobileChallenge.email);
    await userEvent.type(screen.getByLabelText('Пароль'), 'SecurePassword123!');
    await userEvent.click(screen.getByRole('button', { name: 'Увійти' }));
    expect(await screen.findByText('Очікуємо підтвердження')).toBeInTheDocument();
    expect(mocks.resumeSmartSearchAuthorization).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /Використати код/ }));
    await userEvent.type(screen.getByLabelText('6-значний код або recovery code'), 'abcd-234567');
    await userEvent.click(screen.getByRole('button', { name: 'Підтвердити код' }));
    await waitFor(() => expect(mocks.resumeSmartSearchAuthorization).toHaveBeenCalledExactlyOnceWith(searchReturnPath));
  });

  it('resumes Search after successful password login without a second-factor challenge', async () => {
    mocks.login.mockResolvedValue(null);
    renderSearchLogin();
    await userEvent.type(await screen.findByLabelText('Email'), mobileChallenge.email);
    await userEvent.type(screen.getByLabelText('Пароль'), 'SecurePassword123!');
    await userEvent.click(screen.getByRole('button', { name: 'Увійти' }));
    await waitFor(() => expect(mocks.resumeSmartSearchAuthorization).toHaveBeenCalledExactlyOnceWith(searchReturnPath));
  });

  it('preserves Search state and PKCE through completed passkey verification', async () => {
    mocks.login.mockResolvedValue({ ...mobileChallenge, passkeyAvailable: true });
    mocks.startPasskeyLogin.mockResolvedValue({ challengeId: 'passkey-challenge', options: {} });
    mocks.verifyLoginPasskey.mockResolvedValue(undefined);
    renderSearchLogin();
    await userEvent.type(await screen.findByLabelText('Email'), mobileChallenge.email);
    await userEvent.type(screen.getByLabelText('Пароль'), 'SecurePassword123!');
    await userEvent.click(screen.getByRole('button', { name: 'Увійти' }));
    expect(await screen.findByText('Очікуємо підтвердження')).toBeInTheDocument();
    expect(mocks.resumeSmartSearchAuthorization).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Увійти через Passkey' }));
    await waitFor(() => expect(mocks.verifyLoginPasskey).toHaveBeenCalled());
    expect(mocks.resumeSmartSearchAuthorization).toHaveBeenCalledExactlyOnceWith(searchReturnPath);
  });

  it('resumes Search only after the QR login has been consumed', async () => {
    const deployment = { deploymentId: 'test-workspace', environment: 'test', displayName: 'MT Workspace Test', webOrigin: 'http://localhost:3000' };
    mocks.qrLoginConfig.mockResolvedValue({ enabled: true, multiAccountPairingEnabled: true, ttlSeconds: 120, pollAfterMs: 10_000, deployment });
    mocks.createQrLogin.mockResolvedValue({
      challengeId: '30000000-0000-4000-8000-000000000001', browserToken: 'browser-secret',
      qrPayload: 'mtw://login?v=1&c=challenge&s=scan', expiresAt: mobileChallenge.expiresAt, pollAfterMs: 10_000, deployment
    });
    mocks.qrLoginStatus.mockResolvedValue({ status: 'approved', expiresAt: mobileChallenge.expiresAt });
    mocks.completeQrLogin.mockResolvedValue({ returnPath: '/' });
    renderSearchLogin();
    await waitFor(() => expect(mocks.completeQrLogin).toHaveBeenCalledWith('30000000-0000-4000-8000-000000000001', 'browser-secret'));
    expect(mocks.resumeSmartSearchAuthorization).toHaveBeenCalledExactlyOnceWith(searchReturnPath);
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
