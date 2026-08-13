import { horoshopCatalogService } from './catalog.service.js';

async function synchronizeIfDue() {
  const status = await horoshopCatalogService.status();
  if (!status.configured || ['disconnecting', 'purge_failed'].includes(status.status)) return;
  const intervalMilliseconds = (status.pollingIntervalMinutes || 15) * 60_000;
  const lastSync = status.lastSyncAt ? Date.parse(status.lastSyncAt) : 0;
  if (status.status === 'connected' && lastSync && Date.now() - lastSync < intervalMilliseconds) return;
  await horoshopCatalogService.startSync('scheduled');
}

export function startHoroshopCatalogWorker() {
  const run = () => {
    void synchronizeIfDue().catch((error) => {
      const expected = ['HOROSHOP_NOT_CONNECTED', 'HOROSHOP_CONNECTION_BLOCKED'];
      if (expected.includes(error?.code)) return;
      console.error(JSON.stringify({
        event: 'horoshop_catalog_worker_failed',
        message: error instanceof Error ? error.message : 'unknown'
      }));
    });
  };
  const warmup = setTimeout(run, 5_000);
  warmup.unref();
  const interval = setInterval(run, 60_000);
  interval.unref();
  return () => {
    clearTimeout(warmup);
    clearInterval(interval);
  };
}
