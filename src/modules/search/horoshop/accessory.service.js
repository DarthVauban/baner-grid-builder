import { AppError } from '../../../lib/app-error.js';
import { decryptHoroshopCredentials } from './credential-cipher.js';
import { HoroshopApiError, HoroshopClient } from './horoshop.client.js';
import { HoroshopAccessoryRepository } from './accessory.repository.js';
import { recommendAccessories } from './accessory-recommender.js';
import { horoshopCatalogService } from './catalog.service.js';

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

  async generateRecommendations(productId, limit, actorUserId) {
    const catalog = await this.repository.loadRecommendationCatalog(productId);
    if (!catalog) throw notFound();
    const recommendations = recommendAccessories(catalog.target, catalog.candidates, limit);
    const result = await this.repository.saveRecommendations(productId, recommendations, actorUserId);
    if (!result) throw notFound();
    return { ...result, generatedCount: recommendations.length };
  }

  async publish(productId, actorUserId) {
    return this.catalogService.runExclusiveExternalWrite(async () => {
      const payload = await this.repository.publicationPayload(productId, actorUserId);
      if (!payload) throw notFound();
      if (payload.context.connection.status !== 'connected') {
        throw new AppError(409, 'HOROSHOP_CONNECTION_NOT_READY', 'Публікація доступна лише після завершення синхронізації каталогу.');
      }
      if (payload.products.length > 16) {
        throw new AppError(422, 'HOROSHOP_ACCESSORY_PRODUCT_LIMIT', 'Скоротіть список до 16 конкретних товарів.');
      }
      const publicationId = await this.repository.startPublication(payload, actorUserId);
      try {
        const credentials = decryptHoroshopCredentials(payload.context.connection.encryptedCredentials);
        const client = this.clientFactory(payload.context.connection.storeDomain);
        const token = await client.authenticate(credentials.login, credentials.password);
        await client.importCatalog(token, [{
          article: payload.context.product.sku,
          accessories: [
            ...payload.products.map((item) => item.sku),
            ...payload.categories.map((item) => ({ page: { id: item.externalId } }))
          ]
        }]);
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
