import { createHash } from 'node:crypto';
import { AppError } from '../../../lib/app-error.js';
import { decryptHoroshopCredentials } from './credential-cipher.js';
import { horoshopCatalogService } from './catalog.service.js';
import { HoroshopClient, horoshopCatalogExportPageSize } from './horoshop.client.js';
import { HoroshopPopularityRepository } from './popularity.repository.js';
import {
  maximumPopularitySelection, popularityNumber, remotePopularityGroups,
  resolvePopularityEntries, sameArticles, targetPopularity
} from './popularity.domain.js';

const externalWriteLockId = 72914213;
const maximumExportPages = 250;
const importProductBatchSize = 20;

export class HoroshopPopularityService {
  constructor(options = {}) {
    this.repository = options.repository || new HoroshopPopularityRepository();
    this.catalogService = options.catalogService || horoshopCatalogService;
    this.clientFactory = options.clientFactory || ((domain) => new HoroshopClient(domain));
    this.running = false;
  }

  async catalog(filters, page, pageSize) {
    const integration = await this.catalogService.status();
    if (!integration.configured || integration.status !== 'connected') {
      return { integration, items: [], categories: [], brands: [], availabilityOptions: [],
        total: 0, page, pageSize, pageCount: 0 };
    }
    const connection = await this.repository.connection();
    return { integration, ...await this.repository.catalog(connection, filters, page, pageSize) };
  }

  async resolve(entries) {
    const connection = await this.repository.connection();
    const products = await this.repository.allProductsForResolve(connection);
    return resolvePopularityEntries(entries, products);
  }

  async sync(actorId) {
    const started = await this.catalogService.startSync('manual', actorId);
    return { started, integration: await this.catalogService.status() };
  }

  async preview(selection, action, value, actorId) {
    const connection = await this.repository.connection();
    let ids;
    if (selection.productIds) {
      ids = [...new Set(selection.productIds)];
    } else {
      ids = await this.repository.selectedIds(connection, selection.filters);
    }
    if (!ids.length) throw new AppError(422, 'HOROSHOP_POPULARITY_EMPTY', 'У вибірці немає товарів.');
    if (ids.length > maximumPopularitySelection) {
      throw new AppError(422, 'HOROSHOP_POPULARITY_SELECTION_LIMIT', `За один раз можна змінити не більш ніж ${maximumPopularitySelection} товарів.`);
    }
    const products = await this.repository.productsByIds(connection, ids);
    if (products.length !== ids.length) {
      throw new AppError(409, 'HOROSHOP_POPULARITY_SELECTION_STALE', 'Деякі товари зникли з каталогу. Оновіть вибірку.');
    }
    const seenArticles = new Set();
    const items = products.map((product) => {
      const before = popularityNumber(product.popularity);
      if (before === null) {
        throw new AppError(409, 'HOROSHOP_POPULARITY_INVALID', `Товар «${product.title}» має некоректне значення популярності. Оновіть каталог.`);
      }
      const articles = [...new Set((product.modifications.length
        ? product.modifications.map((modification) => modification.sku)
        : [product.sku]).filter(Boolean))].sort();
      if (!product.sku || !articles.length || articles.some((article) => seenArticles.has(article))) {
        throw new AppError(409, 'HOROSHOP_POPULARITY_ARTICLES', 'Артикули товарів перетинаються або відсутні. Оновіть каталог.');
      }
      articles.forEach((article) => seenArticles.add(article));
      return {
        productId: product.id, externalId: product.externalId, article: product.sku,
        title: product.title, articles, before, target: targetPopularity(before, action, value)
      };
    });
    return this.repository.createDraft(connection, actorId, action, value, items);
  }

  async apply(id) {
    const connection = await this.repository.connection();
    await this.repository.queue(id, connection);
    void this.runNext().catch(() => {
      console.error(JSON.stringify({ event: 'horoshop_popularity_worker_failed', message: 'Operation will retry from the queue.' }));
    });
    return this.repository.operation(id, connection);
  }

  async operation(id) {
    return this.repository.operation(id, await this.repository.connection());
  }

  async history() {
    return this.repository.history(await this.repository.connection());
  }

  async readRemote(client, token) {
    const products = [];
    const offsets = new Set();
    const fingerprints = new Set();
    let offset = 0;
    for (let page = 0; page < maximumExportPages; page += 1) {
      if (offsets.has(offset)) throw new AppError(502, 'HOROSHOP_POPULARITY_EXPORT_INVALID', 'Хорошоп повторює сторінку каталогу.');
      offsets.add(offset);
      const result = await client.exportCatalog(token, offset, horoshopCatalogExportPageSize);
      const fingerprint = createHash('sha256').update(JSON.stringify(result.products)).digest('hex');
      if (result.products.length && fingerprints.has(fingerprint)) {
        throw new AppError(502, 'HOROSHOP_POPULARITY_EXPORT_INVALID', 'Хорошоп повторює товари в експорті.');
      }
      fingerprints.add(fingerprint);
      products.push(...result.products);
      if (result.nextOffset === null) return remotePopularityGroups(products);
      offset = result.nextOffset;
    }
    throw new AppError(502, 'HOROSHOP_POPULARITY_EXPORT_LIMIT', 'Каталог перевищує межу безпечного експорту.');
  }

  async processOperation(id, connection) {
    const operation = await this.repository.operation(id, connection);
    try {
      const credentials = decryptHoroshopCredentials(connection.encryptedCredentials);
      const client = this.clientFactory(connection.storeDomain);
      const token = await client.authenticate(credentials.login, credentials.password);
      const remote = await this.readRemote(client, token);
      const ready = [];
      let conflict = false;
      for (const item of operation.items.filter((entry) => ['pending', 'writing'].includes(entry.status))) {
        const current = remote.get(item.article);
        if (!current || current.inconsistent || current.popularity === null
          || !sameArticles(current.articles, item.articles)) {
          conflict = true;
          await this.repository.setItem(item.id, 'conflict', 'Товар або його модифікації змінилися в Хорошопі. Створіть новий перегляд змін.', current?.popularity ?? null);
        } else if (item.status === 'writing' && current.popularity === item.target) {
          await this.repository.setItem(item.id, 'succeeded', 'Результат підтверджено після повторної перевірки.', item.target);
          await this.repository.cachePopularity(connection, item);
        } else if (current.popularity !== item.before) {
          conflict = true;
          await this.repository.setItem(item.id, 'conflict', 'Популярність змінилася після перегляду. Створіть новий перегляд змін.', current.popularity);
          await this.repository.cachePopularity(connection, { ...item, target: current.popularity });
        } else if (item.before === item.target) {
          await this.repository.setItem(item.id, 'unchanged', 'Значення вже встановлено.', item.before);
        } else ready.push(item);
      }
      if (conflict) {
        for (const item of ready) await this.repository.setItem(item.id, 'cancelled', 'Запис не розпочато через конфлікт у вибірці.');
        const latest = await this.repository.operation(id, connection);
        await this.repository.finish(id, latest.counts.succeeded ? 'partial' : 'conflict');
        return;
      }
      for (let offset = 0; offset < ready.length; offset += importProductBatchSize) {
        const currentConnection = await this.repository.connection();
        if (currentConnection.generation !== connection.generation) {
          throw new AppError(409, 'HOROSHOP_POPULARITY_CONNECTION_CHANGED', 'Підключення до Хорошопа змінилося.');
        }
        const batch = ready.slice(offset, offset + importProductBatchSize);
        for (const item of batch) await this.repository.setItem(item.id, 'writing');
        const payload = batch.flatMap((item) => item.articles.map((article) => ({ article, popularity: item.target })));
        try {
          await client.importCatalog(token, payload, { maxAttempts: 1 });
        } catch {
          // A timeout can follow a successful import. Read-back determines each result.
        }
      }
      if (ready.length) {
        const verified = await this.readRemote(client, token);
        for (const item of ready) {
          const current = verified.get(item.article);
          if (current && !current.inconsistent && sameArticles(current.articles, item.articles)
            && current.popularity === item.target) {
            await this.repository.setItem(item.id, 'succeeded', '', item.target);
            await this.repository.cachePopularity(connection, item);
          } else {
            await this.repository.setItem(item.id, 'failed', 'Хорошоп не підтвердив задане значення. Перевірте товар перед повторною спробою.', current?.popularity ?? null);
          }
        }
      }
      const latest = await this.repository.operation(id, connection);
      await this.repository.finish(id, latest.counts.failed || latest.counts.conflict ? 'partial' : 'completed');
    } catch {
      await this.repository.pool.query(`UPDATE search_horoshop_popularity_operation_items
        SET status = 'failed', message = 'Не вдалося підтвердити результат через API Хорошоп. Перевірте товар перед повторною спробою.', updated_at = NOW()
        WHERE operation_id = $1 AND status IN ('pending', 'writing')`, [id]);
      await this.repository.finish(id, 'failed', 'Не вдалося завершити операцію через API Хорошоп.');
    }
  }

  async runNext() {
    if (this.running) return;
    const pending = await this.repository.pool.query(`SELECT id FROM search_horoshop_popularity_operations
      WHERE status IN ('queued', 'running') ORDER BY created_at LIMIT 1`);
    if (!pending.rows.length) return;
    this.running = true;
    try {
      await this.catalogService.runExclusiveExternalWrite(async () => {
        const lock = await this.repository.pool.connect();
        try {
          await lock.query('SELECT pg_advisory_lock($1)', [externalWriteLockId]);
          const connection = await this.repository.connection();
          const next = await this.repository.pool.query(`SELECT id FROM search_horoshop_popularity_operations
            WHERE connection_id = $1 AND generation = $2 AND status IN ('queued', 'running')
            ORDER BY created_at LIMIT 1`, [connection.id, connection.generation]);
          if (!next.rows[0]) return;
          const id = next.rows[0].id;
          await this.repository.pool.query(`UPDATE search_horoshop_popularity_operations
            SET status = 'running', started_at = COALESCE(started_at, NOW()) WHERE id = $1`, [id]);
          await this.processOperation(id, connection);
        } finally {
          await lock.query('SELECT pg_advisory_unlock($1)', [externalWriteLockId]).catch(() => {});
          lock.release();
        }
      });
    } catch (error) {
      if (!['HOROSHOP_CATALOG_BUSY', 'HOROSHOP_CONNECTION_NOT_READY', 'HOROSHOP_NOT_CONNECTED'].includes(error?.code)) throw error;
    } finally { this.running = false; }
  }
}

export const horoshopPopularityService = new HoroshopPopularityService();

export function startHoroshopPopularityWorker(service = horoshopPopularityService) {
  let current = null;
  const tick = () => {
    if (current) return;
    current = service.runNext().catch(() => {
      console.error(JSON.stringify({ event: 'horoshop_popularity_worker_failed', message: 'Worker will retry queued operations.' }));
    }).finally(() => { current = null; });
  };
  const timer = setInterval(tick, 2_000);
  timer.unref();
  tick();
  return async () => { clearInterval(timer); await current; };
}
