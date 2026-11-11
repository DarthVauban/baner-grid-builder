import type { FeedAction, FeedCatalog, FeedFilters, FeedHistoryItem, FeedOperation, FeedResolution } from '../types/horoshop-feeds';
import type { HoroshopIntegration } from '../types/integration';
import { jsonBody, request } from './api-client';

const base = '/api/search/horoshop/feeds';
export const horoshopFeeds = {
  catalog: (filters: FeedFilters, page = 1, signal?: AbortSignal) => {
    const params = new URLSearchParams({ search: filters.search, category: filters.category,
      availability: filters.availability, page: String(page), pageSize: '25' });
    filters.brands.forEach((brand) => params.append('brand', brand));
    return request<FeedCatalog>(`${base}/catalog?${params}`, { signal, timeoutMs: 60_000 });
  },
  catalogSelection: (productIds: string[], filters: FeedFilters, page = 1, signal?: AbortSignal) =>
    request<FeedCatalog>(`${base}/catalog/selection`, {
      method: 'POST', body: jsonBody({ productIds, filters, page, pageSize: 25 }), signal, timeoutMs: 60_000
    }),
  resolve: (entries: string[]) => request<FeedResolution>(`${base}/resolve`, {
    method: 'POST', body: jsonBody({ entries }), timeoutMs: 60_000
  }),
  sync: () => request<{ started: boolean; integration: HoroshopIntegration }>(`${base}/sync`, { method: 'POST' }),
  preview: (selection: { productIds: string[] } | { filters: FeedFilters }, action: FeedAction) =>
    request<FeedOperation>(`${base}/operations/preview`, {
      method: 'POST', body: jsonBody({ selection, action }), timeoutMs: 120_000
    }),
  apply: (id: string) => request<FeedOperation>(`${base}/operations/${encodeURIComponent(id)}/apply`, { method: 'POST' }),
  operation: (id: string, signal?: AbortSignal) => request<FeedOperation>(`${base}/operations/${encodeURIComponent(id)}`, { signal }),
  history: (signal?: AbortSignal) => request<FeedHistoryItem[]>(`${base}/operations`, { signal })
};
