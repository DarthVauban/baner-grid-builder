import { jsonBody, queryString, request } from './api-client';
import type { StickerCatalog, StickerFilters, StickerOperation, StickerOperationSummary, StickerPreviewInput, StickerResolution, StickerSelection, StickerSelectionSummary } from '../types/horoshop-sticker';

const base = '/api/search/horoshop/stickers';
export const horoshopStickers = {
  refreshDirectory: () => request<{ refreshed: boolean }>(`${base}/directory/refresh`, { method: 'POST', timeoutMs: 120_000 }),
  catalog: (filters: StickerFilters = {}, signal?: AbortSignal) => request<StickerCatalog>(`${base}/catalog${queryString({ ...filters, includeChildren: filters.includeChildren === undefined ? undefined : String(filters.includeChildren) })}`, { signal }),
  select: (filters: StickerFilters) => request<{ productIds: string[] }>(`${base}/select`, { method: 'POST', body: jsonBody(filters) }),
  selectionSummary: (productIds: string[], signal?: AbortSignal) => request<StickerSelectionSummary>(`${base}/selection/summary`, { method: 'POST', body: jsonBody({ productIds }), signal }),
  resolve: (entries: string[]) => request<StickerResolution>(`${base}/resolve`, { method: 'POST', body: jsonBody({ entries }) }),
  configureManual: (ids: string[]) => request<{ saved: boolean }>(`${base}/manual`, { method: 'PUT', body: jsonBody({ ids, confirmManual: true }) }),
  preview: (input: StickerPreviewInput) => request<StickerOperation>(`${base}/operations/preview`, { method: 'POST', body: jsonBody(input), timeoutMs: 600_000 }),
  history: () => request<StickerOperationSummary[]>(`${base}/operations`),
  detail: (id: string, page = 1) => request<StickerOperation>(`${base}/operations/${encodeURIComponent(id)}${queryString({ page })}`),
  action: (id: string, action: 'apply' | 'stop' | 'retry' | 'rollback') => request<StickerOperation>(`${base}/operations/${encodeURIComponent(id)}/${action}`, { method: 'POST', timeoutMs: action === 'rollback' ? 600_000 : 30_000 }),
  selections: () => request<StickerSelection[]>(`${base}/selections`),
  saveSelection: (name: string, productIds: string[]) => request<StickerSelection[]>(`${base}/selections`, { method: 'POST', body: jsonBody({ name, productIds }) }),
  removeSelection: (id: string) => request<{ removed: boolean }>(`${base}/selections/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  reportUrl: (id: string) => `${base}/operations/${encodeURIComponent(id)}/report.csv`
};
