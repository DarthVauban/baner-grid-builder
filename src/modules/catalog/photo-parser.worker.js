import { env } from '../../config/env.js';
import { getMaintenanceReason } from '../backups/maintenance.service.js';
import { ensureBuiltInPhotoParserAdapters } from './photo-parser.adapters.js';
import { closePhotoParserBrowser } from './photo-parser.browser.js';
import {
  claimNextPhotoParserRun,
  processPhotoParserRun,
  reconcilePhotoParserBatches,
  recoverInterruptedPhotoParserRuns
} from './photo-parser.service.js';
import { horoshopPhotoService } from '../search/horoshop/photo.service.js';

export async function processPhotoParserQueue({
  limit = 1,
  lockRows = env.NODE_ENV !== 'test',
  processRun = processPhotoParserRun
} = {}) {
  if (getMaintenanceReason()) return 0;
  let processed = 0;
  try {
    while (processed < limit) {
      const run = await claimNextPhotoParserRun({ lockRows });
      if (!run) break;
      await processRun(run);
      processed += 1;
    }
    return processed;
  } finally {
    await reconcilePhotoParserBatches();
  }
}

export async function processHoroshopPhotoParserQueue({
  limit = 1,
  lockRows = env.NODE_ENV !== 'test',
  service = horoshopPhotoService
} = {}) {
  if (getMaintenanceReason()) return 0;
  let processed = 0;
  try {
    while (processed < limit) {
      const run = await service.claimNextRun({ lockRows });
      if (!run) break;
      await service.processRun(run);
      processed += 1;
    }
    return processed;
  } finally {
    await service.reconcileBatches();
  }
}

export function startPhotoParserWorker({ intervalMs = 1500 } = {}) {
  let stopped = false;
  let running = false;

  const tick = async () => {
    if (stopped || running || getMaintenanceReason()) return;
    running = true;
    try {
      await processPhotoParserQueue();
      await processHoroshopPhotoParserQueue();
    } catch (error) {
      console.error('Photo parser worker failed', error);
    } finally {
      running = false;
    }
  };

  void (async () => {
    try {
      await ensureBuiltInPhotoParserAdapters();
      await recoverInterruptedPhotoParserRuns();
      await horoshopPhotoService.recoverInterruptedRuns();
      await tick();
    } catch (error) {
      console.error('Photo parser worker initialization failed', error);
    }
  })();

  const timer = setInterval(tick, intervalMs);
  timer.unref();

  return async () => {
    stopped = true;
    clearInterval(timer);
    await closePhotoParserBrowser();
  };
}
