export interface ApiErrorPayload {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

export interface ApiSuccessPayload<T> {
  data: T;
  message?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, payload: ApiErrorPayload) {
    super(payload.error?.message || 'Не вдалося виконати запит. Спробуйте ще раз.');
    this.name = 'ApiError';
    this.status = status;
    this.code = payload.error?.code || 'API_ERROR';
    this.details = payload.error?.details;
  }
}

export type ApiRequestOptions = RequestInit & {
  timeoutMs?: number;
};

export type ApiNdjsonRequestOptions = ApiRequestOptions & {
  idleTimeoutMs?: number;
};

const DEFAULT_API_TIMEOUT_MS = 30_000;

export async function request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { timeoutMs = DEFAULT_API_TIMEOUT_MS, signal: externalSignal, ...fetchOptions } = options;
  const headers = new Headers(fetchOptions.headers);
  let body = fetchOptions.body;
  const controller = new AbortController();
  let timedOut = false;

  const abortFromExternalSignal = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) abortFromExternalSignal();
  else externalSignal?.addEventListener('abort', abortFromExternalSignal, { once: true });

  const timeout = timeoutMs > 0
    ? globalThis.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs)
    : undefined;

  if (body !== undefined
    && !(body instanceof FormData)
    && !(body instanceof Blob)
    && !(body instanceof ArrayBuffer)
    && !ArrayBuffer.isView(body)) {
    headers.set('Content-Type', 'application/json');
  }

  try {
    const response = await fetch(path, {
      ...fetchOptions,
      headers,
      body,
      credentials: 'same-origin',
      signal: controller.signal
    });

    if (response.status === 204) return undefined as T;

    const payload = await response.json().catch(() => ({})) as ApiSuccessPayload<T> & ApiErrorPayload;
    if (!response.ok) {
      const error = new ApiError(response.status, payload);
      if (response.status === 401 && ['AUTH_REQUIRED', 'INVALID_SESSION'].includes(error.code)) {
        window.dispatchEvent(new Event('mt:unauthorized'));
      }
      throw error;
    }

    return payload.data;
  } catch (error) {
    if (timedOut) {
      throw new ApiError(408, {
        error: {
          code: 'REQUEST_TIMEOUT',
          message: 'Сервер не відповів вчасно. Перевірте з’єднання та спробуйте ще раз.'
        }
      });
    }
    throw error;
  } finally {
    if (timeout !== undefined) globalThis.clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', abortFromExternalSignal);
  }
}

type ApiNdjsonEvent<TProgress, TResult> =
  | { type: 'progress'; data: TProgress }
  | { type: 'result'; data: TResult }
  | { type: 'error'; status?: number; error?: ApiErrorPayload['error'] };

export async function requestNdjson<TProgress, TResult>(
  path: string,
  options: ApiNdjsonRequestOptions,
  onProgress: (progress: TProgress) => void
): Promise<TResult> {
  const {
    timeoutMs = 0,
    idleTimeoutMs = DEFAULT_API_TIMEOUT_MS,
    signal: externalSignal,
    ...fetchOptions
  } = options;
  const headers = new Headers(fetchOptions.headers);
  const controller = new AbortController();
  let timedOut = false;
  let idleTimeout: ReturnType<typeof globalThis.setTimeout> | undefined;

  const abortForTimeout = () => {
    timedOut = true;
    controller.abort();
  };
  const resetIdleTimeout = () => {
    if (idleTimeout !== undefined) globalThis.clearTimeout(idleTimeout);
    idleTimeout = idleTimeoutMs > 0
      ? globalThis.setTimeout(abortForTimeout, idleTimeoutMs)
      : undefined;
  };

  const abortFromExternalSignal = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) abortFromExternalSignal();
  else externalSignal?.addEventListener('abort', abortFromExternalSignal, { once: true });

  const timeout = timeoutMs > 0
    ? globalThis.setTimeout(abortForTimeout, timeoutMs)
    : undefined;
  resetIdleTimeout();
  if (fetchOptions.body !== undefined) headers.set('Content-Type', 'application/json');
  headers.set('Accept', 'application/x-ndjson');

  try {
    const response = await fetch(path, {
      ...fetchOptions,
      headers,
      credentials: 'same-origin',
      signal: controller.signal
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as ApiErrorPayload;
      const error = new ApiError(response.status, payload);
      if (response.status === 401 && ['AUTH_REQUIRED', 'INVALID_SESSION'].includes(error.code)) {
        window.dispatchEvent(new Event('mt:unauthorized'));
      }
      throw error;
    }
    if (!response.body) {
      throw new ApiError(502, {
        error: { code: 'INVALID_STREAM_RESPONSE', message: 'Сервер не повернув прогрес масової публікації.' }
      });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let result: TResult | undefined;
    const consumeLine = (line: string) => {
      if (!line.trim()) return;
      let event: ApiNdjsonEvent<TProgress, TResult>;
      try {
        event = JSON.parse(line) as ApiNdjsonEvent<TProgress, TResult>;
      } catch {
        throw new ApiError(502, {
          error: { code: 'INVALID_STREAM_RESPONSE', message: 'Сервер повернув некоректний прогрес масової публікації.' }
        });
      }
      if (event.type === 'progress') onProgress(event.data);
      else if (event.type === 'result') result = event.data;
      else if (event.type === 'error') throw new ApiError(event.status || 502, { error: event.error });
    };

    while (true) {
      const { done, value } = await reader.read();
      if (value?.byteLength) resetIdleTimeout();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) consumeLine(line);
      if (done) break;
    }
    consumeLine(buffer);
    if (result === undefined) {
      throw new ApiError(502, {
        error: { code: 'INCOMPLETE_STREAM_RESPONSE', message: 'З’єднання завершилось до закінчення масової публікації.' }
      });
    }
    return result;
  } catch (error) {
    if (timedOut) {
      throw new ApiError(408, {
        error: {
          code: 'REQUEST_TIMEOUT',
          message: 'Сервер перестав надсилати прогрес масової публікації. Оновіть сторінку, щоб перевірити вже передані товари.'
        }
      });
    }
    throw error;
  } finally {
    if (timeout !== undefined) globalThis.clearTimeout(timeout);
    if (idleTimeout !== undefined) globalThis.clearTimeout(idleTimeout);
    externalSignal?.removeEventListener('abort', abortFromExternalSignal);
  }
}

export function jsonBody(value: unknown): string {
  return JSON.stringify(value);
}

export function queryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') search.set(key, String(value));
  });
  const result = search.toString();
  return result ? `?${result}` : '';
}
