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

  it('reads incremental Horoshop publication progress from an NDJSON response', async () => {
    const events = [
      { type: 'progress', data: { stage: 'publishing', totalProducts: 4, processedProducts: 2, productAccessories: 7, categoryAccessories: 0, currentBatch: 1, totalBatches: 2, percentage: 50 } },
      { type: 'result', data: { publishedProducts: 4, productAccessories: 12, categoryAccessories: 1 } }
    ];
    const body = events.map((event) => JSON.stringify(event)).join('\n');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'application/x-ndjson' }
    })));
    const progress: Array<{ processedProducts: number }> = [];

    await expect(api.horoshopAccessories.publishAll((value) => progress.push(value))).resolves.toEqual({
      publishedProducts: 4,
      productAccessories: 12,
      categoryAccessories: 1
    });
    expect(progress).toEqual([expect.objectContaining({ processedProducts: 2 })]);
    expect(fetch).toHaveBeenCalledWith(
      '/api/search/horoshop/accessories/publications/publish-all/stream',
      expect.objectContaining({ method: 'POST', credentials: 'same-origin' })
    );
  });

  it('turns a streamed Horoshop rejection into a readable API error', async () => {
    const body = `${JSON.stringify({
      type: 'error',
      status: 502,
      error: {
        code: 'HOROSHOP_ACCESSORY_PUBLISH_REJECTED',
        message: 'Хорошоп відхилив пакет: accessory SKU was not found.',
        details: { processedProducts: 100, totalProducts: 240 }
      }
    })}\n`;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 200 })));

    await expect(api.horoshopAccessories.publishAll(() => {})).rejects.toMatchObject({
      status: 502,
      code: 'HOROSHOP_ACCESSORY_PUBLISH_REJECTED',
      message: 'Хорошоп відхилив пакет: accessory SKU was not found.',
      details: { processedProducts: 100, totalProducts: 240 }
    });
  });

  it('allows an individual photo publication to use the full server timeout window', async () => {
    vi.useFakeTimers();
    const network: { signal?: AbortSignal } = {};
    vi.stubGlobal('fetch', vi.fn((_path: string, options?: RequestInit) => new Promise((_resolve, reject) => {
      network.signal = options?.signal || undefined;
      network.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    })));

    const publication = api.horoshopPhotos.publishDraft('draft-1', 'append');
    const expectation = expect(publication).rejects.toMatchObject({ status: 408, code: 'REQUEST_TIMEOUT' });

    await vi.advanceTimersByTimeAsync(120_000);
    expect(network.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(299_999);
    expect(network.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(network.signal?.aborted).toBe(true);
    await expectation;
  });

  it('keeps a long photo publication stream alive while heartbeat chunks arrive', async () => {
    vi.useFakeTimers();
    const encoder = new TextEncoder();
    const stream: { controller?: ReadableStreamDefaultController<Uint8Array> } = {};
    const network: { signal?: AbortSignal } = {};
    vi.stubGlobal('fetch', vi.fn(async (_path: string, options?: RequestInit) => {
      network.signal = options?.signal || undefined;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          stream.controller = controller;
          network.signal?.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')), { once: true });
        }
      });
      return new Response(body, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } });
    }));
    const progress: Array<{ processedDrafts: number }> = [];

    const publication = api.horoshopPhotos.publishSelection('selection-1', 'append', (value) => progress.push(value));
    await vi.advanceTimersByTimeAsync(0);
    stream.controller?.enqueue(encoder.encode(`${JSON.stringify({
      type: 'progress',
      data: { stage: 'publishing', totalDrafts: 2, processedDrafts: 0, currentArticle: 'PHONE-1', percentage: 0 }
    })}\n`));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(25_000);
    stream.controller?.enqueue(encoder.encode(`${JSON.stringify({
      type: 'progress',
      data: { stage: 'publishing', totalDrafts: 2, processedDrafts: 1, currentArticle: 'PHONE-2', percentage: 50 }
    })}\n`));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(25_000);
    stream.controller?.enqueue(encoder.encode(`${JSON.stringify({
      type: 'result',
      data: {
        publishedDrafts: 2,
        publishedArticles: 2,
        failedDrafts: 0,
        failedArticles: 0,
        failures: []
      }
    })}\n`));
    stream.controller?.close();

    await expect(publication).resolves.toMatchObject({ publishedDrafts: 2, failedDrafts: 0 });
    expect(network.signal?.aborted).toBe(false);
    expect(progress).toEqual([
      expect.objectContaining({ processedDrafts: 0 }),
      expect.objectContaining({ processedDrafts: 1 })
    ]);
  });

  it('aborts a photo publication stream after a full idle timeout without a heartbeat', async () => {
    vi.useFakeTimers();
    const network: { signal?: AbortSignal } = {};
    vi.stubGlobal('fetch', vi.fn(async (_path: string, options?: RequestInit) => {
      network.signal = options?.signal || undefined;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          network.signal?.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')), { once: true });
        }
      });
      return new Response(body, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } });
    }));

    const publication = api.horoshopPhotos.publishSelection('selection-1', 'append', () => {});
    const expectation = expect(publication).rejects.toMatchObject({ status: 408, code: 'REQUEST_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(network.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(network.signal?.aborted).toBe(true);
    await expectation;
  });
});
