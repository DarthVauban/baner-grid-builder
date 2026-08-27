export interface MailtrapIntegration {
  configured: boolean;
  token: string;
  senderEmail: string;
  senderName: string;
  domain: string;
  updatedAt: string | null;
}

export interface IntegrationSettings {
  mailtrap: MailtrapIntegration;
  telegram: TelegramIntegration;
}

export interface MailtrapIntegrationInput {
  senderEmail: string;
  senderName: string;
  token: string;
}

export interface TelegramIntegration {
  configured: boolean;
  tokenConfigured: boolean;
  chatId: string;
  botUsername: string;
  botName: string;
  updatedAt: string | null;
  localApi: TelegramLocalApiIntegration;
}

export interface TelegramIntegrationInput {
  chatId: string;
  token: string;
}

export interface TelegramLocalApiIntegration {
  enabled: boolean;
  credentialsConfigured: boolean;
  documentLimitBytes: number;
  updatedAt: string | null;
}

export interface TelegramLocalApiIntegrationInput {
  apiId: string;
  apiHash: string;
}

export type HoroshopConnectionStatus =
  | 'disconnected'
  | 'connected'
  | 'syncing'
  | 'error'
  | 'disconnecting'
  | 'purge_failed';

export interface HoroshopSyncRun {
  id: string;
  mode: 'full' | 'manual' | 'scheduled';
  status: 'running' | 'succeeded' | 'failed';
  categoriesReceived: number;
  productsReceived: number;
  modificationsReceived: number;
  pagesReceived: number;
  exportItemsReceived: number;
  exportItemsTotal: number | null;
  progressPercentage: number | null;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
}

export interface HoroshopIntegration {
  configured: boolean;
  status: HoroshopConnectionStatus;
  storeDomain: string;
  pollingIntervalMinutes: number | null;
  lastSyncAt: string | null;
  lastError: string | null;
  counts: {
    categories: number;
    products: number;
    modifications: number;
  };
  latestRun: HoroshopSyncRun | null;
}

export interface HoroshopIntegrationInput {
  storeDomain: string;
  login: string;
  password: string;
  pollingIntervalMinutes: number;
}

export interface HoroshopIntegrationSettingsInput {
  pollingIntervalMinutes: number;
}

export type BackupScheduleType = 'daily' | 'weekly';
export type BackupRunTrigger = 'manual' | 'scheduled' | 'restore';
export type BackupRunStatus = 'success' | 'failed';

export interface BackupSettings {
  automaticEnabled: boolean;
  scheduleType: BackupScheduleType;
  scheduleTime: string;
  scheduleWeekday: number;
  timezone: string;
  nextRunAt: string | null;
  lastRunAt: string | null;
  updatedAt: string | null;
}

export interface BackupRun {
  id: string;
  trigger: BackupRunTrigger;
  status: BackupRunStatus;
  fileName: string;
  sizeBytes: number;
  telegramMessageId: number | null;
  errorMessage: string;
  startedAt: string;
  completedAt: string;
}

export interface BackupAdminState {
  settings: BackupSettings;
  runs: BackupRun[];
  telegramDocumentLimitBytes: number;
  restoreArchiveLimitBytes: number;
}

export interface BackupRestoreResult {
  run: BackupRun;
  backupCreatedAt: string;
}
