import { env } from '../../config/env.js';
import { processDueBackups } from './backup.service.js';

export function startBackupWorker({ intervalMs = 60_000 } = {}) {
  let stopped = false;
  let running = false;

  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try {
      await processDueBackups();
    } catch (error) {
      console.error('Backup worker failed', error);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(tick, intervalMs);
  timer.unref();
  if (env.NODE_ENV !== 'test') setTimeout(tick, 5_000).unref();

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
