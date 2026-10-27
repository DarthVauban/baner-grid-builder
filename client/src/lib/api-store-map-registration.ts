import { request } from './api-client';
import type { StoreMapRegistrationInput, StoreMapRegistrationLink, StoreMapRegistrationRequest,
  StoreMapRequestFeed, StoreMapRequestReview, StoreMapRequestStatus } from '../types/store-map';

const base = '/api/store-map/registration';
const post = (input: unknown) => ({ method: 'POST', body: JSON.stringify(input) });

export const storeMapRegistrationApi = {
  links: () => request<StoreMapRegistrationLink[]>(`${base}/links`),
  createLink: (label: string) => request<StoreMapRegistrationLink & { token: string }>(`${base}/links`, post({ label })),
  revokeLink: (id: string) => request<void>(`${base}/links/${encodeURIComponent(id)}/revoke`, post({})),
  requests: (params: { status?: StoreMapRequestStatus | ''; search?: string; page?: number } = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => query.set(key, String(value)));
    return request<StoreMapRequestFeed>(`${base}/requests?${query}`);
  },
  get: (id: string) => request<StoreMapRegistrationRequest>(`${base}/requests/${encodeURIComponent(id)}`),
  approve: (id: string, input: StoreMapRequestReview) =>
    request<StoreMapRegistrationRequest>(`${base}/requests/${encodeURIComponent(id)}/approve`, post(input)),
  reject: (id: string, input: { version: number; reviewNote: string }) =>
    request<StoreMapRegistrationRequest>(`${base}/requests/${encodeURIComponent(id)}/reject`, post(input))
};

export function publicRegistrationState(token: string, signal?: AbortSignal) {
  return request<{ status: 'OPEN' | 'SUBMITTED'; expiresAt: string }>('/api/public/store-map/registration', {
    headers: { Authorization: `Bearer ${token}` }, credentials: 'omit', signal, cache: 'no-store'
  });
}

export function submitPublicRegistration(token: string, input: StoreMapRegistrationInput) {
  return request<{ status: 'SUBMITTED' }>('/api/public/store-map/registration', {
    ...post(input), headers: { Authorization: `Bearer ${token}` }, credentials: 'omit', cache: 'no-store'
  });
}
