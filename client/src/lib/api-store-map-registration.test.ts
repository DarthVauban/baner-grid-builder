import { afterEach, expect, it, vi } from 'vitest';
import { publicRegistrationState, submitPublicRegistration } from './api-store-map-registration';

afterEach(() => { vi.unstubAllGlobals(); });

it('public registration authenticates with its link token and omits workspace cookies', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { status: 'OPEN', expiresAt: '2026-11-01T00:00:00Z' } }), { status: 200 }));
  vi.stubGlobal('fetch', fetch);
  await expect(publicRegistrationState('public-link-token')).resolves.toMatchObject({ status: 'OPEN' });
  expect(fetch).toHaveBeenCalledWith('/api/public/store-map/registration', expect.objectContaining({ credentials: 'omit', cache: 'no-store' }));
  expect(new Headers(fetch.mock.calls[0][1].headers).get('Authorization')).toBe('Bearer public-link-token');
  const input = { name: 'Магазин', city: 'Київ', address: 'Хрещатик, 1', hoursText: '09:00 - 20:00', comment: '', confirmed: true as const,
    latitude: 50.45, longitude: 30.52, measurement: { latitude: 50.45, longitude: 30.52, accuracy: 6,
      observedAt: new Date().toISOString(), sampleCount: 3, durationMs: 60000, consistent: true } };
  await submitPublicRegistration('public-link-token', input);
  expect(fetch.mock.calls[1][1]).toMatchObject({ method: 'POST', credentials: 'omit', body: JSON.stringify(input) });
});

it('the permanent form uses no bearer token or workspace session and submits its own retry key', async () => {
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({
    data: { status: 'OPEN', expiresAt: null, reusable: true }
  }), { status: 200 })));
  vi.stubGlobal('fetch', fetch);
  await expect(publicRegistrationState()).resolves.toMatchObject({ status: 'OPEN', expiresAt: null, reusable: true });
  expect(new Headers(fetch.mock.calls[0][1].headers).has('Authorization')).toBe(false);
  const input = { submissionId: crypto.randomUUID(), name: 'Магазин', city: 'Київ', address: 'Хрещатик, 1', hoursText: '09:00 - 20:00',
    comment: '', confirmed: true as const, latitude: 50.45, longitude: 30.52,
    measurement: { latitude: 50.45, longitude: 30.52, accuracy: 6, observedAt: new Date().toISOString(), sampleCount: 3, durationMs: 60000, consistent: true } };
  await submitPublicRegistration('', input);
  expect(new Headers(fetch.mock.calls[1][1].headers).has('Authorization')).toBe(false);
  expect(fetch.mock.calls[1][1]).toMatchObject({ credentials: 'omit', body: JSON.stringify(input) });
});
