import type {
  PopularityAction, PopularityCatalog, PopularityFilters, PopularityHistoryItem,
  PopularityOperation, PopularityResolution
} from '../types/horoshop-popularity';
import type { HoroshopIntegration } from '../types/integration';
import { jsonBody, request } from './api-client';

const base = '/api/search/horoshop/popularity';

export const horoshopPopularity = {
  catalog: (filters: PopularityFilters, page = 1, pageSize = 25, signal?: AbortSignal) => {
    const params = new URLSearchParams({
      search: filters.search, category: filters.category, availability: filters.availability,
      popularity: filters.popularity, popularityMin: String(filters.popularityMin),
      popularityMax: String(filters.popularityMax), page: String(page), pageSize: String(pageSize)
    });
    filters.brands.forEach((brand) => params.append('brand', brand));
    return request<PopularityCatalog>(`${base}/catalog?${params}`, { signal, timeoutMs: 60_000 });
  },
  catalogSelection: (productIds: string[], filters: PopularityFilters, page = 1, pageSize = 25, signal?: AbortSignal) =>
    request<PopularityCatalog>(`${base}/catalog/selection`, {
      method: 'POST', body: jsonBody({ productIds, filters, page, pageSize }), signal, timeoutMs: 60_000
    }),
  resolve: (entries: string[]) => request<PopularityResolution>(`${base}/resolve`, {
    method: 'POST', body: jsonBody({ entries }), timeoutMs: 60_000
  }),
  sync: () => request<{ started: boolean; integration: HoroshopIntegration }>(`${base}/sync`, { method: 'POST' }),
  preview: (selection: { productIds: string[] } | { filters: PopularityFilters }, action: PopularityAction, value: number) =>
    request<PopularityOperation>(`${base}/operations/preview`, {
      method: 'POST', body: jsonBody({ selection, action: action === 'reset' ? { mode: action } : { mode: action, value } }),
      timeoutMs: 120_000
    }),
  apply: (id: string) => request<PopularityOperation>(`${base}/operations/${encodeURIComponent(id)}/apply`, {
    method: 'POST'
  }),
  operation: (id: string, signal?: AbortSignal) => request<PopularityOperation>(
    `${base}/operations/${encodeURIComponent(id)}`, { signal }
  ),
  history: (signal?: AbortSignal) => request<PopularityHistoryItem[]>(`${base}/operations`, { signal })
};
