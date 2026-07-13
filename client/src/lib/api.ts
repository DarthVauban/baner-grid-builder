import type {
  LoginInput,
  LoginResponse,
  PermissionRole,
  PasswordChangeInput,
  RegisterInput,
  RegistrationStart,
  RegistrationVerifyInput,
  RolePermission,
  SavedDataResource,
  User,
  UserDirectory,
  ProfileInput,
  TwoFactorConfirmResult,
  TwoFactorLoginVerifyInput,
  TwoFactorSetup,
  TwoFactorStatus,
  UserRole,
  UserStatus
} from '../types/user';
import type {
  Notification,
  NotificationFeed,
  ReminderSettings,
  Task,
  TaskCounts,
  TaskInput,
  TaskStatus,
  UserSearchResult
} from '../types/task';
import type {
  BannerData,
  ProductTableInput,
  ProductTableRecord,
  SavedBanner,
  SavedGrid
} from '../types/workspace';
import type { ToolCatalog, ToolId, UserToolAccess } from '../types/tool';
import type { BlogPublication, PublicationCounts, PublicationInput, PublicationStatus } from '../types/publication';
import type { ChatConversation, ChatMessage, ChatPerson } from '../types/chat';
import type { IntegrationSettings, MailtrapIntegration, MailtrapIntegrationInput } from '../types/integration';

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

function queryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') search.set(key, String(value));
  });
  const result = search.toString();
  return result ? `?${result}` : '';
}

export const api = {
  auth: {
    me: () => request<User>('/api/auth/me'),
    login: (input: LoginInput) => request<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: jsonBody(input)
    }),
    verifyLoginTwoFactor: (input: TwoFactorLoginVerifyInput) => request<User>('/api/auth/login/2fa', {
      method: 'POST',
      body: jsonBody(input)
    }),
    register: (input: RegisterInput) => request<RegistrationStart>('/api/auth/register', {
      method: 'POST',
      body: jsonBody(input)
    }),
    verifyRegistration: (input: RegistrationVerifyInput) => request<User>('/api/auth/register/verify', {
      method: 'POST',
      body: jsonBody(input)
    }),
    logout: () => request<void>('/api/auth/logout', { method: 'POST' })
  },
  tasks: {
    list: (params: { filter?: string; search?: string; from?: string; to?: string }) =>
      request<Task[]>(`/api/tasks${queryString(params)}`),
    counts: (params: { from: string; to: string }) =>
      request<TaskCounts>(`/api/tasks/counts${queryString(params)}`),
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
  publications: {
    list: (params: { filter?: string; search?: string; from?: string; to?: string }) =>
      request<BlogPublication[]>(`/api/publications${queryString(params)}`),
    counts: (params: { from: string; to: string }) =>
      request<PublicationCounts>(`/api/publications/counts${queryString(params)}`),
    get: (id: string) => request<BlogPublication>(`/api/publications/${encodeURIComponent(id)}`),
    create: (input: PublicationInput) => request<BlogPublication>('/api/publications', { method: 'POST', body: jsonBody(input) }),
    createBatch: (items: Array<Pick<PublicationInput, 'title' | 'publishAt' | 'assigneeId'>>) =>
      request<BlogPublication[]>('/api/publications/batch', { method: 'POST', body: jsonBody({ items }) }),
    update: (id: string, input: PublicationInput) => request<BlogPublication>(`/api/publications/${encodeURIComponent(id)}`, { method: 'PUT', body: jsonBody(input) }),
    setStatus: (id: string, status: PublicationStatus, publicationUrl = '') =>
      request<BlogPublication>(`/api/publications/${encodeURIComponent(id)}/status`, {
        method: 'PATCH', body: jsonBody({ status, publicationUrl })
      })
  },
  chat: {
    contacts: () => request<ChatPerson[]>('/api/chat/contacts'),
    unreadCount: () => request<number>('/api/chat/unread-count'),
    conversations: () => request<ChatConversation[]>('/api/chat/conversations'),
    startConversation: (userId: string, body: string) => request<{ id: string; contact: ChatPerson; message: ChatMessage }>('/api/chat/conversations', {
      method: 'POST', body: jsonBody({ userId, body })
    }),
    createGroup: (title: string, participantIds: string[], iconDataUrl = '') => request<ChatConversation>('/api/chat/conversations/groups', {
      method: 'POST', body: jsonBody({ title, participantIds, iconDataUrl })
    }),
    updateGroup: (conversationId: string, input: { title?: string; iconDataUrl?: string }) => request<void>(`/api/chat/conversations/${encodeURIComponent(conversationId)}/group`, {
      method: 'PATCH', body: jsonBody(input)
    }),
    addGroupMembers: (conversationId: string, userIds: string[]) => request<void>(`/api/chat/conversations/${encodeURIComponent(conversationId)}/members`, {
      method: 'POST', body: jsonBody({ userIds })
    }),
    setGroupMemberRole: (conversationId: string, userId: string, role: 'admin' | 'member') => request<void>(`/api/chat/conversations/${encodeURIComponent(conversationId)}/members/${encodeURIComponent(userId)}/role`, {
      method: 'PATCH', body: jsonBody({ role })
    }),
    removeGroupMember: (conversationId: string, userId: string) => request<void>(`/api/chat/conversations/${encodeURIComponent(conversationId)}/members/${encodeURIComponent(userId)}`, {
      method: 'DELETE'
    }),
    messages: (conversationId: string) => request<ChatMessage[]>(`/api/chat/conversations/${encodeURIComponent(conversationId)}/messages`),
    setTyping: (conversationId: string, isTyping: boolean) => request<void>(`/api/chat/conversations/${encodeURIComponent(conversationId)}/typing`, {
      method: 'POST', body: jsonBody({ isTyping })
    }),
    sendMessage: (conversationId: string, body: string, replyToId: string | null = null) => request<ChatMessage>(`/api/chat/conversations/${encodeURIComponent(conversationId)}/messages`, {
      method: 'POST', body: jsonBody({ body, replyToId })
    }),
    setReaction: (messageId: string, emoji: string | null) => request<ChatMessage['reactions']>(`/api/chat/messages/${encodeURIComponent(messageId)}/reaction`, {
      method: 'PUT', body: jsonBody({ emoji })
    }),
    markRead: (conversationId: string) => request<void>(`/api/chat/conversations/${encodeURIComponent(conversationId)}/read`, { method: 'POST' })
  },
  users: {
    search: (search = '', excludeSelf = false) => request<UserSearchResult[]>(`/api/users/search${queryString({ search, excludeSelf: excludeSelf ? 'true' : undefined })}`),
    toolAccess: () => request<ToolId[]>('/api/users/tool-access'),
    toolCatalog: () => request<ToolCatalog>('/api/users/tool-catalog'),
    updateProfile: (input: ProfileInput) => request<User>('/api/users/profile', {
      method: 'PUT', body: jsonBody(input)
    }),
    changePassword: (input: PasswordChangeInput) => request<void>('/api/users/profile/password', {
      method: 'PUT', body: jsonBody(input)
    }),
    twoFactorStatus: () => request<TwoFactorStatus>('/api/users/profile/2fa'),
    startTwoFactorSetup: () => request<TwoFactorSetup>('/api/users/profile/2fa/setup', { method: 'POST' }),
    confirmTwoFactorSetup: (code: string) => request<TwoFactorConfirmResult>('/api/users/profile/2fa/confirm', {
      method: 'POST', body: jsonBody({ code })
    }),
    disableTwoFactor: (code: string) => request<User>('/api/users/profile/2fa/disable', {
      method: 'POST', body: jsonBody({ code })
    })
  },
  notifications: {
    list: (unreadOnly = false) => request<NotificationFeed>(
      `/api/notifications${queryString({ unreadOnly: unreadOnly ? 'true' : undefined })}`
    ),
    markRead: (id: string) => request<Notification>(`/api/notifications/${encodeURIComponent(id)}/read`, {
      method: 'PATCH'
    }),
    markAllRead: () => request<void>('/api/notifications/read-all', { method: 'POST' })
  },
  admin: {
    directory: (params: {
      search?: string;
      status?: UserStatus;
      role?: UserRole;
      page?: number;
      pageSize?: number;
    }) => request<UserDirectory>(`/api/admin/directory${queryString(params)}`),
    permissions: () => request<RolePermission[]>('/api/admin/permissions'),
    setPermission: (role: PermissionRole, resource: SavedDataResource, canViewAll: boolean) =>
      request<RolePermission>('/api/admin/permissions', {
        method: 'PATCH',
        body: jsonBody({ role, resource, canViewAll })
      }),
    setStatus: (id: string, status: UserStatus) => request<User>(
      `/api/admin/users/${encodeURIComponent(id)}/status`,
      { method: 'PATCH', body: jsonBody({ status }) }
    ),
    setRole: (id: string, role: UserRole) => request<User>(
      `/api/admin/users/${encodeURIComponent(id)}/role`,
      { method: 'PATCH', body: jsonBody({ role }) }
    ),
    toolAccess: (id: string) => request<UserToolAccess>(`/api/admin/users/${encodeURIComponent(id)}/tool-access`),
    setToolAccess: (id: string, tools: ToolId[], canManageToolAccess: boolean, requiresTwoFactorTools?: ToolId[]) => request<UserToolAccess>(
      `/api/admin/users/${encodeURIComponent(id)}/tool-access`,
      { method: 'PUT', body: jsonBody({ tools, canManageToolAccess, requiresTwoFactorTools }) }
    ),
    removeUser: (id: string) => request<void>(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    integrations: () => request<IntegrationSettings>('/api/admin/integrations'),
    saveMailtrapIntegration: (input: MailtrapIntegrationInput) => request<MailtrapIntegration>(
      '/api/admin/integrations/mailtrap',
      { method: 'PUT', body: jsonBody(input) }
    )
  },
  grids: {
    list: (search = '') => request<SavedGrid[]>(`/api/grids${queryString({ search })}`),
    create: (input: { name: string; shareDescription: string; banners: BannerData[] }) =>
      request<SavedGrid>('/api/grids', { method: 'POST', body: jsonBody(input) }),
    update: (id: string, input: { name: string; shareDescription: string; banners: BannerData[] }) =>
      request<SavedGrid>(`/api/grids/${encodeURIComponent(id)}`, { method: 'PUT', body: jsonBody(input) }),
    remove: (id: string) => request<void>(`/api/grids/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },
  banners: {
    list: (search = '') => request<SavedBanner[]>(`/api/banners${queryString({ search })}`),
    create: (input: { name: string; banner: BannerData }) =>
      request<SavedBanner>('/api/banners', { method: 'POST', body: jsonBody(input) }),
    update: (id: string, input: { name: string; banner: BannerData }) =>
      request<SavedBanner>(`/api/banners/${encodeURIComponent(id)}`, { method: 'PUT', body: jsonBody(input) }),
    remove: (id: string) => request<void>(`/api/banners/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },
  productTables: {
    list: (search = '') => request<ProductTableRecord[]>(`/api/product-tables${queryString({ search })}`),
    get: (id: string) => request<ProductTableRecord>(`/api/product-tables/${encodeURIComponent(id)}`),
    create: (input: ProductTableInput) => request<ProductTableRecord>('/api/product-tables', { method: 'POST', body: jsonBody(input) }),
    update: (id: string, input: ProductTableInput) => request<ProductTableRecord>(`/api/product-tables/${encodeURIComponent(id)}`, { method: 'PUT', body: jsonBody(input) }),
    remove: (id: string) => request<void>(`/api/product-tables/${encodeURIComponent(id)}`, { method: 'DELETE' })
  }
};
