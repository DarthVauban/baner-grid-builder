import type { HoroshopIntegration } from '../types/integration';
import type { HoroshopCatalogFeed, HoroshopCatalogParams } from '../types/horoshop-catalog';
import type {
  HoroshopAccessoryCandidates,
  HoroshopAccessoryBulkPublishProgress,
  HoroshopAccessoryBulkPublishResult,
  HoroshopAccessoryBulkPublishSummary,
  HoroshopAccessoryDetail,
  HoroshopAccessoryDraftItem,
  HoroshopCodexAcceptResult,
  HoroshopCodexReviewCatalog,
  HoroshopCodexReviewProposal,
  HoroshopCodexReviewResult
} from '../types/horoshop-accessory';
import type {
  HoroshopPhotoBatch,
  HoroshopPhotoDesktopDevice,
  HoroshopPhotoDesktopPairing,
  HoroshopPhotoPublicationMode,
  HoroshopPhotoPublishProgress,
  HoroshopPhotoPublishResult,
  HoroshopPhotoSelection,
  HoroshopPhotoSelectionSummary
} from '../types/horoshop-photo';
import { jsonBody, queryString, request, requestNdjson } from './api-client';

const HOROSHOP_PUBLICATION_IDLE_TIMEOUT_MS = 30_000;

export const horoshopApi = {
  horoshopCatalog: {
    list: (params: HoroshopCatalogParams = {}, signal?: AbortSignal) => request<HoroshopCatalogFeed>(
      `/api/search/horoshop/catalog${queryString({
        search: params.search,
        category: params.category,
        availability: params.availability,
        visibility: params.visibility,
        state: params.state,
        createdFrom: params.createdFrom,
        createdTo: params.createdTo,
        photoStatus: params.photoStatus,
        page: params.page,
        pageSize: params.pageSize
      })}`,
      { signal }
    ),
    sync: () => request<{ started: boolean; integration: HoroshopIntegration }>(
      '/api/search/horoshop/sync',
      { method: 'POST' }
    )
  },
  horoshopAccessories: {
    reviewCatalog: (signal?: AbortSignal) => request<HoroshopCodexReviewCatalog>(
      '/api/search/horoshop/accessories/review/catalog',
      { signal, timeoutMs: 45_000 }
    ),
    importReview: (document: HoroshopCodexReviewProposal) => request<HoroshopCodexReviewResult>(
      '/api/search/horoshop/accessories/review/proposals',
      { method: 'POST', body: jsonBody(document), timeoutMs: 300_000 }
    ),
    acceptAllReviewProposals: () => request<HoroshopCodexAcceptResult>(
      '/api/search/horoshop/accessories/review/proposals/accept-all',
      { method: 'POST', timeoutMs: 300_000 }
    ),
    publicationSummary: (signal?: AbortSignal) => request<HoroshopAccessoryBulkPublishSummary>(
      '/api/search/horoshop/accessories/publications/pending',
      { signal }
    ),
    publishAll: (onProgress: (progress: HoroshopAccessoryBulkPublishProgress) => void) => requestNdjson<HoroshopAccessoryBulkPublishProgress, HoroshopAccessoryBulkPublishResult>(
      '/api/search/horoshop/accessories/publications/publish-all/stream',
      { method: 'POST', body: jsonBody({ confirmOverwrite: true }), timeoutMs: 900_000, idleTimeoutMs: 0 },
      onProgress
    ),
    detail: (productId: string, signal?: AbortSignal) => request<HoroshopAccessoryDetail>(
      `/api/search/horoshop/accessories/products/${encodeURIComponent(productId)}`,
      { signal }
    ),
    candidates: (productId: string, search: string, signal?: AbortSignal) => request<HoroshopAccessoryCandidates>(
      `/api/search/horoshop/accessories/products/${encodeURIComponent(productId)}/candidates${queryString({ search })}`,
      { signal }
    ),
    saveDraft: (productId: string, items: HoroshopAccessoryDraftItem[]) => request<HoroshopAccessoryDetail>(
      `/api/search/horoshop/accessories/products/${encodeURIComponent(productId)}/draft`,
      { method: 'PUT', body: jsonBody({ items }) }
    ),
    acceptReviewProposals: (productId: string) => request<HoroshopCodexAcceptResult>(
      `/api/search/horoshop/accessories/products/${encodeURIComponent(productId)}/review/proposals/accept`,
      { method: 'POST' }
    ),
    publish: (productId: string) => request<HoroshopAccessoryDetail>(
      `/api/search/horoshop/accessories/products/${encodeURIComponent(productId)}/publish`,
      { method: 'POST', body: jsonBody({ confirmOverwrite: true }), timeoutMs: 45_000 }
    )
  },
  horoshopPhotos: {
    catalogSyncStatus: () => request<{ integration: HoroshopIntegration }>(
      '/api/search/horoshop/photos/catalog/sync'
    ),
    syncCatalog: () => request<{ started: boolean; integration: HoroshopIntegration }>(
      '/api/search/horoshop/photos/catalog/sync',
      { method: 'POST' }
    ),
    desktopDevices: () => request<HoroshopPhotoDesktopDevice[]>('/api/search/horoshop/photos/desktop/devices'),
    createDesktopPairing: () => request<HoroshopPhotoDesktopPairing>(
      '/api/search/horoshop/photos/desktop/pairings',
      { method: 'POST' }
    ),
    desktopPairing: (pairingId: string) => request<HoroshopPhotoDesktopPairing>(
      `/api/search/horoshop/photos/desktop/pairings/${encodeURIComponent(pairingId)}`
    ),
    revokeDesktopDevice: (deviceId: string) => request<void>(
      `/api/search/horoshop/photos/desktop/devices/${encodeURIComponent(deviceId)}`,
      { method: 'DELETE' }
    ),
    selections: () => request<HoroshopPhotoSelectionSummary[]>('/api/search/horoshop/photos/selections'),
    selection: (selectionId: string, signal?: AbortSignal) => request<HoroshopPhotoSelection>(
      `/api/search/horoshop/photos/selections/${encodeURIComponent(selectionId)}`,
      { signal }
    ),
    createSelection: (input: { name?: string; entries: string[] }) => request<HoroshopPhotoSelection>(
      '/api/search/horoshop/photos/selections',
      { method: 'POST', body: jsonBody(input), timeoutMs: 60_000 }
    ),
    createFilteredSelection: (input: {
      name?: string;
      filters: Pick<HoroshopCatalogParams,
        'search' | 'category' | 'availability' | 'visibility' | 'createdFrom' | 'createdTo' | 'photoStatus'>;
    }) => request<HoroshopPhotoSelection>(
      '/api/search/horoshop/photos/selections/from-filter',
      { method: 'POST', body: jsonBody(input), timeoutMs: 120_000 }
    ),
    removeSelection: (selectionId: string) => request<void>(
      `/api/search/horoshop/photos/selections/${encodeURIComponent(selectionId)}`,
      { method: 'DELETE' }
    ),
    addSelectionItem: (selectionId: string, input: {
      productId: string;
      modificationId?: string | null;
      inputValue?: string;
    }) => request<HoroshopPhotoSelection>(
      `/api/search/horoshop/photos/selections/${encodeURIComponent(selectionId)}/items`,
      { method: 'POST', body: jsonBody(input) }
    ),
    removeSelectionItem: (selectionId: string, itemId: string) => request<HoroshopPhotoSelection>(
      `/api/search/horoshop/photos/selections/${encodeURIComponent(selectionId)}/items/${encodeURIComponent(itemId)}`,
      { method: 'DELETE' }
    ),
    saveDraft: (input: { productId: string; modificationId?: string | null; sourceUrl: string }) => request<{
      id: string;
      sourceUrl: string;
    }>('/api/search/horoshop/photos/drafts', { method: 'PUT', body: jsonBody(input) }),
    selectAssets: (draftId: string, assetIds: string[]) => request<{ updated: boolean }>(
      `/api/search/horoshop/photos/drafts/${encodeURIComponent(draftId)}/assets`,
      { method: 'PUT', body: jsonBody({ assetIds }) }
    ),
    parseSelection: (selectionId: string) => request<HoroshopPhotoBatch>(
      `/api/search/horoshop/photos/selections/${encodeURIComponent(selectionId)}/parse`,
      { method: 'POST' }
    ),
    parseDraft: (draftId: string) => request<HoroshopPhotoBatch>(
      `/api/search/horoshop/photos/drafts/${encodeURIComponent(draftId)}/parse`,
      { method: 'POST' }
    ),
    activeBatch: (selectionId?: string) => request<HoroshopPhotoBatch | null>(
      `/api/search/horoshop/photos/batches/active${queryString({ selectionId })}`
    ),
    batch: (batchId: string) => request<HoroshopPhotoBatch>(
      `/api/search/horoshop/photos/batches/${encodeURIComponent(batchId)}`
    ),
    publishDraft: (draftId: string, mode: HoroshopPhotoPublicationMode) => request<HoroshopPhotoPublishResult>(
      `/api/search/horoshop/photos/drafts/${encodeURIComponent(draftId)}/publish`,
      { method: 'POST', body: jsonBody({ mode }), timeoutMs: 420_000 }
    ),
    publishSelection: (
      selectionId: string,
      mode: HoroshopPhotoPublicationMode,
      onProgress: (progress: HoroshopPhotoPublishProgress) => void
    ) => requestNdjson<HoroshopPhotoPublishProgress, HoroshopPhotoPublishResult>(
      `/api/search/horoshop/photos/selections/${encodeURIComponent(selectionId)}/publish/stream`,
      { method: 'POST', body: jsonBody({ mode }), idleTimeoutMs: HOROSHOP_PUBLICATION_IDLE_TIMEOUT_MS },
      onProgress
    )
  }
};
