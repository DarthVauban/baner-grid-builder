import type { Server } from 'node:http';
import { rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const port = 4175;
const mediaDir = path.join(os.tmpdir(), `mt-workspace-e2e-media-${process.pid}`);

export default async function globalSetup() {
  await rm(mediaDir, { recursive: true, force: true });
  Object.assign(process.env, {
    NODE_ENV: 'test',
    PORT: String(port),
    DATABASE_URL: 'pg-mem://mt-workspace-e2e',
    DATABASE_SSL: 'false',
    JWT_SECRET: 'mt-workspace-e2e-secret-with-at-least-32-characters',
    JWT_EXPIRES_IN: '1h',
    COOKIE_NAME: 'mt_e2e_session',
    COOKIE_SECURE: 'false',
    APP_BUILD_SHA: 'e2e-test',
    APP_ORIGIN: `http://127.0.0.1:${port}`,
    CATALOG_MEDIA_DIR: mediaDir,
    ADMIN_NAME: 'E2E Admin',
    ADMIN_EMAIL: 'e2e-admin@test.local',
    ADMIN_PASSWORD: 'E2E-admin-password-2026'
  });

  const [appModule, migrationModule, userModule, poolModule] = await Promise.all([
    import('../../../src/app.js'),
    import('../../../src/db/migrate.js'),
    import('../../../src/modules/users/user.service.js'),
    import('../../../src/db/pool.js')
  ]);

  await migrationModule.runMigrations();
  await userModule.ensureBootstrapAdmin();

  const server = await new Promise<Server>((resolve, reject) => {
    const instance = appModule.default.listen(port, '127.0.0.1', () => resolve(instance));
    instance.once('error', reject);
  });

  return async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    await poolModule.pool.end();
    await rm(mediaDir, { recursive: true, force: true });
  };
}
