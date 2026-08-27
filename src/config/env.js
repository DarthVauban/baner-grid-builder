import 'dotenv/config';
import path from 'node:path';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_SSL: z.enum(['true', 'false']).default('false'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must contain at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('12h'),
  COOKIE_NAME: z.string().default('mt_session'),
  COOKIE_SECURE: z.enum(['true', 'false', 'auto']).default('auto'),
  APP_BUILD_SHA: z.string().min(7).default('development'),
  APP_ENVIRONMENT: z.preprocess(
    (value) => String(value || '').trim().toLowerCase() || undefined,
    z.enum(['development', 'production']).optional()
  ),
  APP_ORIGIN: z.string().optional(),
  STOREFRONT_ORIGIN: z.preprocess(
    (value) => String(value || '').trim() || undefined,
    z.string().url().optional()
  ),
  TRADE_IN_ORIGIN: z.preprocess(
    (value) => String(value || '').trim() || undefined,
    z.string().url().optional()
  ),
  ADMIN_NAME: z.string().optional(),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(10).optional(),
  TELEGRAM_LOCAL_MODE: z.enum(['true', 'false']).default('false'),
  TELEGRAM_API_BASE_URL: z.preprocess(
    (value) => String(value || '').trim() || undefined,
    z.string().url().optional()
  ),
  TELEGRAM_BACKUP_TEMP_DIR: z.preprocess(
    (value) => String(value || '').trim() || undefined,
    z.string().min(1).optional()
  ),
  TELEGRAM_LOCAL_FILE_URI_DIR: z.preprocess(
    (value) => String(value || '').trim() || undefined,
    z.string().min(1).optional()
  ),
  SEARCH_FEATURE_ENABLED: z.enum(['true', 'false']).default('false'),
  OPENSEARCH_URL: z.string().url().default('http://localhost:9200'),
  OPENSEARCH_INDEX_PREFIX: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/).default('mt-search'),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  MOBILE_TOKEN_PEPPER: z.preprocess(
    (value) => String(value || '').trim() || undefined,
    z.string().min(32, 'MOBILE_TOKEN_PEPPER must contain at least 32 characters').optional()
  ),
  MOBILE_PUSH_ENABLED: z.enum(['true', 'false']).default('false'),
  MOBILE_DEPLOYMENT_ID: z.preprocess(
    (value) => String(value || '').trim() || undefined,
    z.string().regex(/^[a-z0-9][a-z0-9._-]{2,159}$/).optional()
  ),
  MOBILE_ENVIRONMENT: z.preprocess(
    (value) => String(value || '').trim().toLowerCase() || undefined,
    z.enum(['development', 'production', 'test']).optional()
  ),
  MOBILE_DEPLOYMENT_NAME: z.preprocess(
    (value) => String(value || '').trim() || undefined,
    z.string().min(1).max(160).optional()
  ),
  MOBILE_PUBLIC_ORIGIN: z.preprocess(
    (value) => String(value || '').trim() || undefined,
    z.string().url().optional()
  ),
  MOBILE_API_BASE_URL: z.preprocess(
    (value) => String(value || '').trim() || undefined,
    z.string().url().optional()
  ),
  MOBILE_QR_LOGIN_ENABLED: z.enum(['true', 'false']).default('false'),
  MOBILE_MULTI_ACCOUNT_PAIRING_ENABLED: z.enum(['true', 'false']).default('false'),
  MOBILE_QR_LOGIN_TTL_SECONDS: z.coerce.number().int().min(60).max(180).default(120),
  MOBILE_QR_CREATE_RATE_LIMIT: z.coerce.number().int().min(1).max(100).default(20),
  MOBILE_QR_STATUS_RATE_LIMIT: z.coerce.number().int().min(60).max(600).default(180),
  MOBILE_QR_PREVIEW_RATE_LIMIT: z.coerce.number().int().min(1).max(100).default(30),
  MOBILE_QR_DECISION_RATE_LIMIT: z.coerce.number().int().min(1).max(100).default(30),
  FIREBASE_PROJECT_ID: z.preprocess(
    (value) => String(value || '').trim() || undefined,
    z.string().min(1).optional()
  ),
  FIREBASE_SERVICE_ACCOUNT_BASE64: z.preprocess(
    (value) => String(value || '').trim() || undefined,
    z.string().min(1).optional()
  ),
  SEARCH_WIDGET_ORIGIN: z.preprocess(
    (value) => String(value || '').trim() || undefined,
    z.string().url().optional()
  ),
  SEARCH_SYNC_INTERVAL_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  SEARCH_ANALYTICS_RAW_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(90)
});

const result = schema.safeParse(process.env);

if (!result.success) {
  const message = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${message}`);
}

const appEnvironment = result.data.APP_ENVIRONMENT
  || (result.data.NODE_ENV === 'production' ? 'production' : 'development');
const telegramLocalMode = result.data.TELEGRAM_LOCAL_MODE === 'true';
const telegramApiBaseUrl = (
  result.data.TELEGRAM_API_BASE_URL
  || (telegramLocalMode ? 'http://telegram-bot-api:8081' : 'https://api.telegram.org')
).replace(/\/$/, '');
if (telegramLocalMode && new URL(telegramApiBaseUrl).hostname === 'api.telegram.org') {
  throw new Error('Invalid environment configuration:\nTELEGRAM_LOCAL_MODE requires a local TELEGRAM_API_BASE_URL.');
}
const telegramBackupTempDir = path.resolve(
  result.data.TELEGRAM_BACKUP_TEMP_DIR || 'storage/telegram-backup-transfer'
);
const telegramLocalFileUriDir = path.resolve(
  result.data.TELEGRAM_LOCAL_FILE_URI_DIR || telegramBackupTempDir
);
const mobileEnvironment = result.data.MOBILE_ENVIRONMENT
  || (result.data.NODE_ENV === 'test' ? 'test' : appEnvironment);
if (result.data.MOBILE_ENVIRONMENT
  && result.data.APP_ENVIRONMENT
  && result.data.MOBILE_ENVIRONMENT !== result.data.APP_ENVIRONMENT
  && result.data.NODE_ENV !== 'test') {
  throw new Error('Invalid environment configuration:\nMOBILE_ENVIRONMENT must match APP_ENVIRONMENT.');
}

const defaultMobileOrigin = mobileEnvironment === 'production'
  ? 'https://mt-panel.sbs'
  : mobileEnvironment === 'development'
    ? 'https://dev.mt-panel.sbs'
    : 'http://localhost:3000';
const mobilePublicOrigin = new URL(
  result.data.MOBILE_PUBLIC_ORIGIN || result.data.APP_ORIGIN || defaultMobileOrigin
).origin;
const configuredMobilePublicOrigin = result.data.MOBILE_PUBLIC_ORIGIN?.replace(/\/$/, '');
if (configuredMobilePublicOrigin && configuredMobilePublicOrigin !== mobilePublicOrigin) {
  throw new Error('Invalid environment configuration:\nMOBILE_PUBLIC_ORIGIN must be an origin without a path.');
}
const mobileApiBaseUrl = (result.data.MOBILE_API_BASE_URL || `${mobilePublicOrigin}/api`).replace(/\/$/, '');
for (const [name, value] of [
  ['MOBILE_PUBLIC_ORIGIN', mobilePublicOrigin],
  ['MOBILE_API_BASE_URL', mobileApiBaseUrl]
]) {
  const parsed = new URL(value);
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
  if (result.data.NODE_ENV !== 'test' && !isLocal && parsed.protocol !== 'https:') {
    throw new Error(`Invalid environment configuration:\n${name} must use HTTPS outside local development.`);
  }
}

export const env = {
  ...result.data,
  isProduction: result.data.NODE_ENV === 'production',
  databaseSsl: result.data.DATABASE_SSL === 'true',
  searchFeatureEnabled: result.data.SEARCH_FEATURE_ENABLED === 'true',
  telegramLocalMode,
  telegramApiBaseUrl,
  telegramBackupTempDir,
  telegramLocalFileUriDir,
  mobileTokenPepper: result.data.MOBILE_TOKEN_PEPPER || result.data.JWT_SECRET,
  mobilePushEnabled: result.data.MOBILE_PUSH_ENABLED === 'true',
  mobileDeploymentId: result.data.MOBILE_DEPLOYMENT_ID || `mt-workspace-${mobileEnvironment}`,
  mobileEnvironment,
  mobileDeploymentName: result.data.MOBILE_DEPLOYMENT_NAME || 'MT Workspace',
  mobilePublicOrigin,
  mobileApiBaseUrl,
  mobileQrLoginEnabled: result.data.MOBILE_QR_LOGIN_ENABLED === 'true',
  mobileMultiAccountPairingEnabled: result.data.MOBILE_MULTI_ACCOUNT_PAIRING_ENABLED === 'true',
  mobileQrLoginTtlSeconds: result.data.MOBILE_QR_LOGIN_TTL_SECONDS,
  cookieSecure: result.data.COOKIE_SECURE === 'auto'
    ? result.data.NODE_ENV === 'production'
    : result.data.COOKIE_SECURE === 'true'
};
