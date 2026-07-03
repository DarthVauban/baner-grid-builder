import type { LoginInput, RegisterInput, User } from '../types/user';
import type {
  Notification,
  NotificationFeed,
  ReminderSettings,
  Task,
  TaskInput,
  TaskStatus,
  UserSearchResult
} from '../types/task';

interface ApiErrorPayload {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

interface ApiSuccessPayload<T> {
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

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  let body = options.body;

  if (body !== undefined && !(body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, {
    ...options,
    headers,
    body,
    credentials: 'same-origin'
  });

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => ({})) as ApiSuccessPayload<T> & ApiErrorPayload;
  if (!response.ok) {
    const error = new ApiError(response.status, payload);
    if (response.status === 401 && !path.endsWith('/login')) {
      window.dispatchEvent(new Event('mt:unauthorized'));
    }
    throw error;
  }

  return payload.data;
}

function jsonBody(value: unknown): string {
  return JSON.stringify(value);
}

function queryString(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const result = search.toString();
  return result ? `?${result}` : '';
}

export const api = {
  auth: {
    me: () => request<User>('/api/auth/me'),
    login: (input: LoginInput) => request<User>('/api/auth/login', {
      method: 'POST',
      body: jsonBody(input)
    }),
    register: (input: RegisterInput) => request<User>('/api/auth/register', {
      method: 'POST',
      body: jsonBody(input)
    }),
    logout: () => request<void>('/api/auth/logout', { method: 'POST' })
  },
  tasks: {
    list: (params: { filter?: string; search?: string; from?: string; to?: string }) =>
      request<Task[]>(`/api/tasks${queryString(params)}`),
    get: (id: string) => request<Task>(`/api/tasks/${encodeURIComponent(id)}`),
    create: (input: TaskInput) => request<Task>('/api/tasks', { method: 'POST', body: jsonBody(input) }),
    update: (id: string, input: TaskInput) => request<Task>(`/api/tasks/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: jsonBody(input)
    }),
    setStatus: (id: string, status: TaskStatus) => request<Task>(`/api/tasks/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      body: jsonBody({ status })
    }),
    respond: (id: string, response: 'accepted' | 'declined') => request<Task | null>(
      `/api/tasks/${encodeURIComponent(id)}/respond`,
      { method: 'POST', body: jsonBody({ response }) }
    ),
    setReminder: (id: string, input: ReminderSettings) => request<ReminderSettings>(
      `/api/tasks/${encodeURIComponent(id)}/reminder`,
      { method: 'PUT', body: jsonBody(input) }
    ),
    remove: (id: string) => request<void>(`/api/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },
  users: {
    search: (search: string) => request<UserSearchResult[]>(`/api/users/search${queryString({ search })}`)
  },
  notifications: {
    list: (unreadOnly = false) => request<NotificationFeed>(
      `/api/notifications${queryString({ unreadOnly: unreadOnly ? 'true' : undefined })}`
    ),
    markRead: (id: string) => request<Notification>(`/api/notifications/${encodeURIComponent(id)}/read`, {
      method: 'PATCH'
    }),
    markAllRead: () => request<void>('/api/notifications/read-all', { method: 'POST' })
  }
};
