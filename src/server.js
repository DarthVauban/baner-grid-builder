import app from './app.js';
import { env } from './config/env.js';
import { pool } from './db/pool.js';
import { runMigrations } from './db/migrate.js';
import { ensureBootstrapAdmin } from './modules/users/user.service.js';
import { startReminderWorker } from './modules/tasks/reminder.worker.js';
import { startPublicationWorker } from './modules/publications/publication.worker.js';
import { startBackupWorker } from './modules/backups/backup.worker.js';

await runMigrations();
await ensureBootstrapAdmin();

const server = app.listen(env.PORT, () => {
  console.log(`MT Workspace is running on port ${env.PORT}`);
});
const stopReminderWorker = env.NODE_ENV === 'test' ? () => {} : startReminderWorker();
const stopPublicationWorker = env.NODE_ENV === 'test' ? () => {} : startPublicationWorker();
const stopBackupWorker = env.NODE_ENV === 'test' ? () => {} : startBackupWorker();

async function shutdown(signal) {
  console.log(`${signal} received. Shutting down...`);
  stopReminderWorker();
  stopPublicationWorker();
  stopBackupWorker();
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });

  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
