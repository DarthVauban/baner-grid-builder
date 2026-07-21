import 'dotenv/config';
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
  APP_ORIGIN: z.string().optional(),
  STOREFRONT_ORIGIN: z.preprocess(
    (value) => String(value || '').trim() || undefined,
    z.string().url().optional()
  ),
  ADMIN_NAME: z.string().optional(),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(10).optional()
});

const result = schema.safeParse(process.env);

if (!result.success) {
  const message = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${message}`);
}

export const env = {
  ...result.data,
  isProduction: result.data.NODE_ENV === 'production',
  databaseSsl: result.data.DATABASE_SSL === 'true',
  cookieSecure: result.data.COOKIE_SECURE === 'auto'
    ? result.data.NODE_ENV === 'production'
    : result.data.COOKIE_SECURE === 'true'
};
