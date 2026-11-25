import type { PublicStoreMapData } from '../types/store-map';
import { queryString, request } from './api-client';

export function loadPublicStoreMap(signal?: AbortSignal, preview?: string) {
  return request<PublicStoreMapData>(`/api/public/store-map${queryString({ preview })}`, { signal });
}
