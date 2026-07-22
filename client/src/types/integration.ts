export interface MailtrapIntegration {
  configured: boolean;
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
  chatId: string;
  botUsername: string;
  botName: string;
  updatedAt: string | null;
}

export interface TelegramIntegrationInput {
  chatId: string;
  token: string;
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
}

export interface BackupRestoreResult {
  run: BackupRun;
  backupCreatedAt: string;
}
