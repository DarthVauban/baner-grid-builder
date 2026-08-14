import { AppError } from '../../../lib/app-error.js';
import { decryptHoroshopCredentials } from './credential-cipher.js';
import { HoroshopApiError, HoroshopClient } from './horoshop.client.js';
import { HoroshopAccessoryRepository } from './accessory.repository.js';
import {
  HOROSHOP_CODEX_REVIEW_FORMAT,
  codexReviewCatalogRevision
} from './accessory-review.js';
import { horoshopCatalogService } from './catalog.service.js';

export { HOROSHOP_CODEX_REVIEW_FORMAT } from './accessory-review.js';

function notFound() {
  return new AppError(404, 'HOROSHOP_PRODUCT_NOT_FOUND', 'Товар відсутній у поточному каталозі Хорошоп.');
}

function publicationError(error) {
  if (error instanceof AppError) return error;
  if (error instanceof HoroshopApiError) {
    if (error.code === 'permission_denied') {
      return new AppError(422, 'HOROSHOP_ACCESSORY_ACCESS_DENIED', 'Хорошоп не дозволив змінити аксесуари. Перевірте рівень доступу адміністратора.');
    }
    if (error.code === 'unsupported_operation') {
      return new AppError(422, 'HOROSHOP_ACCESSORY_IMPORT_UNAVAILABLE', 'Цей магазин не підтримує оновлення аксесуарів через catalog/import.');
    }
  }
  return new AppError(502, 'HOROSHOP_ACCESSORY_PUBLISH_FAILED', 'Хорошоп не прийняв список аксесуарів. Чернетку збережено без змін.');
}

function validatePublicationPayload(payload) {
  if (payload.products.length > 16) {
    throw new AppError(422, 'HOROSHOP_ACCESSORY_PRODUCT_LIMIT', 'Скоротіть список до 16 конкретних товарів.');
  }
}

function publicationItem(payload) {
  return {
    article: payload.context.product.sku,
    accessories: [
      ...payload.products.map((item) => item.sku),
      ...payload.categories.map((item) => ({ page: { id: item.externalId } }))
    ]
  };
}

function publicationTotals(payloads) {
  return {
    products: payloads.length,
    productAccessories: payloads.reduce((total, payload) => total + payload.products.length, 0),
    categoryAccessories: payloads.reduce((total, payload) => total + payload.categories.length, 0)
  };
}

export class HoroshopAccessoryService {
  constructor(options = {}) {
    this.repository = options.repository || new HoroshopAccessoryRepository();
    this.clientFactory = options.clientFactory || ((storeDomain) => new HoroshopClient(storeDomain));
    this.catalogService = options.catalogService || horoshopCatalogService;
  }

  async detail(productId, actorUserId) {
    const result = await this.repository.getDetail(productId, actorUserId);
    if (!result) throw notFound();
    return result;
  }

  async candidates(productId, search, limit) {
    const result = await this.repository.searchCandidates(productId, search, limit);
    if (!result) throw notFound();
    return result;
  }

  async saveDraft(productId, items, actorUserId) {
    const productItems = items.filter((item) => item.type === 'product');
    const categoryItems = items.filter((item) => item.type === 'category');
    if (productItems.length > 16) {
      throw new AppError(422, 'HOROSHOP_ACCESSORY_PRODUCT_LIMIT', 'Хорошоп рекомендує не більше 16 конкретних аксесуарів для одного товару.');
    }
    if (categoryItems.length > 16) {
      throw new AppError(422, 'HOROSHOP_ACCESSORY_CATEGORY_LIMIT', 'До однієї картки можна додати не більше 16 розділів аксесуарів.');
    }
    const resolved = await this.repository.resolveTargets(productId, items);
    if (!resolved) throw notFound();
    if (resolved.products.length !== resolved.productIds.length) {
      throw new AppError(422, 'HOROSHOP_ACCESSORY_PRODUCT_INVALID', 'Один із вибраних аксесуарів неактивний або належить іншому магазину.');
    }
    if (resolved.categories.length !== resolved.categoryIds.length) {
      throw new AppError(422, 'HOROSHOP_ACCESSORY_CATEGORY_INVALID', 'Можна вибирати лише кінцеві розділи, які не містять підрозділів і не збігаються з розділом товару.');
    }
    const result = await this.repository.saveDraft(productId, items, actorUserId);
    if (!result) throw notFound();
    return result;
  }

  async reviewCatalog() {
    const catalog = await this.repository.loadCodexReviewCatalog();
    if (!catalog) {
      throw new AppError(404, 'HOROSHOP_CATALOG_NOT_FOUND', 'Спочатку підключіть Хорошоп та імпортуйте каталог.');
    }
    if (catalog.connection.status !== 'connected') {
      throw new AppError(409, 'HOROSHOP_CONNECTION_NOT_READY', 'Експорт для рев’ю доступний після завершення синхронізації каталогу.');
    }
    return {
      format: HOROSHOP_CODEX_REVIEW_FORMAT,
      connectionGeneration: catalog.connection.generation,
      catalogRevision: codexReviewCatalogRevision(catalog.products),
      storeDomain: catalog.connection.storeDomain,
      exportedAt: new Date().toISOString(),
      products: catalog.products
    };
  }

  async importReview(document, actorUserId) {
    const catalog = await this.repository.loadCodexReviewCatalog();
    if (!catalog) {
      throw new AppError(404, 'HOROSHOP_CATALOG_NOT_FOUND', 'Спочатку підключіть Хорошоп та імпортуйте каталог.');
    }
    if (catalog.connection.status !== 'connected') {
      throw new AppError(409, 'HOROSHOP_CONNECTION_NOT_READY', 'Імпорт рев’ю доступний після завершення синхронізації каталогу.');
    }
    if (catalog.connection.generation !== document.connectionGeneration) {
      throw new AppError(409, 'HOROSHOP_CODEX_REVIEW_STALE', 'Це рев’ю створене для іншого підключення Хорошоп. Експортуйте актуальний каталог і повторіть рев’ю.');
    }
    if (codexReviewCatalogRevision(catalog.products) !== document.catalogRevision) {
      throw new AppError(409, 'HOROSHOP_CODEX_REVIEW_STALE', 'Каталог змінився після експорту. Експортуйте актуальні дані й повторіть рев’ю.');
    }

    const currentProductIds = new Set(catalog.products.map((product) => product.id));
    const reviewedProductIds = new Set();
    for (const item of document.products) {
      if (!currentProductIds.has(item.productId) || reviewedProductIds.has(item.productId)) {
        throw new AppError(422, 'HOROSHOP_CODEX_REVIEW_PRODUCT_INVALID', 'Рев’ю містить відсутній або продубльований батьківський товар.');
      }
      reviewedProductIds.add(item.productId);
      const recommendationIds = new Set();
      for (const recommendation of item.recommendations) {
        if (!currentProductIds.has(recommendation.productId)
          || recommendation.productId === item.productId
          || recommendationIds.has(recommendation.productId)) {
          throw new AppError(422, 'HOROSHOP_CODEX_REVIEW_ACCESSORY_INVALID', 'Рев’ю містить відсутній, продубльований або тотожний батьківському товар-аксесуар.');
        }
        recommendationIds.add(recommendation.productId);
      }
    }
    if (reviewedProductIds.size !== currentProductIds.size) {
      throw new AppError(422, 'HOROSHOP_CODEX_REVIEW_INCOMPLETE', 'Рев’ю повинно містити кожен активний товар каталогу, навіть якщо для нього немає рекомендацій.');
    }

    const saved = await this.repository.saveCodexReview(
      document.connectionGeneration,
      document.catalogRevision,
      document.products,
      actorUserId
    );
    if (!saved) {
      throw new AppError(409, 'HOROSHOP_CODEX_REVIEW_STALE', 'Підключення або каталог змінилися під час імпорту. Експортуйте каталог повторно.');
    }
    const productsWithRecommendations = document.products.filter((item) => item.recommendations.length > 0).length;
    return {
      reviewedProducts: document.products.length,
      productsWithRecommendations,
      productsWithoutRecommendations: document.products.length - productsWithRecommendations,
      recommendationsSaved: document.products.reduce((total, item) => total + item.recommendations.length, 0)
    };
  }

  async acceptReviewProposals(productId, actorUserId) {
    const state = await this.repository.ensureSet(productId, actorUserId);
    if (!state?.set) throw notFound();
    if (state.context.connection.status !== 'connected') {
      throw new AppError(409, 'HOROSHOP_CONNECTION_NOT_READY', 'Додавання пропозицій доступне після завершення синхронізації каталогу.');
    }
    const result = await this.repository.acceptCodexProposals(
      state.context.connection.id,
      productId,
      actorUserId
    );
    return { ...result, detail: await this.detail(productId, actorUserId) };
  }

  async acceptAllReviewProposals(actorUserId) {
    const catalog = await this.repository.loadCodexReviewCatalog();
    if (!catalog) {
      throw new AppError(404, 'HOROSHOP_CATALOG_NOT_FOUND', 'Спочатку підключіть Хорошоп та імпортуйте каталог.');
    }
    if (catalog.connection.status !== 'connected') {
      throw new AppError(409, 'HOROSHOP_CONNECTION_NOT_READY', 'Додавання пропозицій доступне після завершення синхронізації каталогу.');
    }
    return {
      ...await this.repository.acceptCodexProposals(
        catalog.connection.id,
        null,
        actorUserId
      ),
      detail: null
    };
  }

  async publicationSummary() {
    const publication = await this.repository.bulkPublicationPayloads();
    if (!publication) {
      throw new AppError(404, 'HOROSHOP_CATALOG_NOT_FOUND', 'Спочатку підключіть Хорошоп та імпортуйте каталог.');
    }
    if (publication.connection.status !== 'connected') {
      throw new AppError(409, 'HOROSHOP_CONNECTION_NOT_READY', 'Публікація доступна лише після завершення синхронізації каталогу.');
    }
    const totals = publicationTotals(publication.payloads);
    return {
      pendingProducts: totals.products,
      productAccessories: totals.productAccessories,
      categoryAccessories: totals.categoryAccessories
    };
  }

  async publishAll(actorUserId) {
    return this.catalogService.runExclusiveExternalWrite(async () => {
      const publication = await this.repository.bulkPublicationPayloads();
      if (!publication) {
        throw new AppError(404, 'HOROSHOP_CATALOG_NOT_FOUND', 'Спочатку підключіть Хорошоп та імпортуйте каталог.');
      }
      if (publication.connection.status !== 'connected') {
        throw new AppError(409, 'HOROSHOP_CONNECTION_NOT_READY', 'Публікація доступна лише після завершення синхронізації каталогу.');
      }
      for (const payload of publication.payloads) validatePublicationPayload(payload);
      const totals = publicationTotals(publication.payloads);
      if (publication.payloads.length === 0) {
        return {
          publishedProducts: 0,
          productAccessories: 0,
          categoryAccessories: 0
        };
      }

      const publications = await this.repository.startPublications(publication.payloads, actorUserId);
      try {
        const credentials = decryptHoroshopCredentials(publication.connection.encryptedCredentials);
        const client = this.clientFactory(publication.connection.storeDomain);
        const token = await client.authenticate(credentials.login, credentials.password);
        await client.importCatalog(token, publication.payloads.map(publicationItem));
        await this.repository.completePublications(publications, actorUserId);
        return {
          publishedProducts: totals.products,
          productAccessories: totals.productAccessories,
          categoryAccessories: totals.categoryAccessories
        };
      } catch (error) {
        await this.repository.failPublications(publications.map((item) => item.id), error).catch(() => {});
        throw publicationError(error);
      }
    });
  }

  async publish(productId, actorUserId) {
    return this.catalogService.runExclusiveExternalWrite(async () => {
      const payload = await this.repository.publicationPayload(productId, actorUserId);
      if (!payload) throw notFound();
      if (payload.context.connection.status !== 'connected') {
        throw new AppError(409, 'HOROSHOP_CONNECTION_NOT_READY', 'Публікація доступна лише після завершення синхронізації каталогу.');
      }
      validatePublicationPayload(payload);
      const publicationId = await this.repository.startPublication(payload, actorUserId);
      try {
        const credentials = decryptHoroshopCredentials(payload.context.connection.encryptedCredentials);
        const client = this.clientFactory(payload.context.connection.storeDomain);
        const token = await client.authenticate(credentials.login, credentials.password);
        await client.importCatalog(token, [publicationItem(payload)]);
        await this.repository.completePublication(publicationId, payload.set.id, actorUserId, [
          ...payload.products.map((item) => `product:${item.id}`),
          ...payload.categories.map((item) => `category:${item.id}`)
        ]);
        return await this.detail(productId, actorUserId);
      } catch (error) {
        await this.repository.failPublication(publicationId, error).catch(() => {});
        throw publicationError(error);
      }
    });
  }
}

export const horoshopAccessoryService = new HoroshopAccessoryService();
