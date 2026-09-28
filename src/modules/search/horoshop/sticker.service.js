import { createHash } from 'node:crypto';
import { AppError } from '../../../lib/app-error.js';
import { horoshopCatalogService } from './catalog.service.js';
import { decryptHoroshopCredentials } from './credential-cipher.js';
import { HoroshopClient } from './horoshop.client.js';
import { normalizeHoroshopStickers } from './catalog.normalizer.js';
import { HoroshopStickerRepository, arrayValue, countItems } from './sticker.repository.js';
import { applyStickerChange, assertManualActions, filterStickerProducts, maximumStickerSelection,
  remoteStickerSnapshot, resolveStickerArticles, sameMembership, sameStickers, summarizeStickerSelection, titleFor } from './sticker.domain.js';

const lockId = 72914213;
const notEmpty = (ids) => {
  if (!ids.length || ids.length > maximumStickerSelection) throw new AppError(422, 'STICKER_SELECTION_INVALID', `Оберіть від 1 до ${maximumStickerSelection} товарів.`);
};
const terminal = (status) => ['completed', 'partial', 'stopped'].includes(status);

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
  }

  async catalog(filters, actor) {
    const connection = await this.repository.connection();
    let directoryWarning = null;
    try { await this.ensureDirectory(connection); }
    catch (error) { directoryWarning = error instanceof AppError ? error.message : 'Не вдалося отримати довідник стікерів із Хорошоп. Натисніть «Оновити», щоб повторити.'; }
    const catalog = await this.repository.catalog(connection);
    const products = filterStickerProducts(catalog.products, catalog.categories, filters, catalog.manualIds);
    const page = filters.page || 1;
    const pageSize = filters.pageSize || 25;
    return { items: products.slice((page - 1) * pageSize, page * pageSize), total: products.length, page, pageSize,
      pageCount: Math.ceil(products.length / pageSize), storeDomain: connection.storeDomain, lastSyncAt: connection.lastSyncAt,
      categories: catalog.categories, directory: catalog.directory.map((item) => ({ ...item, manual: catalog.manualIds.includes(item.externalId) })),
      brands: [...new Set(catalog.products.map((p) => p.brand).filter(Boolean))].sort(),
      availabilityOptions: [...new Set(catalog.products.flatMap((p) => [p.availability, ...p.modifications.map((m) => m.availability)]).filter(Boolean))].sort(),
      canConfigure: actor.role === 'admin', directoryWarning };
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
    const products = filterStickerProducts(catalog.products, catalog.categories, filters, catalog.manualIds);
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
    return summarizeStickerSelection(products, catalog.directory, catalog.manualIds);
  }

  async resolve(entries) {
    const connection = await this.repository.connection();
    return resolveStickerArticles(entries, (await this.repository.catalog(connection)).products);
  }

  async configureManual(ids, actorId) {
    const connection = await this.repository.connection();
    const catalog = await this.repository.catalog(connection);
    if (ids.some((id) => !catalog.directory.some((item) => item.externalId === id))) throw new AppError(422, 'STICKER_UNKNOWN', 'Оновіть каталог: один зі стікерів не знайдено.');
    await this.repository.configureManual(connection, [...new Set(ids)], actorId);
    return { saved: true };
  }

  async readRemote(connection) {
    const credentials = decryptHoroshopCredentials(connection.encryptedCredentials);
    const client = this.clientFactory(connection.storeDomain);
    const token = await client.authenticate(credentials.login, credentials.password);
    const directory = await client.exportStickers(token);
    const products = [];
    const fingerprints = new Set();
    const offsets = new Set();
    let offset = 0;
    for (let page = 0; page < 2000; page += 1) {
      if (offsets.has(offset)) throw new AppError(502, 'STICKER_EXPORT_INVALID', 'Хорошоп повторює сторінку каталогу.');
      offsets.add(offset);
      const result = await client.exportCatalog(token, offset, 200);
      const fingerprint = createHash('sha256').update(JSON.stringify(result.products)).digest('hex');
      if (result.products.length && fingerprints.has(fingerprint)) throw new AppError(502, 'STICKER_EXPORT_INVALID', 'Хорошоп повторює товари в експорті.');
      fingerprints.add(fingerprint);
      products.push(...result.products);
      if (result.nextOffset === null) return { client, token, ...remoteStickerSnapshot(products, directory, connection.storeDomain) };
      offset = result.nextOffset;
    }
    throw new AppError(502, 'STICKER_EXPORT_LIMIT', 'Каталог перевищує межу безпечного експорту.');
  }

  async preview({ productIds, addIds, removeIds, name }, actorId) {
    return this.catalogService.runExclusiveExternalWrite(async () => {
      const connection = await this.repository.connection();
      const catalog = await this.repository.catalog(connection);
      const ids = [...new Set(productIds)];
      notEmpty(ids);
      const selectedIds = new Set(ids);
      const selected = catalog.products.filter((p) => selectedIds.has(p.id));
      if (selected.length !== ids.length) throw new AppError(409, 'STICKER_SELECTION_STALE', 'Деякі товари вже відсутні. Оновіть вибірку.');
      const remote = await this.readRemote(connection);
      const additions = assertManualActions(addIds, removeIds, remote.directory, catalog.manualIds);
      const items = selected.map((p) => {
        const current = remote.groups.get(p.externalId);
        const before = current?.stickers || [];
        const after = applyStickerChange(before, additions, removeIds);
        const message = !current ? 'Товар відсутній в актуальному каталозі Хорошоп.' : current.error;
        return { productId: p.id, externalId: p.externalId, article: current?.article || p.sku,
          title: titleFor(p.titles, p.sku), membership: current?.membership || [], before, after,
          addIds, removeIds, status: message ? 'conflict' : sameStickers(before, after) ? 'unchanged' : 'pending', message };
      });
      const id = await this.repository.createOperation(connection, { name: name || 'Зміна стікерів', actorId, items });
      return this.detail(id);
    });
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

  async rollback(id, actorId) {
    return this.catalogService.runExclusiveExternalWrite(async () => {
      const connection = await this.repository.connection();
      const original = await this.repository.operation(id, connection);
      if (!terminal(original.status)) throw new AppError(409, 'STICKER_NOT_FINISHED', 'Спочатку дочекайтеся завершення операції.');
      const remote = await this.readRemote(connection);
      const catalog = await this.repository.catalog(connection);
      const items = original.items.filter((item) => item.status === 'succeeded').map((item) => {
        const addIds = item.before.filter((s) => s.id && !item.after.some((a) => a.id === s.id)).map((s) => s.id);
        const removeIds = item.after.filter((s) => s.id && !item.before.some((a) => a.id === s.id)).map((s) => s.id);
        const current = remote.groups.get(item.externalId);
        const touched = new Set([...addIds, ...removeIds]);
        const before = current?.stickers || [];
        let message = current?.error || (!current ? 'Товар відсутній у Хорошоп.' : '');
        let after = before;
        try {
          const additions = assertManualActions(addIds, removeIds, remote.directory, catalog.manualIds);
          if (!current || !sameMembership(current.membership, item.membership)
            || !sameStickers(before.filter((s) => touched.has(s.id)), item.after.filter((s) => touched.has(s.id)))) {
            message ||= 'Ці стікери або група модифікацій змінилися після операції. Повернення заблоковано.';
          }
          after = applyStickerChange(before, additions, removeIds);
        } catch (error) { message = error instanceof AppError ? error.message : 'Не вдалося підготувати повернення.'; }
        return { ...item, before, after, addIds, removeIds, status: message ? 'conflict' : 'pending', message };
      });
      notEmpty(items);
      const nextId = await this.repository.createOperation(connection, { name: `Повернення: ${original.name}`.slice(0, 160), kind: 'rollback', parentId: id, actorId, items });
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
    try {
      const remote = await this.readRemote(connection);
      const catalog = await this.repository.catalog(connection);
      const writing = [];
      const ready = [];
      for (const item of operation.items.filter((item) => ['pending', 'writing'].includes(item.status))) {
        const current = remote.groups.get(item.externalId);
        try {
          assertManualActions(item.addIds, item.removeIds, remote.directory, catalog.manualIds);
          const recoveringPartial = (item.status === 'writing' || operation.kind === 'retry') && current?.inconsistent
            && current.stickerSets.every((set) => sameStickers(set, item.before) || sameStickers(set, item.after));
          if (!current || (current.error && !recoveringPartial) || current.article !== item.article || !sameMembership(current.membership, item.membership)) {
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
        const manual = await this.pool.query('SELECT external_id FROM search_horoshop_manual_stickers WHERE connection_id = $1', [connection.id]);
        const payloads = [];
        for (const item of ready.slice(offset, offset + this.batchSize)) {
          try {
            assertManualActions(item.addIds, item.removeIds, remote.directory, manual.rows.map((row) => row.external_id));
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
          try { await remote.client.importCatalog(remote.token, payloads.slice(index, index + this.batchSize), { maxAttempts: 1 }); }
          catch { /* A transport error can follow a successful write. Only read-back decides the result. */ }
        }
      }
      if (writing.length) {
        const verified = await this.readRemote(connection);
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
    await this.repository.event(connection.id, id, operation.actorUserId || null, 'operation_finished', { status, counts });
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
