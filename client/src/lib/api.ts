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
  UserApplicationNotificationSettings,
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
import type {
  BackupAdminState,
  BackupRestoreResult,
  BackupRun,
  BackupSettings,
  IntegrationSettings,
  MailtrapIntegration,
  MailtrapIntegrationInput,
  TelegramIntegration,
  TelegramIntegrationInput
} from '../types/integration';
import type {
  ApplicationBank,
  ApplicationButtonConfig,
  ApplicationButtonInput,
  ApplicationCounts,
  ApplicationFeed,
  ApplicationForm,
  ApplicationFormSummary,
  ApplicationFormInput,
  ApplicationRecord,
  ApplicationStatus
} from '../types/application';
import type {
  CatalogBrand,
  CatalogBrandDirectory,
  CatalogAuditHistoryFeed,
  CatalogAuditHistoryParams,
  CatalogCharacteristicTemplate,
  CatalogCharacteristicTemplateInput,
  CatalogExportFeed,
  CatalogFeed,
  CatalogImportPreview,
  CatalogImportHistoryDetail,
  CatalogImportTemplateSchema,
  CatalogMediaAsset,
  CatalogProduct,
  CatalogProductCharacteristics,
  CatalogProductGroup,
  CatalogProductModificationSet,
  CatalogProductInput,
  CatalogProductListParams,
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

type ApiRequestOptions = RequestInit & {
  timeoutMs?: number;
};

const DEFAULT_API_TIMEOUT_MS = 30_000;

async function request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
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
    toolAccess: (signal?: AbortSignal) => request<ToolId[]>('/api/users/tool-access', { signal, timeoutMs: 15_000 }),
    toolCatalog: (signal?: AbortSignal) => request<ToolCatalog>('/api/users/tool-catalog', { signal, timeoutMs: 15_000 }),
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
    list: (params: { filter?: string; formId?: string; search?: string; sort?: string; page?: number; pageSize?: number }) =>
      request<ApplicationFeed>(`/api/applications${queryString(params)}`),
    forms: () => request<ApplicationFormSummary[]>('/api/applications/forms'),
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
    brandDirectories: () => request<CatalogBrandDirectory[]>('/api/catalog/brand-directories'),
    createBrandDirectory: (input: Pick<CatalogBrandDirectory, 'label' | 'description' | 'active' | 'sortOrder'>) =>
      request<CatalogBrandDirectory>('/api/catalog/brand-directories', { method: 'POST', body: jsonBody(input) }),
    updateBrandDirectory: (id: string, input: Partial<Pick<CatalogBrandDirectory, 'label' | 'description' | 'active' | 'sortOrder'>>) =>
      request<CatalogBrandDirectory>(`/api/catalog/brand-directories/${encodeURIComponent(id)}`, { method: 'PATCH', body: jsonBody(input) }),
    brands: (params?: { directoryId?: string; active?: 'all' | 'active' }) =>
      request<CatalogBrand[]>(`/api/catalog/brands${queryString(params || {})}`),
    createBrand: (input: Pick<CatalogBrand, 'directoryId' | 'label' | 'logoUrl' | 'active' | 'sortOrder'>) =>
      request<CatalogBrand>('/api/catalog/brands', { method: 'POST', body: jsonBody(input) }),
      bulkCreateBrands: (input: { directoryId: string; labels: string[] }) =>
        request<{ created: CatalogBrand[]; skipped: string[]; total: number }>('/api/catalog/brands/bulk', { method: 'POST', body: jsonBody(input) }),
      updateBrand: (id: string, input: Partial<Pick<CatalogBrand, 'directoryId' | 'label' | 'logoUrl' | 'active' | 'sortOrder'>>) =>
        request<CatalogBrand>(`/api/catalog/brands/${encodeURIComponent(id)}`, { method: 'PATCH', body: jsonBody(input) }),
      characteristicTemplates: () => request<CatalogCharacteristicTemplate[]>('/api/catalog/characteristic-templates'),
      createCharacteristicTemplate: (input: CatalogCharacteristicTemplateInput) =>
        request<CatalogCharacteristicTemplate>('/api/catalog/characteristic-templates', { method: 'POST', body: jsonBody(input) }),
      updateCharacteristicTemplate: (id: string, input: CatalogCharacteristicTemplateInput) =>
        request<CatalogCharacteristicTemplate>(`/api/catalog/characteristic-templates/${encodeURIComponent(id)}`, { method: 'PUT', body: jsonBody(input) }),
      productGroups: () => request<CatalogProductGroup[]>('/api/catalog/product-groups'),
      list: (params: CatalogProductListParams) =>
        request<CatalogFeed>(`/api/catalog/products${queryString(params)}`),
      exportProducts: (params: CatalogProductListParams) => {
        const selectionParams = { ...params };
        delete selectionParams.page;
        delete selectionParams.pageSize;
        return request<CatalogExportFeed>(`/api/catalog/products/export${queryString(selectionParams)}`);
      },
    get: (id: string) => request<CatalogProduct>(`/api/catalog/products/${encodeURIComponent(id)}`),
    create: (input: CatalogProductInput) =>
      request<CatalogProduct>('/api/catalog/products', { method: 'POST', body: jsonBody(input) }),
    update: (id: string, input: CatalogProductInput & { expectedVersion: number }) =>
      request<CatalogProduct>(`/api/catalog/products/${encodeURIComponent(id)}`, { method: 'PUT', body: jsonBody(input) }),
    remove: (id: string, expectedVersion: number, options?: { groupAction?: 'disband' | 'promote'; newMainProductId?: string | null }) =>
      request<void>(`/api/catalog/products/${encodeURIComponent(id)}`, { method: 'DELETE', body: jsonBody({ expectedVersion, ...options }) }),
      setPublicationStatus: (id: string, status: CatalogPublicationStatus, expectedVersion: number) =>
        request<CatalogProduct>(`/api/catalog/products/${encodeURIComponent(id)}/publication-status`, {
          method: 'PATCH',
          body: jsonBody({ status, expectedVersion })
        }),
      productCharacteristics: (id: string) =>
        request<CatalogProductCharacteristics>(`/api/catalog/products/${encodeURIComponent(id)}/characteristics`),
      updateProductCharacteristics: (id: string, input: { templateId: string; values: Record<string, unknown>; expectedVersion: number }) =>
        request<CatalogProduct>(`/api/catalog/products/${encodeURIComponent(id)}/characteristics`, { method: 'PUT', body: jsonBody(input) }),
      productModifications: (id: string) =>
        request<CatalogProductModificationSet>(`/api/catalog/products/${encodeURIComponent(id)}/modifications`),
      updateProductModifications: (id: string, input: { groupId?: string | null; groupLabel?: string; mainProductId?: string | null; productIds: string[]; expectedVersion: number }) =>
        request<CatalogProduct>(`/api/catalog/products/${encodeURIComponent(id)}/modifications`, { method: 'PUT', body: jsonBody(input) }),
    uploadMedia: (file: Blob, fileName: string, onProgress?: (progress: number) => void) => new Promise<CatalogMediaAsset>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/catalog/media');
      xhr.withCredentials = true;
      xhr.setRequestHeader('Content-Type', 'image/webp');
      xhr.setRequestHeader('X-File-Name', encodeURIComponent(fileName));
      xhr.upload.addEventListener('progress', (event) => {
        if (!event.lengthComputable || event.total <= 0) return;
        onProgress?.(Math.min(99, Math.round((event.loaded / event.total) * 100)));
      });
      xhr.addEventListener('load', () => {
        let payload: ApiSuccessPayload<CatalogMediaAsset> & ApiErrorPayload = {} as ApiSuccessPayload<CatalogMediaAsset> & ApiErrorPayload;
        try {
          payload = JSON.parse(xhr.responseText || '{}') as ApiSuccessPayload<CatalogMediaAsset> & ApiErrorPayload;
        } catch {
          payload = {} as ApiSuccessPayload<CatalogMediaAsset> & ApiErrorPayload;
        }
        if (xhr.status < 200 || xhr.status >= 300) {
          const error = new ApiError(xhr.status, payload);
          if (xhr.status === 401 && ['AUTH_REQUIRED', 'INVALID_SESSION'].includes(error.code)) {
            window.dispatchEvent(new Event('mt:unauthorized'));
          }
          reject(error);
          return;
        }
        onProgress?.(100);
        resolve(payload.data);
      });
      xhr.addEventListener('error', () => reject(new ApiError(0, {
        error: { code: 'NETWORK_ERROR', message: 'Не вдалося завантажити фото. Перевірте з’єднання та спробуйте ще раз.' }
      })));
      xhr.addEventListener('abort', () => reject(new ApiError(0, {
        error: { code: 'UPLOAD_ABORTED', message: 'Завантаження фото скасовано.' }
      })));
      xhr.send(file);
    }),
    previewImport: (rows: Array<Record<string, unknown>>) =>
      request<CatalogImportPreview>('/api/catalog/imports/preview', { method: 'POST', body: jsonBody({ rows }), timeoutMs: 120_000 }),
    importTemplate: () => request<CatalogImportTemplateSchema>('/api/catalog/imports/template'),
    commitImport: (rows: Array<Record<string, unknown>>, options: { importNew: boolean; updateExisting: boolean }) =>
      request<CatalogImportPreview>('/api/catalog/imports/commit', { method: 'POST', body: jsonBody({ rows, ...options }), timeoutMs: 180_000 }),
    auditHistory: (params: CatalogAuditHistoryParams) =>
      request<CatalogAuditHistoryFeed>(`/api/catalog/audit${queryString(params)}`),
    importHistoryDetail: (id: string, params: { page?: number; pageSize?: number } = {}) =>
      request<CatalogImportHistoryDetail>(`/api/catalog/imports/${encodeURIComponent(id)}${queryString(params)}`),
    storefrontSettings: () => request<CatalogStorefrontSettings>('/api/catalog/storefront-settings'),
    updateStorefrontSettings: (input: Partial<Pick<CatalogStorefrontSettings, 'selectedFormPublicId' | 'publicOrigin' | 'storefrontTheme' | 'productCardTheme' | 'productPageTheme'>>) =>
      request<CatalogStorefrontSettings>('/api/catalog/storefront-settings', { method: 'PATCH', body: jsonBody(input) })
  },
  storefront: {
    settings: () => request<CatalogStorefrontSettings>('/api/storefront/settings'),
    list: (params: { search?: string; condition?: string; availability?: string; brandId?: string; priceMin?: string | number; priceMax?: string | number; characteristics?: string; sort?: string; page?: number; pageSize?: number }) =>
      request<CatalogFeed>(`/api/storefront/products${queryString(params)}`),
    get: (identifier: string) => request<CatalogProduct>(`/api/storefront/products/${encodeURIComponent(identifier)}`),
    previewSettings: () => request<CatalogStorefrontSettings & { preview: true }>('/api/catalog/preview/settings'),
    previewList: (params: { search?: string; condition?: string; availability?: string; brandId?: string; priceMin?: string | number; priceMax?: string | number; characteristics?: string; sort?: string; page?: number; pageSize?: number }) =>
      request<CatalogFeed>(`/api/catalog/preview/products${queryString(params)}`),
    previewGet: (identifier: string) => request<CatalogProduct>(`/api/catalog/preview/products/${encodeURIComponent(identifier)}`),
    form: (publicId: string) => request<{
      id: string;
      title: string;
      description: string;
      buttonText: string;
      successMessage: string;
      styles: Record<string, string>;
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
      }),
    previewSubmitApplication: (identifier: string, input: { values: Record<string, unknown>; context: Record<string, unknown>; idempotencyKey: string; honeypot?: string }) =>
      request<{ id: string; number: string; status: string; duplicate?: boolean }>(`/api/catalog/preview/products/${encodeURIComponent(identifier)}/applications`, {
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
    applicationNotifications: (id: string) => request<UserApplicationNotificationSettings>(
      `/api/admin/users/${encodeURIComponent(id)}/application-notifications`
    ),
    setApplicationNotifications: (id: string, disabledFormIds: string[]) => request<UserApplicationNotificationSettings>(
      `/api/admin/users/${encodeURIComponent(id)}/application-notifications`,
      { method: 'PUT', body: jsonBody({ disabledFormIds }) }
    ),
    removeUser: (id: string) => request<void>(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    integrations: () => request<IntegrationSettings>('/api/admin/integrations'),
    saveMailtrapIntegration: (input: MailtrapIntegrationInput) => request<MailtrapIntegration>(
      '/api/admin/integrations/mailtrap',
      { method: 'PUT', body: jsonBody(input) }
    ),
    saveTelegramIntegration: (input: TelegramIntegrationInput) => request<TelegramIntegration>(
      '/api/admin/integrations/telegram',
      { method: 'PUT', body: jsonBody(input), timeoutMs: 45_000 }
    ),
    backups: () => request<BackupAdminState>('/api/admin/backups'),
    saveBackupSettings: (input: Pick<BackupSettings, 'automaticEnabled' | 'scheduleType' | 'scheduleTime' | 'scheduleWeekday' | 'timezone'>) =>
      request<BackupSettings>('/api/admin/backups/settings', { method: 'PUT', body: jsonBody(input) }),
    runBackup: () => request<BackupRun>('/api/admin/backups/run', { method: 'POST', timeoutMs: 900_000 }),
    restoreBackup: (archive: File) => request<BackupRestoreResult>('/api/admin/backups/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/gzip', 'X-File-Name': encodeURIComponent(archive.name) },
      body: archive,
      timeoutMs: 900_000
    })
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
