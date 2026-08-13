import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QrLoginChallenge, QrLoginConfig } from '../types/user';
import { QrLoginPanel } from './QrLoginPanel';

const mocks = vi.hoisted(() => ({
  createQrLogin: vi.fn(),
  qrLoginStatus: vi.fn(),
  cancelQrLogin: vi.fn(),
  completeQrLogin: vi.fn()
}));

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ completeQrLogin: mocks.completeQrLogin })
}));

vi.mock('../lib/api', () => ({
  api: {
    auth: {
      createQrLogin: mocks.createQrLogin,
      qrLoginStatus: mocks.qrLoginStatus,
      cancelQrLogin: mocks.cancelQrLogin
    }
  }
}));

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,qr') }
}));

const config: QrLoginConfig = {
  enabled: true,
  multiAccountPairingEnabled: true,
  ttlSeconds: 120,
  pollAfterMs: 1_000,
  deployment: {
    deploymentId: 'mt-workspace-development',
    environment: 'development',
    displayName: 'MT Workspace Dev',
    webOrigin: 'https://dev.mt-panel.sbs'
  }
};

const challenge: QrLoginChallenge = {
  challengeId: '30000000-0000-4000-8000-000000000001',
  browserToken: 'browser-token-kept-in-memory-only',
  qrPayload: 'mtworkspace://login?v=1&challengeId=challenge&token=scan',
  expiresAt: '2099-08-12T12:05:00.000Z',
  pollAfterMs: 10_000,
  deployment: config.deployment
};

function renderPanel() {
  const onAuthenticated = vi.fn();
  const onPasswordRequested = vi.fn();
  const view = render(<QrLoginPanel
    config={config}
    returnPath="/tools"
    onAuthenticated={onAuthenticated}
    onPasswordRequested={onPasswordRequested}
  />);
  return { ...view, onAuthenticated, onPasswordRequested };
}

describe('QrLoginPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createQrLogin.mockResolvedValue(challenge);
    mocks.qrLoginStatus.mockResolvedValue({ status: 'pending', expiresAt: challenge.expiresAt });
    mocks.cancelQrLogin.mockResolvedValue(undefined);
    mocks.completeQrLogin.mockResolvedValue({ user: { id: 'user-1' }, returnPath: '/tools' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders loading, pending instructions, an accessible QR and the DEV badge', async () => {
    let resolveChallenge: (value: QrLoginChallenge) => void = () => {};
    mocks.createQrLogin.mockReturnValue(new Promise((resolve) => { resolveChallenge = resolve; }));
    renderPanel();
    expect(screen.getByText('Створюємо захищений QR-код…')).toBeInTheDocument();

    await act(async () => resolveChallenge(challenge));

    expect(await screen.findByRole('img', { name: /Одноразовий QR-код/ })).toBeInTheDocument();
    expect(screen.getByText('Очікуємо сканування')).toBeInTheDocument();
    expect(screen.getByText('DEV')).toBeInTheDocument();
    expect(screen.getByText('Відкрийте MT Workspace')).toBeInTheDocument();
    expect(window.location.href).not.toContain(challenge.browserToken);
    expect(window.localStorage.getItem('browserToken')).toBeNull();
  });

  it.each([
    ['scanned', 'QR відскановано'],
    ['denied', 'Вхід відхилено'],
    ['expired', 'Термін дії QR минув'],
    ['cancelled', 'QR-вхід скасовано']
  ] as const)('renders the %s server state without a reload', async (status, label) => {
    mocks.qrLoginStatus.mockResolvedValue({ status, expiresAt: challenge.expiresAt });
    renderPanel();
    expect(await screen.findByText(label)).toBeInTheDocument();
    if (status !== 'scanned') expect(screen.getByRole('button', { name: /Створити новий QR/ })).toBeInTheDocument();
  });

  it('consumes an approved challenge and redirects through the authenticated callback', async () => {
    mocks.qrLoginStatus.mockResolvedValue({ status: 'approved', expiresAt: challenge.expiresAt });
    const { onAuthenticated } = renderPanel();

    await waitFor(() => expect(mocks.completeQrLogin).toHaveBeenCalledWith(
      challenge.challengeId,
      challenge.browserToken
    ));
    expect(onAuthenticated).toHaveBeenCalledWith('/tools');
  });

  it('shows a network error and cancels the current challenge before retrying', async () => {
    mocks.qrLoginStatus.mockRejectedValueOnce(new Error('Мережа недоступна'));
    mocks.createQrLogin
      .mockResolvedValueOnce(challenge)
      .mockResolvedValueOnce({ ...challenge, challengeId: '30000000-0000-4000-8000-000000000002' });
    renderPanel();

    expect(await screen.findByRole('alert')).toHaveTextContent('Мережа недоступна');
    fireEvent.click(screen.getByRole('button', { name: /Створити новий QR/ }));
    await waitFor(() => expect(mocks.cancelQrLogin).toHaveBeenCalledWith(
      challenge.challengeId,
      challenge.browserToken
    ));
    expect(mocks.createQrLogin).toHaveBeenCalledTimes(2);
  });

  it('cancels on password fallback and unmount, and resumes polling when the tab becomes visible', async () => {
    const originalVisibility = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    const { unmount, onPasswordRequested } = renderPanel();
    await screen.findByText('Очікуємо сканування');
    expect(mocks.qrLoginStatus).not.toHaveBeenCalled();

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    fireEvent(document, new Event('visibilitychange'));
    await waitFor(() => expect(mocks.qrLoginStatus).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Увійти за логіном і паролем' }));
    await waitFor(() => expect(onPasswordRequested).toHaveBeenCalled());
    expect(mocks.cancelQrLogin).toHaveBeenCalledWith(challenge.challengeId, challenge.browserToken);
    unmount();
    if (originalVisibility) Object.defineProperty(document, 'visibilityState', originalVisibility);
  });
});
