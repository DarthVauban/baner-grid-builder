import { createHash } from 'node:crypto';
import { setImmediate as yieldToEventLoop } from 'node:timers/promises';
import { AppError } from '../../../lib/app-error.js';
import { horoshopCatalogService } from './catalog.service.js';
import { decryptHoroshopCredentials } from './credential-cipher.js';
import { HoroshopApiError, HoroshopClient, horoshopCatalogExportPageSize } from './horoshop.client.js';
import { normalizeHoroshopStickers } from './catalog.normalizer.js';
import { HoroshopStickerRepository, arrayValue, countItems } from './sticker.repository.js';
import { applyStickerChange, assertManualActions, filterStickerProducts, maximumStickerSelection,
  remoteStickerSnapshot, resolveStickerArticles, sameMembership, sameStickers, summarizeStickerSelection, titleFor } from './sticker.domain.js';

const lockId = 72914213;
const notEmpty = (ids) => {
  if (!ids.length || ids.length > maximumStickerSelection) throw new AppError(422, 'STICKER_SELECTION_INVALID', `Оберіть від 1 до ${maximumStickerSelection} товарів.`);
};
const terminal = (status) => ['completed', 'partial', 'stopped'].includes(status);
const preparationReporter = (onProgress, total = 0) => {
  let progress = { stage: 'checking', total, processed: 0, productsRead: 0, pagesRead: 0 };
  return (update) => { progress = { ...progress, ...update }; onProgress?.(progress); };
};

export class HoroshopStickerService {
  constructor(options = {}) {
    this.repository = options.repository || new HoroshopStickerRepository(options.pool);
    this.pool = this.repository.pool;
    this.catalogService = options.catalogService || horoshopCatalogService;
    this.clientFactory = options.clientFactory || ((domain) => new HoroshopClient(domain));
    this.running = false;
    this.batchSize = options.batchSize || 25;
    this.directoryCache = null;
    this.directoryRefresh = null;
    this.scopedExportCapability = null;
  }

  async catalog(filters) {
    const connection = await this.repository.connection();
    let directoryWarning = null;
    try { await this.ensureDirectory(connection); }
    catch (error) { directoryWarning = error instanceof AppError ? error.message : 'Не вдалося отримати довідник стікерів із Хорошоп. Натисніть «Оновити», щоб повторити.'; }
    const catalog = await this.repository.catalog(connection);
    const products = filterStickerProducts(catalog.products, catalog.categories, filters, catalog.directory.map((item) => item.externalId));
    const page = filters.page || 1;
    const pageSize = filters.pageSize || 25;
    return { items: products.slice((page - 1) * pageSize, page * pageSize), total: products.length, page, pageSize,
      pageCount: Math.ceil(products.length / pageSize), storeDomain: connection.storeDomain, lastSyncAt: connection.lastSyncAt,
      categories: catalog.categories, directory: catalog.directory,
      brands: [...new Set(catalog.products.map((p) => p.brand).filter(Boolean))].sort(),
      availabilityOptions: [...new Set(catalog.products.flatMap((p) => [p.availability, ...p.modifications.map((m) => m.availability)]).filter(Boolean))].sort(),
      directoryWarning };
  }

  async ensureDirectory(connection, force = false) {
    const key = `${connection.id}:${connection.generation}`;
    if (!force && this.directoryCache?.key === key && this.directoryCache.expiresAt > Date.now()) {
      if (this.directoryCache.error) throw this.directoryCache.error;
      return;
    }
    if (this.directoryRefresh?.key === key) return this.directoryRefresh.promise;
    const promise = this.catalogService.runExclusiveExternalWrite(async () => {
      const credentials = decryptHoroshopCredentials(connection.encryptedCredentials);
      const client = this.clientFactory(connection.storeDomain);
      const token = await client.authenticate(credentials.login, credentials.password);
      const directory = normalizeHoroshopStickers(await client.exportStickers(token));
      await this.repository.cacheDirectory(connection, directory);
    }).then(() => { this.directoryCache = { key, expiresAt: Date.now() + 300_000, error: null }; })
      .catch((error) => {
        const safeError = error instanceof AppError ? error : new AppError(502, 'STICKER_DIRECTORY_UNAVAILABLE', 'Не вдалося отримати довідник стікерів із Хорошоп. Натисніть «Оновити», щоб повторити.');
        this.directoryCache = { key, expiresAt: Date.now() + 30_000, error: safeError };
        throw safeError;
      }).finally(() => { if (this.directoryRefresh?.promise === promise) this.directoryRefresh = null; });
    this.directoryRefresh = { key, promise };
    return promise;
  }

  async refreshDirectory() {
    await this.ensureDirectory(await this.repository.connection(), true);
    return { refreshed: true };
  }

  async select(filters) {
    const connection = await this.repository.connection();
    const catalog = await this.repository.catalog(connection);
    const products = filterStickerProducts(catalog.products, catalog.categories, filters, catalog.directory.map((item) => item.externalId));
    notEmpty(products.map((p) => p.id));
    return { productIds: products.map((p) => p.id) };
  }

  async selectionSummary(productIds) {
    const connection = await this.repository.connection();
    const catalog = await this.repository.catalog(connection);
    const ids = new Set(productIds);
    notEmpty([...ids]);
    const products = catalog.products.filter((product) => ids.has(product.id));
    if (products.length !== ids.size) throw new AppError(409, 'STICKER_SELECTION_STALE', 'Деякі товари вже відсутні. Оновіть вибірку.');
    return summarizeStickerSelection(products, catalog.directory);
  }

  async resolve(entries) {
    const connection = await this.repository.connection();
    return resolveStickerArticles(entries, (await this.repository.catalog(connection)).products);
  }

  async readRemote(connection, onProgress = null, selectedExternalIds = null, expectedMemberships = null) {
    onProgress?.({ stage: 'authenticating' });
    const credentials = decryptHoroshopCredentials(connection.encryptedCredentials);
    const client = this.clientFactory(connection.storeDomain);
    const token = await client.authenticate(credentials.login, credentials.password);
    onProgress?.({ stage: 'directory' });
    const directory = await client.exportStickers(token);
    const key = `${connection.id}:${connection.generation}`;
    const selected = selectedExternalIds?.size ? selectedExternalIds : null;
    const parentArticles = selected ? await this.repository.parentArticles(connection, selected) : new Map();
    const articleToExternalId = new Map();
    for (const [externalId, article] of parentArticles) {
      if (!article || articleToExternalId.has(article)) { articleToExternalId.clear(); break; }
      articleToExternalId.set(article, externalId);
    }
    let productsRead = 0;
    let pagesRead = 0;
    let fullProbeCandidate = null;
    onProgress?.({ stage: 'catalog', productsRead: 0, pagesRead: 0 });
    const readPages = async (articles = null) => {
      const products = [];
      const fingerprints = new Set();
      const offsets = new Set();
      let offset = 0;
      for (let page = 0; page < 2000; page += 1) {
        if (offsets.has(offset)) throw new AppError(502, 'STICKER_EXPORT_INVALID', 'Хорошоп повторює сторінку каталогу.');
        offsets.add(offset);
        pagesRead += 1;
        const result = await client.exportCatalog(token, offset, horoshopCatalogExportPageSize, articles);
        const fingerprint = createHash('sha256').update(JSON.stringify(result.products)).digest('hex');
        if (result.products.length && fingerprints.has(fingerprint)) throw new AppError(502, 'STICKER_EXPORT_INVALID', 'Хорошоп повторює товари в експорті.');
        fingerprints.add(fingerprint);
        productsRead += result.products.length;
        if (!articles && !fullProbeCandidate) fullProbeCandidate = result.products.find((product) =>
          (product?.modifications ?? product?.variants)?.length > 1) || null;
        products.push(...(articles || !selected ? result.products : result.products.filter((product) => selected.has(String(
          product?.id ?? product?.external_id ?? product?.parent_article ?? product?.article ?? product?.sku
        )))));
        onProgress?.({ stage: 'catalog', productsRead, pagesRead });
        if (result.nextOffset === null) return { products, pages: page + 1 };
        offset = result.nextOffset;
      }
      throw new AppError(502, 'STICKER_EXPORT_LIMIT', 'Каталог перевищує межу безпечного експорту.');
    };
    const completeGroups = (products, expected) => {
      if (products.length !== expected.size) return false;
      const seen = new Set();
      for (const product of products) {
        const externalId = String(product?.id ?? product?.external_id ?? product?.parent_article ?? product?.article ?? product?.sku);
        const article = String(product?.parent_article ?? product?.article ?? product?.sku);
        if (expected.get(article) !== externalId || seen.has(article)
          || !(Array.isArray(product?.modifications) || Array.isArray(product?.variants))) return false;
        const modifications = product.modifications ?? product.variants;
        if (!modifications.length) return false;
        seen.add(article);
      }
      return seen.size === expected.size;
    };
    const capability = this.scopedExportCapability?.key === key
      && this.scopedExportCapability.expiresAt > Date.now() ? this.scopedExportCapability : null;
    let probeAllowed = capability?.supported !== false;
    const articles = [...articleToExternalId.keys()];
    if (selected && parentArticles.size === selected.size && articleToExternalId.size === selected.size
      && capability?.supported && articles.length <= 1000
      && Math.ceil(articles.length / 100) < capability.fullPages) {
      try {
        const products = [];
        for (let start = 0; start < articles.length; start += 100) {
          const batch = articles.slice(start, start + 100);
          const scoped = await readPages(batch);
          const expected = new Map(batch.map((article) => [article, articleToExternalId.get(article)]));
          if (!completeGroups(scoped.products, expected)) throw new AppError(502, 'STICKER_SCOPED_EXPORT_INCOMPLETE', 'Вибірковий експорт повернув неповну групу.');
          products.push(...scoped.products);
        }
        const snapshot = remoteStickerSnapshot(products, directory, connection.storeDomain);
        if (expectedMemberships && [...expectedMemberships].some(([externalId, membership]) => {
          const group = snapshot.groups.get(externalId);
          return !group || group.error || !sameMembership(group.membership, membership);
        })) throw new AppError(502, 'STICKER_SCOPED_EXPORT_INCOMPLETE', 'Вибірковий експорт не підтвердив склад групи.');
        return { client, token, pagesRead, ...snapshot };
      } catch (error) {
        const unsupported = error instanceof HoroshopApiError
          && [200, 400, 404, 422].includes(error.httpStatus);
        const incomplete = error instanceof AppError
          && ['STICKER_SCOPED_EXPORT_INCOMPLETE', 'STICKER_EXPORT_INVALID'].includes(error.code);
        if (!incomplete && !unsupported) throw error;
        this.scopedExportCapability = { key, supported: false, fullPages: capability.fullPages, expiresAt: Date.now() + 600_000 };
        probeAllowed = false;
      }
    }
    const full = await readPages();
    const snapshot = remoteStickerSnapshot(full.products, directory, connection.storeDomain);
    if (selected && full.pages > 1 && articleToExternalId.size === selected.size
      && probeAllowed) {
      const probe = fullProbeCandidate;
      if (probe) {
        const externalId = String(probe.id ?? probe.external_id ?? probe.parent_article ?? probe.article ?? probe.sku);
        const article = String(probe.parent_article ?? probe.article ?? probe.sku);
        try {
          const scoped = await readPages([article]);
          const group = remoteStickerSnapshot(scoped.products, directory, connection.storeDomain).groups.get(externalId);
          const original = remoteStickerSnapshot([probe], directory, connection.storeDomain).groups.get(externalId);
          const supported = completeGroups(scoped.products, new Map([[article, externalId]]))
            && group && original && !group.error && !original.error
            && sameMembership(group.membership, original.membership)
            && sameStickers(group.stickers, original.stickers);
          this.scopedExportCapability = { key, supported: !!supported, fullPages: full.pages, expiresAt: Date.now() + 600_000 };
        } catch {
          this.scopedExportCapability = { key, supported: false, fullPages: full.pages, expiresAt: Date.now() + 600_000 };
        }
      }
    }
    return { client, token, pagesRead, ...snapshot };
  }

  async preview(input, actorId, onProgress = null) {
    const steps = input.steps || [input];
    const ids = [...new Set(steps.flatMap((step) => step.productIds))];
    notEmpty(ids);
    const report = preparationReporter(onProgress, ids.length);
    report({ stage: 'checking' });
    const connection = await this.repository.connection();
    const catalog = await this.repository.catalog(connection);
    const selectedIds = new Set(ids);
    const selected = catalog.products.filter((p) => selectedIds.has(p.id));
    if (selected.length !== ids.length) throw new AppError(409, 'STICKER_SELECTION_STALE', 'Деякі товари вже відсутні. Оновіть вибірку.');
    const groups = await this.repository.cachedGroups(connection, selected);
    const actions = new Map();
    for (const step of steps) {
      const additions = assertManualActions(step.addIds, step.removeIds, catalog.directory);
      for (const id of new Set(step.productIds)) {
        if (!actions.has(id)) actions.set(id, []);
        actions.get(id).push({ additions, removeIds: step.removeIds });
      }
    }
    report({ stage: 'comparing', processed: 0 });
    const items = [];
    for (const p of selected) {
      const current = groups.get(p.externalId);
      const before = current?.stickers || [];
      let after = before;
      for (const action of actions.get(p.id)) after = applyStickerChange(after, action.additions, action.removeIds);
      const beforeKeys = new Set(before.map((sticker) => sticker.id || `title:${sticker.title}`));
      const afterKeys = new Set(after.map((sticker) => sticker.id || `title:${sticker.title}`));
      const addIds = after.filter((sticker) => sticker.id && !beforeKeys.has(sticker.id)).map((sticker) => sticker.id);
      const removeIds = before.filter((sticker) => sticker.id && !afterKeys.has(sticker.id)).map((sticker) => sticker.id);
      const message = !current ? 'Товар відсутній у синхронізованому каталозі. Оновіть каталог.' : current.error;
      items.push({ productId: p.id, externalId: p.externalId, article: current?.article || p.sku,
        title: titleFor(p.titles, p.sku), membership: current?.membership || [], before, after,
        addIds, removeIds, status: message ? 'conflict' : sameStickers(before, after) ? 'unchanged' : 'pending', message });
      if (items.length % 100 === 0 || items.length === selected.length) {
        report({ processed: items.length });
        if (onProgress) await yieldToEventLoop();
      }
    }
    report({ stage: 'saving', processed: 0 });
    const id = await this.repository.createOperation(connection, { name: input.name || 'Зміна стікерів', actorId, items,
      onProgress: (processed) => report({ processed }) });
    return this.detail(id);
  }

  async detail(id, page = 1, pageSize = 50) {
    const connection = await this.repository.connection();
    const operation = await this.repository.operation(id, connection);
    const { items, ...summary } = operation;
    delete summary.actorUserId;
    return { ...summary, counts: countItems(items), total: items.length,
      items: items.slice((page - 1) * pageSize, page * pageSize), page, pageCount: Math.ceil(items.length / pageSize) };
  }

  async history() { return this.repository.history(await this.repository.connection()); }

  async apply(id, actorId) {
    const connection = await this.repository.connection();
    const operation = await this.repository.operation(id, connection);
    if (operation.status !== 'draft') throw new AppError(409, 'STICKER_ALREADY_STARTED', 'Цю операцію вже запущено.');
    if (!operation.items.some((item) => item.status === 'pending')) throw new AppError(422, 'STICKER_NO_CHANGES', 'В операції немає змін для застосування.');
    await this.repository.enqueue(id, connection, actorId);
    return this.detail(id);
  }

  async stop(id, actorId) {
    const connection = await this.repository.connection();
    const result = await this.pool.query(`UPDATE search_horoshop_sticker_operations SET stop_requested = TRUE
      WHERE id = $1 AND connection_id = $2 AND generation = $3 AND status IN ('queued', 'running') RETURNING id`, [id, connection.id, connection.generation]);
    if (!result.rows.length) throw new AppError(409, 'STICKER_NOT_RUNNING', 'Операція вже завершена або ще не запущена.');
    await this.repository.event(connection.id, id, actorId, 'stop_requested');
    return this.detail(id);
  }

  async retry(id, actorId) {
    const connection = await this.repository.connection();
    const operation = await this.repository.operation(id, connection);
    if (!terminal(operation.status)) throw new AppError(409, 'STICKER_NOT_FINISHED', 'Спочатку дочекайтеся завершення операції.');
    const items = operation.items.filter((item) => ['failed', 'cancelled'].includes(item.status)).map((item) => ({ ...item, status: 'pending', message: '' }));
    notEmpty(items);
    const nextId = await this.repository.createOperation(connection, { name: `Повтор: ${operation.name}`.slice(0, 160), kind: 'retry', parentId: id, actorId, items });
    return this.detail(nextId);
  }

  async rollback(id, actorId, onProgress = null) {
    const report = preparationReporter(onProgress);
    report({ stage: 'checking' });
    return this.catalogService.runExclusiveExternalWrite(async () => {
      const connection = await this.repository.connection();
      const original = await this.repository.operation(id, connection);
      if (!terminal(original.status)) throw new AppError(409, 'STICKER_NOT_FINISHED', 'Спочатку дочекайтеся завершення операції.');
      const succeeded = original.items.filter((item) => item.status === 'succeeded');
      notEmpty(succeeded);
      report({ total: succeeded.length });
      const remote = await this.readRemote(connection, report, new Set(succeeded.map((item) => item.externalId)),
        new Map(succeeded.map((item) => [item.externalId, item.membership])));
      report({ stage: 'comparing', processed: 0 });
      const items = [];
      for (const item of succeeded) {
        const addIds = item.before.filter((s) => s.id && !item.after.some((a) => a.id === s.id)).map((s) => s.id);
        const removeIds = item.after.filter((s) => s.id && !item.before.some((a) => a.id === s.id)).map((s) => s.id);
        const current = remote.groups.get(item.externalId);
        const touched = new Set([...addIds, ...removeIds]);
        const before = current?.stickers || [];
        let message = current?.error || (!current ? 'Товар відсутній у Хорошоп.' : '');
        let after = before;
        try {
          const additions = assertManualActions(addIds, removeIds, remote.directory);
          if (!current || !sameMembership(current.membership, item.membership)
            || !sameStickers(before.filter((s) => touched.has(s.id)), item.after.filter((s) => touched.has(s.id)))) {
            message ||= 'Ці стікери або група модифікацій змінилися після операції. Повернення заблоковано.';
          }
          after = applyStickerChange(before, additions, removeIds);
        } catch (error) { message = error instanceof AppError ? error.message : 'Не вдалося підготувати повернення.'; }
        items.push({ ...item, before, after, addIds, removeIds, status: message ? 'conflict' : 'pending', message });
        if (items.length % 100 === 0 || items.length === succeeded.length) {
          report({ processed: items.length });
          if (onProgress) await yieldToEventLoop();
        }
      }
      notEmpty(items);
      report({ stage: 'saving', processed: 0 });
      const nextId = await this.repository.createOperation(connection, { name: `Повернення: ${original.name}`.slice(0, 160), kind: 'rollback', parentId: id, actorId, items,
        onProgress: (processed) => report({ processed }) });
      return this.detail(nextId);
    });
  }

  async selections() {
    const connection = await this.repository.connection();
    const result = await this.pool.query(`SELECT id, name, product_ids FROM search_horoshop_sticker_selections
      WHERE connection_id = $1 AND generation = $2 ORDER BY created_at DESC`, [connection.id, connection.generation]);
    return result.rows.map((row) => ({ id: row.id, name: row.name, productIds: arrayValue(row.product_ids) }));
  }

  async saveSelection({ name, productIds }, actorId) {
    const connection = await this.repository.connection();
    const catalog = await this.repository.catalog(connection);
    const ids = [...new Set(productIds)];
    notEmpty(ids);
    const activeIds = new Set(catalog.products.map((p) => p.id));
    if (ids.some((id) => !activeIds.has(id))) throw new AppError(409, 'STICKER_SELECTION_STALE', 'Оновіть вибірку: деякі товари вже відсутні.');
    await this.repository.transaction(async (db) => {
      await this.repository.assertConnection(db, connection);
      await db.query(`INSERT INTO search_horoshop_sticker_selections (connection_id, generation, name, product_ids, created_by)
        VALUES ($1, $2, $3, $4::jsonb, $5)`, [connection.id, connection.generation, name, JSON.stringify(ids), actorId]);
      await this.repository.event(connection.id, null, actorId, 'selection_saved', { name, count: ids.length }, db);
    });
    return this.selections();
  }

  async removeSelection(id, actorId) {
    const connection = await this.repository.connection();
    await this.pool.query('DELETE FROM search_horoshop_sticker_selections WHERE id = $1 AND connection_id = $2 AND generation = $3', [id, connection.id, connection.generation]);
    await this.repository.event(connection.id, null, actorId, 'selection_removed', { id });
    return { removed: true };
  }

  async runNext() {
    if (this.running) return;
    const pending = await this.pool.query(`SELECT id FROM search_horoshop_sticker_operations WHERE status IN ('queued', 'running') ORDER BY created_at LIMIT 1`);
    if (!pending.rows.length) return;
    this.running = true;
    try {
      await this.catalogService.runExclusiveExternalWrite(async () => {
        const lock = await this.pool.connect();
        try {
          // Session lock survives individual transactions and is released by PostgreSQL on crash.
          await lock.query('SELECT pg_advisory_lock($1)', [lockId]);
          const connection = await this.repository.connection();
          const next = await this.pool.query(`SELECT id FROM search_horoshop_sticker_operations
            WHERE connection_id = $1 AND generation = $2 AND status IN ('queued', 'running') ORDER BY created_at LIMIT 1`, [connection.id, connection.generation]);
          if (!next.rows.length) return;
          const id = next.rows[0].id;
          await this.pool.query(`UPDATE search_horoshop_sticker_operations SET status = 'running', started_at = COALESCE(started_at, NOW()) WHERE id = $1`, [id]);
          await this.processOperation(id, connection);
        } finally { await lock.query('SELECT pg_advisory_unlock($1)', [lockId]).catch(() => {}); lock.release(); }
      });
    } catch (error) {
      if (!['HOROSHOP_CATALOG_BUSY', 'HOROSHOP_CONNECTION_NOT_READY', 'HOROSHOP_NOT_CONNECTED'].includes(error?.code)) throw error;
    } finally { this.running = false; }
  }

  async processOperation(id, connection) {
    const operation = await this.repository.operation(id, connection);
    const apiOperations = { catalogExports: 0, stickerExports: 0, authentications: 0, imports: 0 };
    try {
      const selectedExternalIds = new Set(operation.items.filter((item) => ['pending', 'writing'].includes(item.status)).map((item) => item.externalId));
      const expected = new Map(operation.items.filter((item) => selectedExternalIds.has(item.externalId))
        .map((item) => [item.externalId, item.membership]));
      const remote = await this.readRemote(connection, null, selectedExternalIds, expected);
      apiOperations.catalogExports += remote.pagesRead;
      apiOperations.stickerExports += 1;
      apiOperations.authentications += 1;
      const writing = [];
      const ready = [];
      for (const item of operation.items.filter((item) => ['pending', 'writing'].includes(item.status))) {
        const current = remote.groups.get(item.externalId);
        try {
          assertManualActions(item.addIds, item.removeIds, remote.directory);
          const recoveringPartial = (item.status === 'writing' || operation.kind === 'retry') && current?.inconsistent
            && current.stickerSets.every((set) => sameStickers(set, item.before) || sameStickers(set, item.after));
          const articleInGroup = current?.membership.length ? current.membership.includes(item.article) : current?.article === item.article;
          if (!current || (current.error && !recoveringPartial) || !articleInGroup || !sameMembership(current.membership, item.membership)) {
            throw new AppError(409, 'STICKER_GROUP_CHANGED', current?.error || 'Товар або склад модифікацій змінився. Створіть новий перегляд змін.');
          }
          if ((item.status === 'writing' || operation.kind === 'retry') && !current.error && sameStickers(current.stickers, item.after)) {
            await this.repository.setItem(item.id, 'succeeded', 'Результат підтверджено після повторної перевірки.');
            await this.repository.cacheStickers(connection, item);
          } else if (!recoveringPartial && !sameStickers(current.stickers, item.before)) {
            throw new AppError(409, 'STICKER_PRODUCT_CHANGED', 'Стікери змінилися після перегляду. Створіть новий перегляд змін.');
          } else ready.push(item);
        } catch (error) { await this.repository.setItem(item.id, 'conflict', error instanceof AppError ? error.message : 'Не вдалося перевірити товар.'); }
      }
      for (let offset = 0; offset < ready.length; offset += this.batchSize) {
        const state = await this.pool.query('SELECT stop_requested FROM search_horoshop_sticker_operations WHERE id = $1', [id]);
        if (state.rows[0]?.stop_requested) break;
        const activeConnection = await this.repository.connection();
        if (activeConnection.generation !== connection.generation) throw new AppError(409, 'STICKER_CATALOG_STALE', 'Підключення змінилося.');
        const payloads = [];
        for (const item of ready.slice(offset, offset + this.batchSize)) {
          try {
            assertManualActions(item.addIds, item.removeIds, remote.directory);
            await this.repository.setItem(item.id, 'writing');
            writing.push(item);
            const icons = item.after.map((s) => remote.directory.find((d) => d.externalId === s.id)?.title || s.title);
            // catalog/import targets an article. Explicitly update every exported offer;
            // do not assume Horoshop propagates the field to the rest of the group.
            for (const article of item.membership.length ? item.membership : [item.article]) payloads.push({ article, icons });
          } catch (error) { await this.repository.setItem(item.id, 'conflict', error instanceof AppError ? error.message : 'Не вдалося перевірити ручні стікери.'); }
        }
        for (let index = 0; index < payloads.length; index += this.batchSize) {
          const latestConnection = await this.repository.connection();
          if (latestConnection.generation !== connection.generation) throw new AppError(409, 'STICKER_CATALOG_STALE', 'Підключення змінилося.');
          try { apiOperations.imports += 1; await remote.client.importCatalog(remote.token, payloads.slice(index, index + this.batchSize), { maxAttempts: 1 }); }
          catch { /* A transport error can follow a successful write. Only read-back decides the result. */ }
        }
      }
      if (writing.length) {
        const verified = await this.readRemote(connection, null, new Set(writing.map((item) => item.externalId)),
          new Map(writing.map((item) => [item.externalId, item.membership])));
        apiOperations.catalogExports += verified.pagesRead;
        apiOperations.stickerExports += 1;
        apiOperations.authentications += 1;
        for (const item of writing) {
          const current = verified.groups.get(item.externalId);
          if (current && !current.error && sameMembership(current.membership, item.membership) && sameStickers(current.stickers, item.after)) {
            await this.repository.cacheStickers(connection, item);
            await this.repository.setItem(item.id, 'succeeded');
          } else await this.repository.setItem(item.id, 'failed', 'Хорошоп не підтвердив очікувані стікери. Повторення спочатку перевірить фактичний стан.');
        }
      }
    } catch {
      await this.pool.query(`UPDATE search_horoshop_sticker_operation_items SET status = 'failed', message = $2, updated_at = NOW()
        WHERE operation_id = $1 AND status IN ('pending', 'writing')`, [id, 'Не вдалося підтвердити результат через API Хорошоп. Перевірте підключення та повторіть невдалі позиції.']);
    }
    await this.pool.query(`UPDATE search_horoshop_sticker_operation_items SET status = 'cancelled', message = 'Зупинено до відправлення.'
      WHERE operation_id = $1 AND status = 'pending'`, [id]);
    const final = await this.repository.operation(id, connection);
    const counts = countItems(final.items);
    const status = final.stopRequested ? 'stopped' : counts.failed || counts.conflict ? 'partial' : 'completed';
    await this.pool.query('UPDATE search_horoshop_sticker_operations SET status = $2, completed_at = NOW() WHERE id = $1', [id, status]);
    await this.repository.event(connection.id, id, operation.actorUserId || null, 'operation_finished', { status, counts, apiOperations });
  }

  async report(id) {
    const operation = await this.repository.operation(id, await this.repository.connection());
    const cell = (value) => {
      let text = String(value ?? '');
      if (/^[\s]*[=+@-]/u.test(text)) text = `'${text}`;
      return `"${text.replaceAll('"', '""')}"`;
    };
    return '\ufeff' + [['Артикул', 'Товар', 'Було', 'Стало', 'Статус', 'Повідомлення'],
      ...operation.items.map((item) => [item.article, item.title, item.before.map((s) => s.title).join('; '), item.after.map((s) => s.title).join('; '), item.status, item.message])]
      .map((row) => row.map(cell).join(',')).join('\r\n');
  }
}

export const horoshopStickerService = new HoroshopStickerService();

export function startHoroshopStickerWorker(service = horoshopStickerService) {
  let current = null;
  const tick = () => {
    if (current) return;
    current = service.runNext().catch(() => {
      console.error(JSON.stringify({ event: 'horoshop_sticker_worker_failed', message: 'Sticker worker will retry pending operations.' }));
    }).finally(() => { current = null; });
  };
  const timer = setInterval(tick, 2_000);
  timer.unref();
  tick();
  return async () => { clearInterval(timer); await current; };
}
