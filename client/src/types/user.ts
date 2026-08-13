import type { startAuthentication, startRegistration } from '@simplewebauthn/browser';

export type UserRole = 'admin' | 'editor' | 'content_manager' | 'manager';
export type UserStatus = 'pending' | 'approved' | 'rejected';

export interface User {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  department: string;
  position: string;
  avatarUrl: string;
  role: UserRole;
  status: UserStatus;
  canManageToolAccess?: boolean;
  twoFactorEnabled: boolean;
  twoFactorMethod: 'totp' | 'mt_workspace' | null;
  twoFactorConfirmedAt: string | null;
  isPrimaryAdmin: boolean;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface TwoFactorLoginChallenge {
  twoFactorRequired: true;
  twoFactorMethod: 'totp' | 'mt_workspace';
  passkeyAvailable: boolean;
  challengeToken: string;
  expiresAt: string;
  email: string;
  mobileApproval?: {
    requestId: string;
    status: MobileLoginRequestStatus;
    pollingIntervalMs: number;
    activeDeviceCount: number;
  };
}

export type LoginResponse = User | TwoFactorLoginChallenge;

export interface TwoFactorLoginVerifyInput {
  challengeToken: string;
  code: string;
}

export type MobileLoginRequestStatus = 'pending' | 'approved' | 'denied' | 'expired';

export interface MobileLoginStatusInput {
  challengeToken: string;
  requestId: string;
}

export interface MobileLoginStatus {
  requestId: string;
  status: MobileLoginRequestStatus;
  expiresAt: string;
  user: User | null;
}

export type PasskeyAuthenticationResponse = Awaited<ReturnType<typeof startAuthentication>>;
export type PasskeyRegistrationResponse = Awaited<ReturnType<typeof startRegistration>>;
export type PasskeyAuthenticationOptions = Parameters<typeof startAuthentication>[0]['optionsJSON'];
export type PasskeyRegistrationOptions = Parameters<typeof startRegistration>[0]['optionsJSON'];

export interface PasskeyLoginStart {
  challengeId: string;
  expiresAt: string;
  options: PasskeyAuthenticationOptions;
}

export interface PasskeyRegistrationStart {
  challengeId: string;
  expiresAt: string;
  name: string;
  options: PasskeyRegistrationOptions;
}

export interface UserPasskey {
  id: string;
  name: string;
  deviceType: 'singleDevice' | 'multiDevice';
  backedUp: boolean;
  transports: string[];
  createdAt: string;
  lastUsedAt: string | null;
}

export interface RegisterInput extends LoginInput {
  firstName: string;
  lastName: string;
  avatarDataUrl: string;
}

export interface RegistrationStart {
  email: string;
  expiresAt: string;
  resendAvailableAt: string;
  devCode?: string;
}

export interface RegistrationVerifyInput {
  email: string;
  code: string;
}

export interface ProfileInput {
  firstName: string;
  lastName: string;
  email: string;
  department: string;
  position: string;
  avatarDataUrl: string | null;
}

export interface PasswordChangeInput {
  currentPassword: string;
  newPassword: string;
}

export interface TwoFactorStatus {
  enabled: boolean;
  method: 'totp' | 'mt_workspace' | null;
  confirmedAt: string | null;
  recoveryCodesRemaining: number;
  activeMobileDeviceCount: number;
}

export interface TwoFactorSetup {
  issuer: string;
  accountName: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
  manualKey: string;
  expiresAt: string;
}

export interface TwoFactorConfirmResult {
  user: User;
  recoveryCodes: string[];
}

export type MobilePairingStatus = 'pending' | 'claimed' | 'expired' | 'cancelled';

export type MobileEnvironment = 'production' | 'development' | 'test';

export interface MobileWorkspaceMetadata {
  deploymentId: string;
  environment: MobileEnvironment;
  displayName: string;
  webOrigin: string;
  apiBaseUrl?: string;
}

export interface MobileDevice {
  id: string;
  name: string;
  platform: 'android' | 'ios';
  pairedAt: string;
  lastSeenAt: string | null;
  pushConfigured: boolean;
  qrLoginSupported: boolean;
  authKeyRegisteredAt: string | null;
  revokedAt: string | null;
}

export interface MobilePairing {
  id: string;
  status: MobilePairingStatus;
  purpose?: 'enable_2fa' | 'add_device';
  qrPayload?: string;
  manualCode?: string;
  expiresAt: string;
  device?: MobileDevice | null;
  recoveryCodes?: string[];
  workspace?: MobileWorkspaceMetadata;
}

export interface QrLoginConfig {
  enabled: boolean;
  multiAccountPairingEnabled: boolean;
  ttlSeconds: number;
  pollAfterMs: number;
  deployment: MobileWorkspaceMetadata;
}

export interface QrLoginChallenge {
  challengeId: string;
  browserToken: string;
  qrPayload: string;
  expiresAt: string;
  pollAfterMs: number;
  deployment: MobileWorkspaceMetadata;
}

export type QrLoginStatusValue = 'pending' | 'scanned' | 'approved' | 'denied' | 'expired' | 'cancelled' | 'consumed';

export interface QrLoginStatus {
  status: QrLoginStatusValue;
  expiresAt: string;
}

export interface QrLoginConsumeResult {
  user: User;
  returnPath: string;
}

export interface MobileDeviceFeed {
  items: MobileDevice[];
}

export type SavedDataResource = 'banner_grids' | 'saved_banners' | 'product_tables';
export type PermissionRole = 'editor' | 'content_manager';

export interface RolePermission {
  role: PermissionRole;
  resource: SavedDataResource;
  canViewAll: boolean;
  updatedAt: string;
}

export interface UserDirectory {
  items: User[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  summary: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
  };
}

export interface UserApplicationNotificationSettings {
  userId: string;
  forms: Array<{
    formId: string;
    name: string;
    status: 'draft' | 'published' | 'disabled';
    enabled: boolean;
  }>;
}
