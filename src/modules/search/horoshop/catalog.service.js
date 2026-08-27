import { createHash, createHmac } from 'node:crypto';
import { env } from '../../../config/env.js';
import { AppError } from '../../../lib/app-error.js';
import { decryptHoroshopCredentials, encryptHoroshopCredentials } from './credential-cipher.js';
import { HoroshopApiError, HoroshopClient } from './horoshop.client.js';
import { normalizeHoroshopCategories, normalizeHoroshopProducts } from './catalog.normalizer.js';
import { HoroshopCatalogRepository } from './catalog.repository.js';
import { removeMediaImage } from '../../media/media.storage.js';

const pageSize = 200;
const maximumPages = 250;
const categoryBranchConcurrency = 4;
const maximumCategoryRoots = 1_000;
const maximumCategories = 20_000;

function pageReference(value) {
  const candidate = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value.id
    : value;
  if (typeof candidate !== 'string' && typeof candidate !== 'number') return null;
  const key = String(candidate).trim();
  return key ? { key, value: candidate } : null;
}

function categoryPageReference(page) {
  if (!page || typeof page !== 'object' || Array.isArray(page)) return null;
  return pageReference(page.id ?? page.external_id);
}

function categoryParentReference(page) {
  if (!page || typeof page !== 'object' || Array.isArray(page)) return null;
  return pageReference(page.parent_id ?? page.parent);
}

function domainFingerprint(storeDomain) {
  return createHmac('sha256', env.JWT_SECRET)
    .update('horoshop-domain\0')
    .update(storeDomain)
    .digest('hex');
}

function connectionError(error) {
  if (error instanceof HoroshopApiError) {
    if (error.code === 'permission_denied') {
      return new AppError(422, 'HOROSHOP_ACCESS_DENIED', 'Хорошоп відхилив логін, пароль або рівень доступу адміністратора.');
    }
    if (error.code === 'subscription_limit') {
      return new AppError(422, 'HOROSHOP_SUBSCRIPTION_LIMIT', 'Тариф або ліміти Хорошоп не дозволяють виконати цей API-запит.');
    }
    if (error.code === 'unsupported_operation') {
      return new AppError(422, 'HOROSHOP_API_UNAVAILABLE', 'У цьому магазині недоступна потрібна функція API Хорошоп.');
    }
  }
  if (error instanceof Error && error.code === 'EACCES') {
    return new AppError(422, 'HOROSHOP_DOMAIN_UNSAFE', 'Домен магазину має вести лише на публічні IP-адреси.');
  }
  return new AppError(422, 'HOROSHOP_CONNECTION_FAILED', 'Не вдалося підключитися до API Хорошоп. Перевірте домен і доступи.');
}

function publicSyncError(error) {
  if (error instanceof HoroshopApiError) return `Horoshop API: ${error.code}`;
  if (error?.name === 'AbortError') return 'Синхронізацію перервано під час відключення.';
  return String(error instanceof Error ? error.message : error || 'Невідома помилка синхронізації');
}

export class HoroshopCatalogService {
  constructor(options = {}) {
    this.repository = options.repository || new HoroshopCatalogRepository();
    this.clientFactory = options.clientFactory || ((storeDomain) => new HoroshopClient(storeDomain));
    this.activeSync = null;
    this.activeAbortController = null;
    this.syncStarting = false;
    this.activeExternalWrite = null;
    this.externalWriteStarting = false;
  }

  async status() {
    return this.repository.getStatus();
  }

  async catalog(input) {
    const [integration, catalog] = await Promise.all([
      this.status(),
      this.repository.listCatalog(input)
    ]);
    return { integration, ...catalog };
  }

  async photoTargets(input) {
    return this.repository.listPhotoTargets(input);
  }

  async connect(input, actorUserId) {
    let client;
    try {
      client = this.clientFactory(input.storeDomain);
      await client.authenticate(input.login, input.password);
    } catch (error) {
      throw connectionError(error);
    }

    let connection;
    try {
      connection = await this.repository.createConnection({
        storeDomain: client.storeDomain,
        encryptedCredentials: encryptHoroshopCredentials({ login: input.login, password: input.password }),
        pollingIntervalMinutes: input.pollingIntervalMinutes
      });
    } catch (error) {
      if (error?.code === 'PURGE_FAILED') {
        throw new AppError(409, 'HOROSHOP_PURGE_FAILED', 'Попереднє відключення не завершило очищення. Нове підключення заблоковано.');
      }
      if (error?.code === 'CONNECTION_EXISTS' || error?.code === '23505') {
        throw new AppError(409, 'HOROSHOP_ALREADY_CONNECTED', 'Спочатку відключіть поточний магазин і видаліть його локальний каталог.');
      }
      throw error;
    }
    await this.repository.recordAudit({
      connectionId: connection.id,
      actorUserId,
      action: 'connect',
      outcome: 'succeeded',
      domainFingerprint: domainFingerprint(connection.storeDomain)
    });
    return connection;
  }

  async updateSettings(input) {
    const connection = await this.repository.getConnection();
    if (!connection) throw new AppError(409, 'HOROSHOP_NOT_CONNECTED', 'Спочатку підключіть магазин Хорошоп.');
    if (['disconnecting', 'purge_failed'].includes(connection.status)) {
      throw new AppError(409, 'HOROSHOP_CONNECTION_BLOCKED', 'Підключення недоступне до завершення очищення локальних даних.');
    }
    return this.repository.updatePollingInterval(connection, input.pollingIntervalMinutes);
  }

  async startSync(mode = 'manual', actorUserId = null) {
    if (this.activeSync || this.syncStarting || this.activeExternalWrite || this.externalWriteStarting) return false;
    this.syncStarting = true;
    try {
      const connection = await this.repository.getConnection();
      if (!connection) throw new AppError(409, 'HOROSHOP_NOT_CONNECTED', 'Спочатку підключіть магазин Хорошоп.');
      if (['disconnecting', 'purge_failed'].includes(connection.status)) {
        throw new AppError(409, 'HOROSHOP_CONNECTION_BLOCKED', 'Підключення недоступне до завершення очищення локальних даних.');
      }

      const runId = await this.repository.beginSync(connection, mode);
      const abortController = new AbortController();
      this.activeAbortController = abortController;
      const operation = this.runSync(connection, runId, mode, actorUserId, abortController.signal);
      const tracked = operation.finally(() => {
        if (this.activeSync === tracked) {
          this.activeSync = null;
          this.activeAbortController = null;
        }
      });
      this.activeSync = tracked;
      void tracked.catch((error) => {
        if (error?.name !== 'AbortError') {
          console.error(JSON.stringify({
            event: 'horoshop_catalog_sync_failed',
            message: publicSyncError(error)
          }));
        }
      });
      return true;
    } finally {
      this.syncStarting = false;
    }
  }

  async waitForIdle() {
    await Promise.all([
      this.activeSync?.catch(() => {}),
      this.activeExternalWrite?.catch(() => {})
    ]);
  }

  async runExclusiveExternalWrite(operation) {
    if (this.activeSync || this.syncStarting || this.activeExternalWrite || this.externalWriteStarting) {
      throw new AppError(409, 'HOROSHOP_CATALOG_BUSY', 'Дочекайтеся завершення поточної операції з каталогом Хорошоп.');
    }
    this.externalWriteStarting = true;
    try {
      const tracked = Promise.resolve().then(operation);
      this.activeExternalWrite = tracked;
      return await tracked;
    } finally {
      this.activeExternalWrite = null;
      this.externalWriteStarting = false;
    }
  }

  async disconnect(confirmDomain, actorUserId) {
    const connection = await this.repository.getConnection();
    if (!connection) throw new AppError(404, 'HOROSHOP_NOT_CONNECTED', 'Підключення Хорошоп уже відсутнє.');
    if (confirmDomain.trim().toLowerCase() !== connection.storeDomain.toLowerCase()) {
      throw new AppError(422, 'HOROSHOP_DOMAIN_CONFIRMATION_MISMATCH', 'Введений домен не збігається з підключеним магазином.');
    }

    await this.repository.markDisconnecting(connection);
    this.activeAbortController?.abort();
    if (this.activeSync) await this.activeSync.catch(() => {});
    if (this.activeExternalWrite) await this.activeExternalWrite.catch(() => {});
    try {
      const purged = await this.repository.purgeConnection(connection, {
        actorUserId,
        domainFingerprint: domainFingerprint(connection.storeDomain)
      });
      await Promise.all((purged.mediaStorageKeys || []).map((storageKey) => (
        removeMediaImage(storageKey).catch((error) => {
          console.error(JSON.stringify({
            event: 'horoshop_photo_storage_cleanup_failed',
            storageKey,
            message: String(error?.message || error).slice(0, 500)
          }));
        })
      )));
      return {
        categories: purged.categories,
        products: purged.products,
        modifications: purged.modifications
      };
    } catch (error) {
      await this.repository.recordAudit({
        connectionId: connection.id,
        actorUserId,
        action: 'purge_failed',
        outcome: 'failed',
        domainFingerprint: domainFingerprint(connection.storeDomain),
        details: { reason: publicSyncError(error).slice(0, 500) }
      }).catch(() => {});
      throw new AppError(500, 'HOROSHOP_PURGE_FAILED', 'Не вдалося підтвердити повне очищення. Нове підключення заблоковано.');
    }
  }

  async runSync(connection, runId, mode, actorUserId, signal) {
    const fingerprint = domainFingerprint(connection.storeDomain);
    try {
      await this.repository.recordAudit({
        connectionId: connection.id,
        actorUserId,
        action: 'sync',
        outcome: 'started',
        domainFingerprint: fingerprint,
        details: { mode }
      });
      const credentials = decryptHoroshopCredentials(connection.encryptedCredentials);
      const client = this.clientFactory(connection.storeDomain);
      const token = await client.authenticate(credentials.login, credentials.password);
      this.assertNotAborted(signal);
      const categories = await this.exportCategoryTree(client, token, connection.storeDomain, signal);
      await this.repository.applyCategories(connection, runId, categories);

      const productIds = new Set();
      const modificationIds = new Set();
      const visitedOffsets = new Set();
      const visitedPages = new Set();
      let offset = 0;
      let pages = 0;
      let exportItemsReceived = 0;
      let exportItemsTotal = null;
      let finished = false;

      for (let pageNumber = 0; pageNumber < maximumPages; pageNumber += 1) {
        this.assertNotAborted(signal);
        if (visitedOffsets.has(offset)) throw new Error('Horoshop pagination repeated an offset');
        visitedOffsets.add(offset);
        const page = await client.exportCatalog(token, offset, pageSize);
        exportItemsReceived += page.products.length;
        if (Number.isInteger(page.total) && page.total >= 0) exportItemsTotal = page.total;
        const pageFingerprint = createHash('sha256').update(JSON.stringify(page.products)).digest('hex');
        if (page.products.length > 0 && visitedPages.has(pageFingerprint)) {
          throw new Error('Horoshop pagination returned a repeated product page');
        }
        visitedPages.add(pageFingerprint);
        const products = normalizeHoroshopProducts(page.products, connection.storeDomain);
        await this.repository.applyProducts(connection, runId, products);
        for (const product of products) {
          productIds.add(product.externalId);
          for (const modification of product.modifications) modificationIds.add(modification.externalId);
        }
        pages = pageNumber + 1;
        await this.repository.updateRunProgress(runId, {
          categories: categories.length,
          products: productIds.size,
          modifications: modificationIds.size,
          pages,
          exportItemsReceived,
          exportItemsTotal
        });
        if (page.nextOffset === null) {
          finished = true;
          break;
        }
        offset = page.nextOffset;
      }
      if (!finished) throw new Error('Horoshop catalog exceeded the safe pagination limit');

      const counts = {
        categories: categories.length,
        products: productIds.size,
        modifications: modificationIds.size,
        pages,
        exportItemsReceived,
        exportItemsTotal
      };
      await this.repository.completeSync(connection, runId, counts, {
        categories: categories.map((category) => category.externalId),
        products: [...productIds],
        modifications: [...modificationIds]
      });
      await this.repository.recordAudit({
        connectionId: connection.id,
        actorUserId,
        action: 'sync',
        outcome: 'succeeded',
        domainFingerprint: fingerprint,
        details: { mode, ...counts }
      });
      return counts;
    } catch (error) {
      await this.repository.failSync(connection, runId, publicSyncError(error)).catch(() => {});
      await this.repository.recordAudit({
        connectionId: connection.id,
        actorUserId,
        action: 'sync',
        outcome: 'failed',
        domainFingerprint: fingerprint,
        details: { mode, reason: publicSyncError(error).slice(0, 500) }
      }).catch(() => {});
      throw error;
    }
  }

  async exportCategoryTree(client, token, storeDomain, signal) {
    this.assertNotAborted(signal);
    const rootPages = await client.exportCategories(token, 0);
    this.assertNotAborted(signal);

    const pagesById = new Map();
    for (const page of rootPages) {
      const reference = categoryPageReference(page);
      if (!reference) continue;
      if (!pagesById.has(reference.key)) pagesById.set(reference.key, page);
    }

    const rootReferences = [];
    const rootReferenceKeys = new Set();
    for (const page of pagesById.values()) {
      const reference = categoryPageReference(page);
      if (!reference) continue;
      const parentReference = categoryParentReference(page);
      // pages/export(parent=0) can return the storefront catalog container with
      // a technical parent (for example, the non-exported "Home" page). Treat
      // a parent absent from this response as an API root and expand it.
      if (parentReference && parentReference.key !== '0' && pagesById.has(parentReference.key)) continue;
      if (rootReferenceKeys.has(reference.key)) continue;
      rootReferenceKeys.add(reference.key);
      rootReferences.push(reference);
    }
    if (pagesById.size > maximumCategories) {
      throw new Error('Horoshop category export exceeded the safe category limit');
    }
    if (rootReferences.length > maximumCategoryRoots) {
      throw new Error('Horoshop category export exceeded the safe root-page limit');
    }

    for (let index = 0; index < rootReferences.length; index += categoryBranchConcurrency) {
      this.assertNotAborted(signal);
      const branchPages = await Promise.all(
        rootReferences.slice(index, index + categoryBranchConcurrency).map(async (reference) => {
          const pages = await client.exportCategories(token, reference.value);
          this.assertNotAborted(signal);
          return pages;
        })
      );
      for (const pages of branchPages) {
        for (const page of pages) {
          const reference = categoryPageReference(page);
          if (reference && !pagesById.has(reference.key)) pagesById.set(reference.key, page);
        }
      }
      if (pagesById.size > maximumCategories) {
        throw new Error('Horoshop category export exceeded the safe category limit');
      }
    }

    return normalizeHoroshopCategories([...pagesById.values()], storeDomain);
  }

  assertNotAborted(signal) {
    if (!signal.aborted) return;
    const error = new Error('Horoshop catalog sync aborted');
    error.name = 'AbortError';
    throw error;
  }
}

export const horoshopCatalogService = new HoroshopCatalogService();
