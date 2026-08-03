import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';

class FakeUploadTarget {
  progressListener?: (event: ProgressEvent) => void;

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    if (type === 'progress') this.progressListener = listener as (event: ProgressEvent) => void;
  }
}

class FakeXMLHttpRequest {
  static last: FakeXMLHttpRequest | null = null;
  static nextResponseText = JSON.stringify({ data: { url: '/media/catalog/phone.webp', mimeType: 'image/webp' } });
  upload = new FakeUploadTarget();
  status = 201;
  responseText = FakeXMLHttpRequest.nextResponseText;
  headers = new Map<string, string>();
  listeners = new Map<string, EventListenerOrEventListenerObject>();
  method = '';
  url = '';
  withCredentials = false;
  body: Document | XMLHttpRequestBodyInit | null = null;

  constructor() {
    FakeXMLHttpRequest.last = this;
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string) {
    this.headers.set(name, value);
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    this.listeners.set(type, listener);
  }

  send(body: Document | XMLHttpRequestBodyInit | null) {
    this.body = body;
    this.upload.progressListener?.({ lengthComputable: true, loaded: 40, total: 100 } as ProgressEvent);
    const listener = this.listeners.get('load');
    if (typeof listener === 'function') listener(new Event('load'));
    else listener?.handleEvent(new Event('load'));
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeXMLHttpRequest.last = null;
  FakeXMLHttpRequest.nextResponseText = JSON.stringify({ data: { url: '/media/catalog/phone.webp', mimeType: 'image/webp' } });
});

describe('media library upload', () => {
  it('uploads the original image for server-side WebP conversion', async () => {
    FakeXMLHttpRequest.nextResponseText = JSON.stringify({
      data: { id: 'asset-1', name: 'hero image.png', url: '/media/catalog/library/hero.webp', mimeType: 'image/webp' }
    });
    vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest);
    const progress: number[] = [];
    const file = new File(['png'], 'hero image.png', { type: 'image/png' });

    const result = await api.media.upload(file, (value) => progress.push(value));

    expect(result.url).toBe('/media/catalog/library/hero.webp');
    expect(FakeXMLHttpRequest.last?.method).toBe('POST');
    expect(FakeXMLHttpRequest.last?.url).toBe('/api/media');
    expect(FakeXMLHttpRequest.last?.headers.get('Content-Type')).toBe('image/png');
    expect(FakeXMLHttpRequest.last?.headers.get('X-File-Name')).toBe('hero%20image.png');
    expect(FakeXMLHttpRequest.last?.body).toBe(file);
    expect(progress).toEqual([40, 100]);
  });
});

describe('catalog media upload', () => {
  it('uploads the converted WebP directly and reports transport progress', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest);
    const progress: number[] = [];
    const webp = new Blob(['webp'], { type: 'image/webp' });

    const result = await api.catalog.uploadMedia(webp, 'phone.webp', (value) => progress.push(value));

    expect(result.url).toBe('/media/catalog/phone.webp');
    expect(FakeXMLHttpRequest.last?.method).toBe('POST');
    expect(FakeXMLHttpRequest.last?.url).toBe('/api/catalog/media');
    expect(FakeXMLHttpRequest.last?.headers.get('Content-Type')).toBe('image/webp');
    expect(FakeXMLHttpRequest.last?.headers.get('X-File-Name')).toBe('phone.webp');
    expect(FakeXMLHttpRequest.last?.body).toBe(webp);
    expect(progress).toEqual([40, 100]);
  });
});
