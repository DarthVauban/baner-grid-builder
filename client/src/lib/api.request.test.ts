import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('API request recovery', () => {
  it('stops a request that never responds instead of waiting forever', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_path: string, options?: RequestInit) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    })));

    const request = api.users.toolCatalog();
    const expectation = expect(request).rejects.toMatchObject({
      status: 408,
      code: 'REQUEST_TIMEOUT'
    });

    await vi.advanceTimersByTimeAsync(15_000);
    await expectation;
  });

  it('passes caller cancellation to the active network request', async () => {
    const fetchSpy = vi.fn((_path: string, options?: RequestInit) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }));
    vi.stubGlobal('fetch', fetchSpy);
    const controller = new AbortController();

    const request = api.users.toolCatalog(controller.signal);
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchSpy).toHaveBeenCalledWith('/api/users/tool-catalog', expect.objectContaining({
      signal: expect.objectContaining({ aborted: true })
    }));
  });
});
