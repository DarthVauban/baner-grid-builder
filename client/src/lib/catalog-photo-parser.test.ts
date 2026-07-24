import { describe, expect, it } from 'vitest';
import {
  catalogPhotoGoogleSearchUrl,
  catalogPhotoParserBatchIsBusy,
  catalogPhotoParserBatchIsComplete,
  catalogPhotoParserStatusLabels
} from './catalog-photo-parser';
import type { CatalogPhotoParserBatch } from '../types/catalog';

describe('catalog photo parser helpers', () => {
  it('builds a default Google search query from the product name', () => {
    const url = new URL(catalogPhotoGoogleSearchUrl('  Apple   iPhone 15 Pro  '));
    expect(url.origin).toBe('https://www.google.com');
    expect(url.searchParams.has('tbm')).toBe(false);
    expect(url.searchParams.get('q')).toBe('Apple iPhone 15 Pro');
  });

  it('has a user-facing label for every parser status', () => {
    expect(Object.keys(catalogPhotoParserStatusLabels).sort()).toEqual([
      'failed',
      'partial',
      'queued',
      'running',
      'success'
    ]);
  });

  it('does not block retries when every run is final but the stored batch status is stale', () => {
    const staleBatch: CatalogPhotoParserBatch = {
      id: 'batch-1',
      status: 'running',
      requestedCount: 1,
      counts: { queued: 0, running: 0, success: 0, partial: 0, failed: 1 },
      items: [],
      createdAt: '2026-07-24T16:00:00.000Z',
      startedAt: '2026-07-24T16:00:01.000Z',
      completedAt: null
    };

    expect(catalogPhotoParserBatchIsComplete(staleBatch)).toBe(true);
    expect(catalogPhotoParserBatchIsBusy(staleBatch)).toBe(false);
    expect(catalogPhotoParserBatchIsBusy({
      ...staleBatch,
      counts: { ...staleBatch.counts, running: 1, failed: 0 }
    })).toBe(true);
  });
});
