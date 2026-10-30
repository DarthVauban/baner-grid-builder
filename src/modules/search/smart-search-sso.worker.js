import { cleanupExpiredSsoRecords } from './smart-search-sso.service.js';

export function startSmartSearchSsoCleanupWorker() {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await cleanupExpiredSsoRecords({ limit: 100 });
    } catch {
      console.error(JSON.stringify({ event: 'smart_search_sso_cleanup_unavailable' }));
    } finally {
      running = false;
    }
  };
  const timer = setInterval(run, 60_000);
  timer.unref();
  return () => clearInterval(timer);
}
