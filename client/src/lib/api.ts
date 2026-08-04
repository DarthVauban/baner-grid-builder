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
  PasskeyAuthenticationResponse,
  PasskeyLoginStart,
  PasskeyRegistrationResponse,
  PasskeyRegistrationStart,
  TwoFactorConfirmResult,
  TwoFactorLoginVerifyInput,
  TwoFactorSetup,
  TwoFactorStatus,
  UserPasskey,
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
import type { BlogPostDocument } from '../types/blog-editor';
import type { MediaAsset, MediaAssetFeed, MediaFolder, MediaFolderFeed } from '../types/media';
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
  CatalogPhotoParserAdapter,
  CatalogPhotoParserAdapterInput,
  CatalogPhotoParserAdapterTest,
  CatalogPhotoParserBatch,
  CatalogPhotoParserErrorFeed,
  CatalogPhotoParserPhotoStatus,
  CatalogPhotoParserProductFeed,
  CatalogPhotoParserTestResult,
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
import type { SystemMetrics } from '../types/system';
import type {
  PublicTradeInSettings,
  TradeInAnswers,
  TradeInConfig,
  TradeInSettings
} from '../types/trade-in';
import type {
  PublicStoreMapData,
  StoreMapImportPreview,
  StoreMapPoint,
  StoreMapPointInput,
  StoreMapPublicationStatus,
  StoreMapSettings
} from '../types/store-map';
import type {
  FacebookPublicationAsset,
  FacebookPublicationCampaign,
  FacebookPublicationCampaignInput,
  FacebookPublicationGroup,
  FacebookPublicationGroupInput,
  FacebookPublicationHistoryItem,
  FacebookPublicationImportCommit,
  FacebookPublicationImportPreview,
  FacebookPublicationRiskSummary,
  FacebookPublicationStore,
  FacebookPublicationStoreInput,
  FacebookPublicationTarget,
  FacebookPublicationWorkbookRows,
  FacebookTargetStatus
} from '../types/facebook-publication';
import {
  ApiError,
  jsonBody,
  queryString,
  request,
  type ApiErrorPayload,
  type ApiSuccessPayload
} from './api-client';

export { ApiError } from './api-client';

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
    startPasskeyLogin: (challengeToken: string) => request<PasskeyLoginStart>('/api/auth/login/passkey/options', {
      method: 'POST', body: jsonBody({ challengeToken })
    }),
    verifyPasskeyLogin: (challengeId: string, response: PasskeyAuthenticationResponse) =>
      request<User>('/api/auth/login/passkey/verify', {
        method: 'POST', body: jsonBody({ challengeId, response })
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
    saveEditor: (id: string, document: BlogPostDocument) => request<BlogPublication>(`/api/publications/${encodeURIComponent(id)}/editor`, {
      method: 'PUT', body: jsonBody({ document })
    }),
    setStatus: (id: string, status: PublicationStatus, publicationUrl = '') =>
      request<BlogPublication>(`/api/publications/${encodeURIComponent(id)}/status`, {
        method: 'PATCH', body: jsonBody({ status, publicationUrl })
      })
  },
  media: {
    list: (params: { search?: string; folderId?: string; page?: number; pageSize?: number } = {}) =>
      request<MediaAssetFeed>(`/api/media${queryString(params)}`),
    selection: (folderId?: string) => request<{ ids: string[] }>(`/api/media/selection${queryString({ folderId })}`),
    folders: (parentId?: string) => request<MediaFolderFeed>(`/api/media/folders${queryString({ parentId })}`),
    createFolder: (input: { name: string; parentId: string | null }) =>
      request<MediaFolder>('/api/media/folders', { method: 'POST', body: jsonBody(input) }),
    updateFolder: (id: string, name: string) =>
      request<MediaFolder>(`/api/media/folders/${encodeURIComponent(id)}`, { method: 'PATCH', body: jsonBody({ name }) }),
    removeFolder: (id: string) => request<void>(`/api/media/folders/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    upload: (file: File, onProgress?: (progress: number) => void, folderId?: string) => new Promise<MediaAsset>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api/media${queryString({ folderId })}`);
      xhr.withCredentials = true;
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name));
      xhr.upload.addEventListener('progress', (event) => {
        if (!event.lengthComputable || event.total <= 0) return;
        onProgress?.(Math.min(99, Math.round((event.loaded / event.total) * 100)));
      });
      xhr.addEventListener('load', () => {
        let payload: ApiSuccessPayload<MediaAsset> & ApiErrorPayload = {} as ApiSuccessPayload<MediaAsset> & ApiErrorPayload;
        try {
          payload = JSON.parse(xhr.responseText || '{}') as ApiSuccessPayload<MediaAsset> & ApiErrorPayload;
        } catch {
          payload = {} as ApiSuccessPayload<MediaAsset> & ApiErrorPayload;
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
        error: { code: 'NETWORK_ERROR', message: 'Не вдалося завантажити зображення. Перевірте з’єднання.' }
      })));
      xhr.addEventListener('abort', () => reject(new ApiError(0, {
        error: { code: 'UPLOAD_ABORTED', message: 'Завантаження зображення скасовано.' }
      })));
      xhr.send(file);
    }),
    update: (id: string, input: Pick<MediaAsset, 'name' | 'altText'>) =>
      request<MediaAsset>(`/api/media/${encodeURIComponent(id)}`, { method: 'PATCH', body: jsonBody(input) }),
    removeMany: async (ids: string[]) => {
      let deleted = 0;
      for (let index = 0; index < ids.length; index += 500) {
        const result = await request<{ deleted: number }>('/api/media/bulk-delete', {
          method: 'POST', body: jsonBody({ ids: ids.slice(index, index + 500) })
        });
        deleted += result.deleted;
      }
      return { deleted };
    },
    remove: (id: string) => request<void>(`/api/media/${encodeURIComponent(id)}`, { method: 'DELETE' })
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
    }),
    passkeys: () => request<UserPasskey[]>('/api/users/profile/passkeys'),
    startPasskeyRegistration: (code: string, name: string) =>
      request<PasskeyRegistrationStart>('/api/users/profile/passkeys/options', {
        method: 'POST', body: jsonBody({ code, name })
      }),
    finishPasskeyRegistration: (challengeId: string, name: string, response: PasskeyRegistrationResponse) =>
      request<UserPasskey>('/api/users/profile/passkeys/verify', {
        method: 'POST', body: jsonBody({ challengeId, name, response })
      }),
    removePasskey: (id: string, code: string) => request<void>(`/api/users/profile/passkeys/${encodeURIComponent(id)}`, {
      method: 'DELETE', body: jsonBody({ code })
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
    permanentlyRemove: (id: string, expectedVersion: number) =>
      request<void>(`/api/catalog/products/${encodeURIComponent(id)}/permanent`, { method: 'DELETE', body: jsonBody({ expectedVersion }) }),
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
      request<CatalogStorefrontSettings>('/api/catalog/storefront-settings', { method: 'PATCH', body: jsonBody(input) }),
    photoParser: {
      products: (params: { search?: string; photoStatus?: CatalogPhotoParserPhotoStatus; page?: number; pageSize?: number }) =>
        request<CatalogPhotoParserProductFeed>(`/api/catalog/photo-parser/products${queryString(params)}`),
      setSourceUrl: (productId: string, sourceUrl: string) =>
        request<{ productId: string; sourceUrl: string }>(
          `/api/catalog/photo-parser/products/${encodeURIComponent(productId)}/source-url`,
          { method: 'PATCH', body: jsonBody({ sourceUrl }) }
        ),
      activeBatch: () => request<CatalogPhotoParserBatch | null>('/api/catalog/photo-parser/batches/active'),
      batch: (batchId: string) =>
        request<CatalogPhotoParserBatch>(`/api/catalog/photo-parser/batches/${encodeURIComponent(batchId)}`),
      startBatch: (input: { search?: string; photoStatus?: CatalogPhotoParserPhotoStatus; targetFolderId?: string | null }) =>
        request<CatalogPhotoParserBatch>('/api/catalog/photo-parser/batches', {
          method: 'POST',
          body: jsonBody(input)
        }),
      errors: (params: { search?: string; page?: number; pageSize?: number }) =>
        request<CatalogPhotoParserErrorFeed>(`/api/catalog/photo-parser/errors${queryString(params)}`),
      clearErrors: () => request<{ clearedCount: number }>('/api/catalog/photo-parser/errors', {
        method: 'DELETE'
      }),
      adapters: () => request<CatalogPhotoParserAdapter[]>('/api/catalog/photo-parser/adapters'),
      testAdapter: (input: CatalogPhotoParserAdapterTest) =>
        request<CatalogPhotoParserTestResult>('/api/catalog/photo-parser/adapters/test', {
          method: 'POST',
          body: jsonBody(input),
          timeoutMs: 90_000
        }),
      createAdapter: (input: CatalogPhotoParserAdapterInput) =>
        request<CatalogPhotoParserAdapter>('/api/catalog/photo-parser/adapters', {
          method: 'POST',
          body: jsonBody(input)
        }),
      updateAdapter: (adapterId: string, input: CatalogPhotoParserAdapterInput) =>
        request<CatalogPhotoParserAdapter>(`/api/catalog/photo-parser/adapters/${encodeURIComponent(adapterId)}`, {
          method: 'PUT',
          body: jsonBody(input)
        }),
      toggleAdapter: (adapterId: string) =>
        request<CatalogPhotoParserAdapter>(`/api/catalog/photo-parser/adapters/${encodeURIComponent(adapterId)}/toggle`, {
          method: 'PATCH'
        }),
      removeAdapter: (adapterId: string) =>
        request<void>(`/api/catalog/photo-parser/adapters/${encodeURIComponent(adapterId)}`, {
          method: 'DELETE'
        })
    }
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
  storeMap: {
    points: (params: { search?: string; publicationStatus?: StoreMapPublicationStatus | '' } = {}) =>
      request<StoreMapPoint[]>(`/api/store-map/points${queryString(params)}`),
    createPoint: (input: StoreMapPointInput) =>
      request<StoreMapPoint>('/api/store-map/points', { method: 'POST', body: jsonBody(input) }),
    updatePoint: (id: string, input: StoreMapPointInput) =>
      request<StoreMapPoint>(`/api/store-map/points/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: jsonBody(input)
      }),
    removePoint: (id: string) =>
      request<void>(`/api/store-map/points/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    settings: () => request<StoreMapSettings>('/api/store-map/settings'),
    updateSettings: (input: Omit<StoreMapSettings, 'publicId' | 'updatedAt'>) =>
      request<StoreMapSettings>('/api/store-map/settings', { method: 'PUT', body: jsonBody(input) }),
    previewImport: (rows: Array<Record<string, unknown>>) =>
      request<StoreMapImportPreview>('/api/store-map/imports/preview', {
        method: 'POST',
        body: jsonBody({ rows }),
        timeoutMs: 120_000
      }),
    commitImport: (rows: Array<Record<string, unknown>>, options: { importNew: boolean; updateExisting: boolean }) =>
      request<StoreMapImportPreview>('/api/store-map/imports/commit', {
        method: 'POST',
        body: jsonBody({ rows, ...options }),
        timeoutMs: 180_000
      }),
    publicData: () => request<PublicStoreMapData>('/api/public/store-map')
  },
  facebookPublications: {
    stores: (params: { search?: string; status?: string } = {}) =>
      request<FacebookPublicationStore[]>(`/api/facebook-publications/stores${queryString(params)}`),
    createStore: (input: FacebookPublicationStoreInput) =>
      request<FacebookPublicationStore>('/api/facebook-publications/stores', { method: 'POST', body: jsonBody(input) }),
    updateStore: (id: string, input: FacebookPublicationStoreInput) =>
      request<FacebookPublicationStore>(`/api/facebook-publications/stores/${encodeURIComponent(id)}`, {
        method: 'PUT', body: jsonBody(input)
      }),
    removeStore: (id: string) => request<void>(`/api/facebook-publications/stores/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    groups: (params: { search?: string; status?: string } = {}) =>
      request<FacebookPublicationGroup[]>(`/api/facebook-publications/groups${queryString(params)}`),
    createGroup: (input: FacebookPublicationGroupInput) =>
      request<FacebookPublicationGroup>('/api/facebook-publications/groups', { method: 'POST', body: jsonBody(input) }),
    updateGroup: (id: string, input: FacebookPublicationGroupInput) =>
      request<FacebookPublicationGroup>(`/api/facebook-publications/groups/${encodeURIComponent(id)}`, {
        method: 'PUT', body: jsonBody(input)
      }),
    removeGroup: (id: string) => request<void>(`/api/facebook-publications/groups/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    previewImport: (rows: FacebookPublicationWorkbookRows) =>
      request<FacebookPublicationImportPreview>('/api/facebook-publications/imports/preview', {
        method: 'POST', body: jsonBody(rows), timeoutMs: 120_000
      }),
    commitImport: (rows: FacebookPublicationWorkbookRows) =>
      request<FacebookPublicationImportCommit>('/api/facebook-publications/imports/commit', {
        method: 'POST', body: jsonBody(rows), timeoutMs: 180_000
      }),
    uploadAsset: (file: File) => request<FacebookPublicationAsset>('/api/facebook-publications/assets', {
      method: 'POST',
      headers: { 'Content-Type': file.type, 'X-File-Name': encodeURIComponent(file.name) },
      body: file,
      timeoutMs: 120_000
    }),
    campaigns: (params: { search?: string; status?: string } = {}) =>
      request<FacebookPublicationCampaign[]>(`/api/facebook-publications/campaigns${queryString(params)}`),
    campaign: (id: string) => request<FacebookPublicationCampaign>(`/api/facebook-publications/campaigns/${encodeURIComponent(id)}`),
    createCampaign: (input: FacebookPublicationCampaignInput) =>
      request<FacebookPublicationCampaign>('/api/facebook-publications/campaigns', { method: 'POST', body: jsonBody(input) }),
    updateTarget: (id: string, input: Partial<Pick<FacebookPublicationTarget, 'renderedText' | 'postUrl' | 'note'>> & { status?: FacebookTargetStatus }) =>
      request<FacebookPublicationTarget>(`/api/facebook-publications/targets/${encodeURIComponent(id)}`, {
        method: 'PATCH', body: jsonBody(input)
      }),
    recordActivity: (id: string, activity: 'opened' | 'copied' | 'image_opened') =>
      request<FacebookPublicationTarget>(`/api/facebook-publications/targets/${encodeURIComponent(id)}/activity`, {
        method: 'POST', body: jsonBody({ activity })
      }),
    retryTarget: (id: string) => request<FacebookPublicationTarget>(
      `/api/facebook-publications/targets/${encodeURIComponent(id)}/retry`, { method: 'POST' }
    ),
    history: (params: { search?: string; status?: string } = {}) =>
      request<FacebookPublicationHistoryItem[]>(`/api/facebook-publications/history${queryString(params)}`),
    riskSummary: () => request<FacebookPublicationRiskSummary>('/api/facebook-publications/risk-summary')
  },
  tradeIn: {
    settings: () => request<TradeInSettings>('/api/trade-in/settings'),
    forms: () => request<ApplicationForm[]>('/api/trade-in/forms'),
    save: (input: { publicOrigin: string; config: TradeInConfig }) =>
      request<TradeInSettings>('/api/trade-in/settings', { method: 'PUT', body: jsonBody(input) }),
    publish: (input: { publicOrigin: string; config: TradeInConfig }) =>
      request<TradeInSettings>('/api/trade-in/publish', { method: 'POST', body: jsonBody(input) }),
    previewSettings: () => request<PublicTradeInSettings>('/api/trade-in/preview-settings'),
    publicSettings: () => request<PublicTradeInSettings>('/api/public/trade-in/settings'),
    submitPreviewApplication: (input: {
      values: TradeInAnswers;
      context: Record<string, unknown>;
      idempotencyKey: string;
      honeypot?: string;
    }) => request<{ id: string; number: string; status: string; duplicate?: boolean }>('/api/trade-in/preview-applications', {
      method: 'POST',
      body: jsonBody(input)
    }),
    submitApplication: (input: {
      values: TradeInAnswers;
      context: Record<string, unknown>;
      idempotencyKey: string;
      honeypot?: string;
    }) => request<{ id: string; number: string; status: string; duplicate?: boolean }>('/api/public/trade-in/applications', {
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
    systemMetrics: () => request<SystemMetrics>('/api/admin/system/metrics'),
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
