import { api } from '@workspace/lib/api';
import { request } from '@workspace/lib/api-client';
import type { ProductMap, ProductPage } from '@zero/product-types';
import type { PopupDocument, Widget, ZeroBlockContact } from './types';
import type { PaintPreset } from './ui/paint-library';

const base = '/api/popup-banners/zero-block';
const endpoint = (id: string) => `${base}/${encodeURIComponent(id)}`;
const json = (method: string, payload: unknown) => ({ method, body: JSON.stringify(payload) });
type Revisions = { draftRevision: number; campaignRevision: number };

export const zeroBlockApi = {
  create: (name: string) => request<Widget>(base, json('POST', { name })),
  get: (id: string) => request<Widget>(endpoint(id)),
  save: (id: string, revision: number, document: PopupDocument) =>
    request<Widget>(endpoint(id), json('PATCH', { revision, document })),
  publish: (id: string, input: Revisions & { operationId: string }) =>
    request<Widget>(`${endpoint(id)}/publish`, json('POST', input)),
  pause: (id: string, campaignRevision: number) =>
    request<Widget>(`${endpoint(id)}/pause`, json('POST', { campaignRevision })),
  remove: (id: string, input: Revisions) => request<void>(endpoint(id), json('DELETE', input)),
  uploadImage: (file: File) => api.popupBanners.uploadImage(file),
  uploadReward: (file: File) => request<{ id: string; name: string; mime: string; byteLength: number }>(`${base}/reward-files`, {
    method: 'POST', body: file, headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) }
  }),
  catalog: (search: string, page: number) => request<ProductPage>(`${base}/catalog?${new URLSearchParams({ search, page: String(page) })}`),
  products: (ids: string[]) => request<ProductMap>(`${base}/products`, json('POST', { ids })),
  contacts: (page: number, campaignId?: string) => request<{ items: ZeroBlockContact[]; total: number; pageSize: number }>(
    `${base}/contacts?${new URLSearchParams({ page: String(page), ...(campaignId ? { campaignId } : {}) })}`
  ),
  paints: {
    list: () => request<PaintPreset[]>(`${base}/paints`),
    save: (paint: string) => request<PaintPreset>(`${base}/paints`, json('POST', { paint })),
    remove: (id: string) => request<void>(`${base}/paints/${encodeURIComponent(id)}`, { method: 'DELETE' })
  }
};
