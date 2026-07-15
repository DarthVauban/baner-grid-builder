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
import type {
  ApplicationBank,
  ApplicationButtonConfig,
  ApplicationButtonInput,
  ApplicationCounts,
  ApplicationFeed,
  ApplicationForm,
  ApplicationFormInput,
  ApplicationRecord,
  ApplicationStatus
} from '../types/application';
import type {
  CatalogBrand,
  CatalogFeed,
  CatalogImportPreview,
  CatalogProduct,
  CatalogProductInput,
  CatalogPublicationStatus,
  CatalogStorefrontSettings,
  CatalogSummary
} from '../types/catalog';

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
    if (response.status === 401 && ['AUTH_REQUIRED', 'INVALID_SESSION'].includes(error.code)) {
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
  applications: {
    list: (params: { filter?: string; search?: string; sort?: string; page?: number; pageSize?: number }) =>
      request<ApplicationFeed>(`/api/applications${queryString(params)}`),
    counts: () => request<ApplicationCounts>('/api/applications/counts'),
    get: (id: string) => request<ApplicationRecord>(`/api/applications/${encodeURIComponent(id)}`),
    setStatus: (id: string, status: ApplicationStatus, expectedVersion: number, comment = '') =>
      request<ApplicationRecord>(`/api/applications/${encodeURIComponent(id)}/status`, {
        method: 'PATCH',
        body: jsonBody({ status, expectedVersion, comment })
      }),
    claim: (id: string, expectedVersion: number) =>
      request<ApplicationRecord>(`/api/applications/${encodeURIComponent(id)}/claim`, {
        method: 'POST',
        body: jsonBody({ expectedVersion })
      }),
    addComment: (id: string, text: string, expectedVersion?: number) =>
      request<ApplicationRecord>(`/api/applications/${encodeURIComponent(id)}/comments`, {
        method: 'POST',
        body: jsonBody({ text, expectedVersion })
      }),
    remove: (id: string, code: string) =>
      request<void>(`/api/applications/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        body: jsonBody({ code })
      })
  },
  catalog: {
    summary: () => request<CatalogSummary>('/api/catalog/summary'),
    brands: () => request<CatalogBrand[]>('/api/catalog/brands'),
    createBrand: (input: Pick<CatalogBrand, 'label' | 'active' | 'sortOrder'>) =>
      request<CatalogBrand>('/api/catalog/brands', { method: 'POST', body: jsonBody(input) }),
    updateBrand: (id: string, input: Partial<Pick<CatalogBrand, 'label' | 'active' | 'sortOrder'>>) =>
      request<CatalogBrand>(`/api/catalog/brands/${encodeURIComponent(id)}`, { method: 'PATCH', body: jsonBody(input) }),
    list: (params: { search?: string; condition?: string; status?: string; availability?: string; sort?: string; page?: number; pageSize?: number }) =>
      request<CatalogFeed>(`/api/catalog/products${queryString(params)}`),
    get: (id: string) => request<CatalogProduct>(`/api/catalog/products/${encodeURIComponent(id)}`),
    create: (input: CatalogProductInput) =>
      request<CatalogProduct>('/api/catalog/products', { method: 'POST', body: jsonBody(input) }),
    update: (id: string, input: CatalogProductInput & { expectedVersion: number }) =>
      request<CatalogProduct>(`/api/catalog/products/${encodeURIComponent(id)}`, { method: 'PUT', body: jsonBody(input) }),
    setPublicationStatus: (id: string, status: CatalogPublicationStatus, expectedVersion: number) =>
      request<CatalogProduct>(`/api/catalog/products/${encodeURIComponent(id)}/publication-status`, {
        method: 'PATCH',
        body: jsonBody({ status, expectedVersion })
      }),
    uploadMedia: async (file: Blob, fileName: string) => {
      const response = await fetch('/api/catalog/media', {
        method: 'POST',
        headers: {
          'Content-Type': 'image/webp',
          'X-File-Name': fileName
        },
        body: file,
        credentials: 'same-origin'
      });
      const payload = await response.json().catch(() => ({})) as ApiSuccessPayload<{ url: string; filename: string; size: number; mimeType: string }> & ApiErrorPayload;
      if (!response.ok) {
        const error = new ApiError(response.status, payload);
        if (response.status === 401 && ['AUTH_REQUIRED', 'INVALID_SESSION'].includes(error.code)) {
          window.dispatchEvent(new Event('mt:unauthorized'));
        }
        throw error;
      }
      return payload.data;
    },
    previewImport: (rows: Array<Record<string, unknown>>) =>
      request<CatalogImportPreview>('/api/catalog/imports/preview', { method: 'POST', body: jsonBody({ rows }) }),
    commitImport: (rows: Array<Record<string, unknown>>, options: { importNew: boolean; updateExisting: boolean }) =>
      request<CatalogImportPreview>('/api/catalog/imports/commit', { method: 'POST', body: jsonBody({ rows, ...options }) }),
    storefrontSettings: () => request<CatalogStorefrontSettings>('/api/catalog/storefront-settings'),
    updateStorefrontSettings: (input: Pick<CatalogStorefrontSettings, 'selectedFormPublicId' | 'publicOrigin'>) =>
      request<CatalogStorefrontSettings>('/api/catalog/storefront-settings', { method: 'PATCH', body: jsonBody(input) })
  },
  storefront: {
    settings: () => request<CatalogStorefrontSettings>('/api/storefront/settings'),
    list: (params: { search?: string; condition?: string; availability?: string; sort?: string; page?: number; pageSize?: number }) =>
      request<CatalogFeed>(`/api/storefront/products${queryString(params)}`),
    get: (identifier: string) => request<CatalogProduct>(`/api/storefront/products/${encodeURIComponent(identifier)}`),
    form: (publicId: string) => request<{
      id: string;
      title: string;
      description: string;
      buttonText: string;
      successMessage: string;
      fields: Array<{
        key: string;
        label: string;
        type: string;
        placeholder: string;
        helpText: string;
        defaultValue: string;
        required: boolean;
        systemFieldType: string | null;
        options: Array<{ label: string; value: string }>;
      }>;
    }>(`/api/public/application-forms/${encodeURIComponent(publicId)}`),
    submitApplication: (identifier: string, input: { values: Record<string, unknown>; context: Record<string, unknown>; idempotencyKey: string; honeypot?: string }) =>
      request<{ id: string; number: string; status: string; duplicate?: boolean }>(`/api/storefront/products/${encodeURIComponent(identifier)}/applications`, {
        method: 'POST',
        body: jsonBody(input)
      })
  },
  forms: {
    list: () => request<ApplicationForm[]>('/api/forms'),
    get: (id: string) => request<ApplicationForm>(`/api/forms/${encodeURIComponent(id)}`),
    create: (input: Omit<ApplicationFormInput, 'fields'>) =>
      request<ApplicationForm>('/api/forms', { method: 'POST', body: jsonBody(input) }),
    update: (id: string, input: ApplicationFormInput) =>
      request<ApplicationForm>(`/api/forms/${encodeURIComponent(id)}`, { method: 'PUT', body: jsonBody(input) }),
    duplicate: (id: string) =>
      request<ApplicationForm>(`/api/forms/${encodeURIComponent(id)}/duplicate`, { method: 'POST' }),
    publish: (id: string) =>
      request<ApplicationForm>(`/api/forms/${encodeURIComponent(id)}/publish`, { method: 'PATCH' }),
    disable: (id: string) =>
      request<ApplicationForm>(`/api/forms/${encodeURIComponent(id)}/disable`, { method: 'PATCH' }),
    archive: (id: string) => request<void>(`/api/forms/${encodeURIComponent(id)}/archive`, { method: 'PATCH' }),
    banks: () => request<ApplicationBank[]>('/api/forms/banks'),
    createBank: (input: Pick<ApplicationBank, 'label' | 'value' | 'active' | 'sortOrder'>) =>
      request<ApplicationBank>('/api/forms/banks', { method: 'POST', body: jsonBody(input) }),
    updateBank: (id: string, input: Partial<Pick<ApplicationBank, 'label' | 'value' | 'active' | 'sortOrder'>>) =>
      request<ApplicationBank>(`/api/forms/banks/${encodeURIComponent(id)}`, { method: 'PATCH', body: jsonBody(input) }),
    removeBank: (id: string) => request<void>(`/api/forms/banks/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    buttons: () => request<ApplicationButtonConfig[]>('/api/forms/buttons/list'),
    createButton: (input: ApplicationButtonInput) =>
      request<ApplicationButtonConfig>('/api/forms/buttons', { method: 'POST', body: jsonBody(input) }),
    updateButton: (id: string, input: ApplicationButtonInput) =>
      request<ApplicationButtonConfig>(`/api/forms/buttons/${encodeURIComponent(id)}`, { method: 'PUT', body: jsonBody(input) }),
    archiveButton: (id: string) => request<void>(`/api/forms/buttons/${encodeURIComponent(id)}/archive`, { method: 'PATCH' }),
    buttonScript: (id: string) => request<{ script: string; compactScript: string }>(`/api/forms/buttons/${encodeURIComponent(id)}/script`)
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
