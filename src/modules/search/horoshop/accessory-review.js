import { createHash } from 'node:crypto';

export const HOROSHOP_CODEX_REVIEW_FORMAT = 'horoshop-codex-accessory-review/v1';

export function codexReviewCatalogRevision(products) {
  return createHash('sha256').update(JSON.stringify(products)).digest('hex');
}
