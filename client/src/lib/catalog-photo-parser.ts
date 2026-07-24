import type { CatalogPhotoParserBatch, CatalogPhotoParserRunStatus } from '../types/catalog';

export const catalogPhotoParserStatusLabels: Record<CatalogPhotoParserRunStatus, string> = {
  queued: 'У черзі',
  running: 'Обробляється',
  success: 'Готово',
  partial: 'Частково',
  failed: 'Помилка'
};

export function catalogPhotoGoogleSearchUrl(productName: string) {
  const query = `${String(productName || '').replace(/\s+/g, ' ').trim()} фото`;
  return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`;
}

export function catalogPhotoParserBatchIsComplete(batch: CatalogPhotoParserBatch | null | undefined) {
  if (!batch) return false;
  if (batch.status === 'completed') return true;
  const pending = batch.counts.queued + batch.counts.running;
  const complete = batch.counts.success + batch.counts.partial + batch.counts.failed;
  return pending === 0 && complete >= batch.requestedCount;
}

export function catalogPhotoParserBatchIsBusy(batch: CatalogPhotoParserBatch | null | undefined) {
  if (!batch || catalogPhotoParserBatchIsComplete(batch)) return false;
  return batch.status === 'queued' || batch.status === 'running';
}
