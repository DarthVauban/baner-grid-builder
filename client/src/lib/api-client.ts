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
