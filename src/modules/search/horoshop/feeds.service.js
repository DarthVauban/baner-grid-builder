import { createHash } from 'node:crypto';
import { AppError } from '../../../lib/app-error.js';
import { decryptHoroshopCredentials } from './credential-cipher.js';
import { horoshopCatalogService } from './catalog.service.js';
import { HoroshopClient, horoshopCatalogExportPageSize } from './horoshop.client.js';
import { resolveCatalogEntries } from './catalog-selection.domain.js';
import { HoroshopFeedRepository } from './feeds.repository.js';
import { maximumFeedSelection, remoteFeedGroups, sameFeedSnapshot, matchesKnownFeedSnapshot, targetMarketplaces } from './feeds.domain.js';

const externalWriteLockId = 72914213;

function sameMembership(current, articles) {
  return current && !current.invalid && current.offers.length === articles.length
    && current.offers.every((offer) => articles.includes(offer.article));
}

export class HoroshopFeedService {
  constructor(options = {}) {
    this.repository = options.repository || new HoroshopFeedRepository();
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
    return { integration, ...await this.repository.catalog(await this.repository.connection(), filters, page, pageSize) };
  }

  async catalogSelection(productIds, filters, page, pageSize) {
    const integration = await this.catalogService.status();
    if (!integration.configured || integration.status !== 'connected') {
      return { integration, items: [], categories: [], brands: [], availabilityOptions: [],
        matchingProductIds: [], total: 0, page, pageSize, pageCount: 0 };
    }
    return { integration, ...await this.repository.catalogSelection(await this.repository.connection(), productIds, filters, page, pageSize) };
  }

  async resolve(entries) {
    return resolveCatalogEntries(entries, await this.repository.allProductsForResolve(await this.repository.connection()));
  }

  async select(filters, productIds = null) {
    return { productIds: await this.repository.selectedIds(await this.repository.connection(), filters, productIds) };
  }

  async sync(actorId) {
    const started = await this.catalogService.startSync('manual', actorId);
    return { started, integration: await this.catalogService.status() };
  }

  async readRemote(client, token) {
    const products = [];
    const offsets = new Set();
    const fingerprints = new Set();
    let offset = 0;
    for (let page = 0; page < 250; page += 1) {
      if (offsets.has(offset)) throw new AppError(502, 'HOROSHOP_FEEDS_EXPORT_INVALID', 'Хорошоп повторює сторінку каталогу.');
      offsets.add(offset);
      const result = await client.exportCatalog(token, offset, horoshopCatalogExportPageSize, null,
        { includedParams: ['export_to_marketplace'] });
      const fingerprint = createHash('sha256').update(JSON.stringify(result.products)).digest('hex');
      if (result.products.length && fingerprints.has(fingerprint)) {
        throw new AppError(502, 'HOROSHOP_FEEDS_EXPORT_INVALID', 'Хорошоп повторює товари в експорті.');
      }
      fingerprints.add(fingerprint);
      products.push(...result.products);
      if (result.nextOffset === null) return remoteFeedGroups(products);
      offset = result.nextOffset;
    }
    throw new AppError(502, 'HOROSHOP_FEEDS_EXPORT_LIMIT', 'Каталог перевищує межу безпечного експорту.');
  }

  async preview(selection, action, actorId) {
    const connection = await this.repository.connection();
    const ids = selection.productIds ? [...new Set(selection.productIds)]
      : await this.repository.selectedIds(connection, selection.filters);
    if (!ids.length || ids.length > maximumFeedSelection) {
      throw new AppError(422, 'HOROSHOP_FEEDS_SELECTION', `Виберіть від 1 до ${maximumFeedSelection} товарів.`);
    }
    const products = await this.repository.productsByIds(connection, ids);
    if (products.length !== ids.length) throw new AppError(409, 'HOROSHOP_FEEDS_SELECTION_STALE', 'Деякі товари зникли з каталогу. Оновіть вибірку.');
    const seen = new Set();
    const parents = new Set();
    const items = products.map((product) => {
      const articles = (product.modifications.length ? product.modifications.map((offer) => offer.sku) : [product.sku]).sort();
      if (!product.sku || parents.has(product.sku) || !articles.length || new Set(articles).size !== articles.length
        || articles.some((article) => !article || seen.has(article))) {
        throw new AppError(409, 'HOROSHOP_FEEDS_ARTICLES', `Артикули товару «${product.title}» відсутні або перетинаються. Оновіть каталог.`);
      }
      parents.add(product.sku);
      articles.forEach((article) => seen.add(article));
      const before = product.modifications.length ? product.modifications.map((offer) => ({
        article: offer.sku, marketplaces: offer.marketplaces
      })) : [{ article: product.sku, marketplaces: product.marketplaces }];
      return { productId: product.id, externalId: product.externalId, article: product.sku,
        title: product.title, articles, before,
        target: before.map((offer) => ({ article: offer.article, marketplaces: targetMarketplaces(offer.marketplaces, action) })) };
    });
    if ((await this.repository.connection()).generation !== connection.generation) {
      throw new AppError(409, 'HOROSHOP_FEEDS_CONNECTION_CHANGED', 'Підключення до Хорошопа змінилося.');
    }
    return this.repository.createDraft(connection, actorId, action, items);
  }

  async apply(id) {
    const connection = await this.repository.connection();
    await this.repository.queue(id, connection);
    void this.runNext().catch(() => {
      console.error(JSON.stringify({ event: 'horoshop_feeds_worker_failed', message: 'Operation will retry from the queue.' }));
    });
    return this.repository.operation(id, connection);
  }

  async operation(id) { return this.repository.operation(id, await this.repository.connection({ readOnly: true })); }
  async history() { return this.repository.history(await this.repository.connection({ readOnly: true })); }

  async processOperation(id, connection) {
    const operation = await this.repository.operation(id, connection);
    try {
      const credentials = decryptHoroshopCredentials(connection.encryptedCredentials);
      const client = this.clientFactory(connection.storeDomain);
      const token = await client.authenticate(credentials.login, credentials.password);
      const remote = await this.readRemote(client, token);
      const ready = [];
      let conflict = false;
      let unavailable = false;
      for (const original of operation.items.filter((entry) => ['pending', 'writing'].includes(entry.status))) {
        let item = { ...original, before: original.resolvedBefore || original.before,
          target: original.resolvedTarget || original.target };
        const current = remote.get(item.article);
        if (current?.offers.some((offer) => offer.marketplaces === null)) {
          unavailable = true;
          await this.repository.setItem(item.id, 'failed', 'Хорошоп не повернув поточні налаштування фідів. Запис не розпочато, інші майданчики не змінено.');
        } else if (!sameMembership(current, item.articles)) {
          conflict = true;
          await this.repository.setItem(item.id, 'conflict', 'Товар, модифікації або доступність даних фідів змінилися. Створіть новий перегляд.');
        } else if (item.status === 'writing' && sameFeedSnapshot(current.offers, item.target)) {
          await this.repository.setItem(item.id, 'succeeded', 'Результат підтверджено після повторної перевірки.', current.offers);
          await this.repository.cacheFeeds(connection, item);
        } else if (item.status === 'writing' && !sameFeedSnapshot(current.offers, item.before)) {
          // An interrupted batch may contain both written and unwritten variants.
          // Never replay it: doing so could overwrite an independent store edit.
          conflict = true;
          await this.repository.setItem(item.id, 'conflict', 'Попередній запис завершився частково або дані змінилися. Перевірте модифікації та створіть новий перегляд.', current.offers);
        } else if (!matchesKnownFeedSnapshot(item.before, current.offers)) {
          conflict = true;
          await this.repository.setItem(item.id, 'conflict', 'Список фідів змінився після перегляду. Створіть новий перегляд.', current.offers);
        } else {
          if (item.before.some((offer) => offer.marketplaces === null)) {
            const target = current.offers.map((offer) => ({ article: offer.article,
              marketplaces: targetMarketplaces(offer.marketplaces, operation.action) }));
            await this.repository.resolveItem(item.id, current.offers, target);
            item = { ...item, before: current.offers, target };
          }
          if (sameFeedSnapshot(item.before, item.target)) {
            await this.repository.setItem(item.id, 'unchanged', 'Потрібні опції вже встановлено.', current.offers);
            await this.repository.cacheFeeds(connection, item);
          } else ready.push(item);
        }
      }
      if (conflict || unavailable) {
        for (const item of ready) await this.repository.setItem(item.id, 'cancelled', 'Запис не розпочато: не всі товари пройшли перевірку.');
        const latest = await this.repository.operation(id, connection);
        await this.repository.finish(id, latest.counts.succeeded ? 'partial' : unavailable ? 'failed' : 'conflict',
          unavailable ? 'API Хорошопа не надав поточні налаштування фідів. Жодні нові зміни не записано.' : 'Дані товарів змінилися після перегляду.');
        return;
      }
      for (let offset = 0; offset < ready.length; offset += 20) {
        if ((await this.repository.connection()).generation !== connection.generation) {
          throw new AppError(409, 'HOROSHOP_FEEDS_CONNECTION_CHANGED', 'Підключення до Хорошопа змінилося.');
        }
        const batch = ready.slice(offset, offset + 20);
        for (const item of batch) await this.repository.setItem(item.id, 'writing');
        const payload = batch.flatMap((item) => item.target
          .filter((offer) => !sameFeedSnapshot([offer], item.before.filter((before) => before.article === offer.article)))
          .map((offer) => ({ article: offer.article, export_to_marketplace: offer.marketplaces.join(';') })));
        // Bound the number of offers even for products with many modifications.
        for (let start = 0; start < payload.length; start += 100) {
          try { await client.importCatalog(token, payload.slice(start, start + 100), { maxAttempts: 1 }); }
          catch { /* An uncertain response is resolved only through read-back. */ }
        }
      }
      if (ready.length) {
        const verified = await this.readRemote(client, token);
        for (const item of ready) {
          const current = verified.get(item.article);
          if (sameMembership(current, item.articles) && sameFeedSnapshot(current.offers, item.target)) {
            await this.repository.setItem(item.id, 'succeeded', '', current.offers);
            await this.repository.cacheFeeds(connection, item);
          } else {
            await this.repository.setItem(item.id, 'failed', 'Хорошоп не підтвердив усі фіди. Перевірте товар перед повторною спробою.', current?.offers ?? null);
          }
        }
      }
      const latest = await this.repository.operation(id, connection);
      await this.repository.finish(id, latest.counts.failed || latest.counts.conflict ? 'partial' : 'completed');
    } catch {
      await this.repository.pool.query(`UPDATE search_horoshop_feed_operation_items
        SET status = 'failed', message = 'Не вдалося підтвердити результат через API Хорошоп. Перевірте товар перед повторною спробою.', updated_at = NOW()
        WHERE operation_id = $1 AND status IN ('pending', 'writing')`, [id]);
      await this.repository.finish(id, 'failed', 'Не вдалося завершити операцію через API Хорошоп.');
    }
  }

  async runNext() {
    if (this.running) return;
    this.running = true;
    try {
      const pending = await this.repository.pool.query(`SELECT id FROM search_horoshop_feed_operations
        WHERE status IN ('queued', 'running') ORDER BY created_at LIMIT 1`);
      if (!pending.rows.length) return;
      await this.catalogService.runExclusiveExternalWrite(async () => {
        const lock = await this.repository.pool.connect();
        try {
          await lock.query('SELECT pg_advisory_lock($1)', [externalWriteLockId]);
          const connection = await this.repository.connection();
          const next = await this.repository.pool.query(`SELECT id FROM search_horoshop_feed_operations
            WHERE connection_id = $1 AND generation = $2 AND status IN ('queued', 'running')
            ORDER BY created_at LIMIT 1`, [connection.id, connection.generation]);
          if (!next.rows[0]) return;
          const id = next.rows[0].id;
          await this.repository.pool.query(`UPDATE search_horoshop_feed_operations
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

export const horoshopFeedService = new HoroshopFeedService();

export function startHoroshopFeedWorker(service = horoshopFeedService) {
  let current = null;
  const tick = () => {
    if (current) return;
    current = service.runNext().catch(() => {
      console.error(JSON.stringify({ event: 'horoshop_feeds_worker_failed', message: 'Worker will retry queued operations.' }));
    }).finally(() => { current = null; });
  };
  const timer = setInterval(tick, 2_000);
  timer.unref();
  tick();
  return async () => { clearInterval(timer); await current; };
}
