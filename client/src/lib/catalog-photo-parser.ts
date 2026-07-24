import type { CatalogPhotoParserRunStatus } from '../types/catalog';

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
