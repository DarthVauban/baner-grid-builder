import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MobileDevice, TwoFactorStatus, User } from '../types/user';
import { MobilePairingModal, ProfilePage } from './ProfilePage';

const mocks = vi.hoisted(() => ({
  twoFactorStatus: vi.fn(),
  passkeys: vi.fn(),
  mobileDevices: vi.fn(),
  createMobilePairing: vi.fn(),
  mobilePairing: vi.fn(),
  cancelMobilePairing: vi.fn(),
  acknowledgeMobilePairing: vi.fn(),
  refreshUser: vi.fn(),
  updateProfile: vi.fn(),
  showToast: vi.fn()
}));

const profileUser: User = {
  id: '10000000-0000-4000-8000-000000000001',
  name: 'Дмитро Тестовий',
  firstName: 'Дмитро',
  lastName: 'Тестовий',
  email: 'dmytro@example.com',
  department: 'Маркетинг',
  position: 'Менеджер',
  avatarUrl: '',
  role: 'admin',
  status: 'approved',
  twoFactorEnabled: false,
  twoFactorMethod: null,
  twoFactorConfirmedAt: null,
  isPrimaryAdmin: false,
  approvedAt: '2030-01-01T00:00:00.000Z',
  createdAt: '2030-01-01T00:00:00.000Z',
  updatedAt: '2030-01-01T00:00:00.000Z'
};

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    user: profileUser,
    refreshUser: mocks.refreshUser,
    updateProfile: mocks.updateProfile
  })
}));

vi.mock('../toast/ToastContext', () => ({
  useToast: () => ({ showToast: mocks.showToast })
}));

vi.mock('../lib/api', () => ({
  api: {
    users: {
      twoFactorStatus: mocks.twoFactorStatus,
      passkeys: mocks.passkeys,
      mobileDevices: mocks.mobileDevices,
      createMobilePairing: mocks.createMobilePairing,
      mobilePairing: mocks.mobilePairing,
      cancelMobilePairing: mocks.cancelMobilePairing,
      acknowledgeMobilePairing: mocks.acknowledgeMobilePairing
    }
  }
}));

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,pairing') }
}));

const disabledStatus: TwoFactorStatus = {
  enabled: false,
  method: null,
  confirmedAt: null,
  recoveryCodesRemaining: 0,
  activeMobileDeviceCount: 0
};

const phone: MobileDevice = {
  id: '20000000-0000-4000-8000-000000000001',
  name: 'Pixel 10 · Android 16',
  platform: 'android',
  pairedAt: '2030-01-02T00:00:00.000Z',
  lastSeenAt: '2030-01-03T00:00:00.000Z',
  pushConfigured: true,
  qrLoginSupported: true,
  authKeyRegisteredAt: '2030-01-02T00:00:00.000Z',
  revokedAt: null
};

describe('ProfilePage mobile security controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.twoFactorStatus.mockResolvedValue(disabledStatus);
    mocks.passkeys.mockResolvedValue([]);
    mocks.mobileDevices.mockResolvedValue({ items: [] });
    mocks.cancelMobilePairing.mockResolvedValue(undefined);
    mocks.refreshUser.mockResolvedValue(undefined);
  });

  it('offers MT Workspace and Google Authenticator before enabling 2FA', async () => {
    render(<ProfilePage />);
    await waitFor(() => expect(mocks.twoFactorStatus).toHaveBeenCalled());
    await userEvent.click(screen.getByRole('button', { name: /Увімкнути/ }));

    expect(screen.getByRole('heading', { name: 'Оберіть спосіб 2FA' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /MT Workspace/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Google Authenticator/ })).toBeInTheDocument();
  });

  it('shows registered MT Workspace devices and guarded revoke control', async () => {
    mocks.twoFactorStatus.mockResolvedValue({
      enabled: true,
      method: 'mt_workspace',
      confirmedAt: '2030-01-02T00:00:00.000Z',
      recoveryCodesRemaining: 8,
      activeMobileDeviceCount: 1
    });
    mocks.mobileDevices.mockResolvedValue({ items: [phone, {
      ...phone,
      id: '20000000-0000-4000-8000-000000000002',
      name: 'Legacy Android',
      qrLoginSupported: false,
      authKeyRegisteredAt: null
    }] });

    render(<ProfilePage />);
    expect(await screen.findByText(phone.name)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Додати пристрій/ })).toBeInTheDocument();
    expect(screen.getByText('QR-вхід підтримується')).toBeInTheDocument();
    expect(screen.getByText('Потрібне оновлення застосунку')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: `Відкликати пристрій ${phone.name}` }));

    expect(screen.getByRole('heading', { name: 'Відкликати пристрій?' })).toBeInTheDocument();
    expect(screen.getByLabelText('Код 2FA або резервний код')).toBeInTheDocument();
  });

  it('shows environment metadata, multi-account guidance and the manual pairing fallback', async () => {
    mocks.createMobilePairing.mockResolvedValue({
      id: '30000000-0000-4000-8000-000000000001',
      status: 'pending',
      purpose: 'enable_2fa',
      qrPayload: 'mtworkspace://pair?v=2&deploymentId=mt-workspace-development&token=opaque',
      manualCode: '1234-5678',
      expiresAt: '2099-08-12T12:05:00.000Z',
      workspace: {
        deploymentId: 'mt-workspace-development',
        environment: 'development',
        displayName: 'MT Workspace Dev',
        webOrigin: 'https://dev.mt-panel.sbs',
        apiBaseUrl: 'https://dev.mt-panel.sbs/api'
      }
    });
    mocks.mobilePairing.mockResolvedValue({
      id: '30000000-0000-4000-8000-000000000001',
      status: 'pending',
      expiresAt: '2099-08-12T12:05:00.000Z'
    });

    render(<MobilePairingModal purpose="enable_2fa" onClose={vi.fn()} onConnected={vi.fn()} />);

    expect(await screen.findByRole('img', { name: 'QR-код для MT Workspace' })).toBeInTheDocument();
    expect(screen.getByText('DEV')).toBeInTheDocument();
    expect(screen.getByText(/MT Workspace Dev · https:\/\/dev\.mt-panel\.sbs/)).toBeInTheDocument();
    expect(screen.getByText(/уже підключені в застосунку акаунти не видаляються/)).toBeInTheDocument();
    expect(screen.getByText('1234-5678')).toBeInTheDocument();
  });
});
