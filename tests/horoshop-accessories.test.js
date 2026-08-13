import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'pg-mem://horoshop-accessory-tests';
process.env.JWT_SECRET = '0123456789abcdef0123456789abcdef';
process.env.COOKIE_SECURE = 'false';

const { pool } = await import('../src/db/pool.js');
const { runMigrations } = await import('../src/db/migrate.js');
const { encryptHoroshopCredentials } = await import('../src/modules/search/horoshop/credential-cipher.js');
const { HoroshopAccessoryRepository } = await import('../src/modules/search/horoshop/accessory.repository.js');
const { HoroshopAccessoryService } = await import('../src/modules/search/horoshop/accessory.service.js');
const { recommendAccessories } = await import('../src/modules/search/horoshop/accessory-recommender.js');

const ids = {
  connection: randomUUID(), generation: randomUUID(), sync: randomUUID(),
  phoneCategory: randomUUID(), accessoryCategory: randomUUID(),
  phone: randomUUID(), case: randomUUID(), wrongCase: randomUUID(), charger: randomUUID(),
  unrelated: randomUUID(), battery: randomUUID()
};

function availableCandidate(title, categoryTitles, options = {}) {
  return {
    id: options.id || randomUUID(),
    titles: { uk: title },
    brand: options.brand || 'Example',
    categoryTitles: { uk: categoryTitles },
    characteristics: options.characteristics || {},
    popularity: options.popularity || '80',
    availabilities: ['В наявності'],
    visible: true,
    active: true
  };
}

before(async () => {
  await runMigrations();
  await pool.query(`
    INSERT INTO search_horoshop_connections (
      id, generation, store_domain, encrypted_credentials, status, last_sync_at
    ) VALUES ($1, $2, 'accessory-shop.example', $3, 'connected', NOW())
  `, [ids.connection, ids.generation, encryptHoroshopCredentials({ login: 'owner', password: 'secret' })]);
  await pool.query(`
    INSERT INTO search_horoshop_categories (
      id, connection_id, generation, external_id, titles, active, last_seen_sync_id
    ) VALUES
      ($1, $3, $4, 'phones', $5::jsonb, TRUE, $7),
      ($2, $3, $4, 'accessories', $6::jsonb, TRUE, $7)
  `, [
    ids.phoneCategory, ids.accessoryCategory, ids.connection, ids.generation,
    JSON.stringify({ uk: 'Смартфони' }), JSON.stringify({ uk: 'Аксесуари' }), ids.sync
  ]);
  const products = [
    [ids.phone, 'IPHONE-15', { uk: 'Смартфон Apple iPhone 15 Pro' }, 'Apple', 'phones', 'USB-C', 100, { accessories: ['CASE-15'] }],
    [ids.case, 'CASE-15', { uk: 'Чохол Apple iPhone 15 Pro Case' }, 'Apple', 'accessories', '', 95, {}],
    [ids.wrongCase, 'CASE-14', { uk: 'Чохол Apple iPhone 14 Pro Case' }, 'Apple', 'accessories', '', 96, {}],
    [ids.charger, 'CHARGER-30', { uk: 'Зарядний пристрій USB-C 30W' }, 'Example', 'accessories', 'USB-C', 88, {}],
    [ids.unrelated, 'PHONE-OTHER', { uk: 'Смартфон Samsung Galaxy S24' }, 'Samsung', 'phones', 'USB-C', 99, {}],
    [ids.battery, 'BATTERY-AA', { uk: 'Батарейки Duracell AA 4 шт' }, 'Duracell', 'accessories', '', 91, {}]
  ];
  for (const [id, sku, titles, brand, category, connector, popularity, source] of products) {
    await pool.query(`
      INSERT INTO search_horoshop_products (
        id, connection_id, generation, external_id, sku, titles, brand,
        category_external_id, price, currency, availability, visible, popularity,
        characteristics, source_data, active, last_seen_sync_id
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, '1000', 'UAH',
        'В наявності', TRUE, $9, $10::jsonb, $11::jsonb, TRUE, $12)
    `, [
      id, ids.connection, ids.generation, id, sku, JSON.stringify(titles), brand,
      category, String(popularity), JSON.stringify({ connector }), JSON.stringify(source), ids.sync
    ]);
  }
});

after(async () => pool.end());

test('recommendation scoring prioritizes compatible, useful and available accessories', () => {
  const recommendations = recommendAccessories({
    id: ids.phone, titles: { uk: 'Смартфон Apple iPhone 15 Pro' }, brand: 'Apple',
    categoryTitles: { uk: 'Смартфони' }, characteristics: { connector: 'USB-C' }
  }, [{
    id: ids.case, titles: { uk: 'Чохол Apple iPhone 15 Pro Case' }, brand: 'Apple',
    categoryTitles: { uk: 'Аксесуари' }, characteristics: {}, popularity: '95',
    availabilities: ['В наявності'], visible: true, active: true
  }, {
    id: ids.wrongCase, titles: { uk: 'Чохол Apple iPhone 14 Pro Case' }, brand: 'Apple',
    categoryTitles: { uk: 'Аксесуари' }, characteristics: {}, popularity: '96',
    availabilities: ['В наявності'], visible: true, active: true
  }, {
    id: ids.unrelated, titles: { uk: 'Смартфон Samsung Galaxy S24' }, brand: 'Samsung',
    categoryTitles: { uk: 'Смартфони' }, characteristics: { connector: 'USB-C' }, popularity: '99',
    availabilities: ['В наявності'], visible: true, active: true
  }], 12);

  assert.equal(recommendations.length, 1);
  assert.equal(recommendations[0].productId, ids.case);
  assert.equal(recommendations.some((item) => item.productId === ids.wrongCase), false);
  assert.ok(recommendations[0].compatibilityScore > 0.8);
  assert.match(recommendations[0].reason, /модель явно збігається/u);
});

test('recommendation scoring deliberately leaves unsupported products without suggestions', () => {
  const recommendations = recommendAccessories({
    id: ids.battery, titles: { uk: 'Батарейки Duracell AA 4 шт' }, brand: 'Duracell',
    categoryTitles: { uk: 'Аксесуари' }, characteristics: {}
  }, [{
    id: ids.charger, titles: { uk: 'Зарядний пристрій USB-C 30W' }, brand: 'Example',
    categoryTitles: { uk: 'Аксесуари' }, characteristics: { connector: 'USB-C' }, popularity: '88',
    availabilities: ['В наявності'], visible: true, active: true
  }], 12);

  assert.deepEqual(recommendations, []);
});

test('a joystick is not misclassified by headphone and USB-C characteristics', () => {
  const recommendations = recommendAccessories({
    id: randomUUID(), titles: { uk: 'Джойстик Sony DualSense Wireless Controller White' }, brand: 'Sony',
    categoryTitles: { uk: 'Геймпади та джойстики' },
    characteristics: { connection: 'Bluetooth, USB-C', audio: 'Розʼєм для навушників 3.5 мм' }
  }, [{
    id: randomUUID(), titles: { uk: 'АЗП Joyroom JR-CCN04 60W PD/QC3.0 Type-C/USB Black' }, brand: 'Joyroom',
    categoryTitles: { uk: 'Автомобільні зарядні пристрої' }, characteristics: { connector: 'USB-C' },
    popularity: '90', availabilities: ['В наявності'], visible: true, active: true
  }, {
    id: randomUUID(), titles: { uk: 'Power Bank Proove Hoodman Magnetic 20W 10000mAh MagSafe Gray' }, brand: 'Proove',
    categoryTitles: { uk: 'Павербанки' }, characteristics: { connector: 'USB-C' },
    popularity: '89', availabilities: ['В наявності'], visible: true, active: true
  }, {
    id: randomUUID(), titles: { uk: 'Колонка Bluetooth Hoco HC10 Sonar Black' }, brand: 'Hoco',
    categoryTitles: { uk: 'Портативна акустика' }, characteristics: { charging: 'USB Type-C' },
    popularity: '88', availabilities: ['В наявності'], visible: true, active: true
  }, {
    id: randomUUID(), titles: { uk: 'Чохол Apple AirPods 3 Slim Black' }, brand: 'Apple',
    categoryTitles: { uk: 'Чохли для навушників' }, characteristics: {},
    popularity: '87', availabilities: ['В наявності'], visible: true, active: true
  }], 12);

  assert.deepEqual(recommendations, []);
});

test('a laptop never receives a cigarette-lighter charger without explicit laptop compatibility', () => {
  const carChargerId = randomUUID();
  const laptopChargerId = randomUUID();
  const laptopBagId = randomUUID();
  const recommendations = recommendAccessories({
    id: randomUUID(), titles: { uk: 'Ноутбук Apple MacBook Air 13 M2' }, brand: 'Apple',
    categoryTitles: { uk: 'Ноутбуки' }, characteristics: { connector: 'USB-C' }
  }, [{
    id: carChargerId, titles: { uk: 'АЗП Joyroom JR-CCN04 60W PD/QC3.0 Type-C/USB Black' }, brand: 'Joyroom',
    categoryTitles: { uk: 'Автомобільні зарядні пристрої' }, characteristics: { connector: 'USB-C' },
    popularity: '95', availabilities: ['В наявності'], visible: true, active: true
  }, {
    id: laptopChargerId, titles: { uk: 'МЗП USB-C PD 65W для ноутбука' }, brand: 'Example',
    categoryTitles: { uk: 'Мережеві зарядні пристрої для ноутбуків' }, characteristics: { connector: 'USB-C' },
    popularity: '85', availabilities: ['В наявності'], visible: true, active: true
  }, {
    id: laptopBagId, titles: { uk: 'Сумка для ноутбука 13 дюймів Black' }, brand: 'Example',
    categoryTitles: { uk: 'Сумки для ноутбуків' }, characteristics: {},
    popularity: '80', availabilities: ['В наявності'], visible: true, active: true
  }], 12);

  assert.equal(recommendations.some((item) => item.productId === carChargerId), false);
  assert.equal(recommendations.some((item) => item.productId === laptopChargerId), true);
  assert.equal(recommendations.some((item) => item.productId === laptopBagId), true);
});

test('a MagSafe power bank is scored as a power bank rather than a charger', () => {
  const powerBankId = randomUUID();
  const recommendations = recommendAccessories({
    id: randomUUID(), titles: { uk: 'Смартфон Apple iPhone 15 Pro' }, brand: 'Apple',
    categoryTitles: { uk: 'Смартфони' }, characteristics: { connector: 'USB-C, MagSafe' }
  }, [{
    id: powerBankId, titles: { uk: 'Power Bank Proove Hoodman Magnetic 20W 10000mAh MagSafe Gray' }, brand: 'Proove',
    categoryTitles: { uk: 'Павербанки' }, characteristics: { connector: 'USB-C, MagSafe' },
    popularity: '90', availabilities: ['В наявності'], visible: true, active: true
  }], 12);

  assert.equal(recommendations[0]?.productId, powerBankId);
  assert.equal(recommendations[0]?.utilityScore, .78);
  assert.match(recommendations[0]?.reason || '', /автономне живлення/u);
});

test('accessory products are not treated as parent devices through a model name in their title', () => {
  const recommendations = recommendAccessories({
    id: randomUUID(), titles: { uk: 'Чохол Apple AirPods 3 Slim Black' }, brand: 'Apple',
    categoryTitles: { uk: 'Чохли для навушників' }, characteristics: {}
  }, [availableCandidate('Чохол Apple AirPods 3 Silicone Blue', 'Чохли для навушників')], 12);

  assert.deepEqual(recommendations, []);

  const categoryOnlyAccessory = recommendAccessories({
    id: randomUUID(), titles: { uk: 'Joyroom JR-CCN04 60W Black' }, brand: 'Joyroom',
    categoryTitles: { uk: 'Автомобільні зарядні пристрої для смартфонів' }, characteristics: { connector: 'USB-C' }
  }, [availableCandidate('Кабель USB-C to USB-C', 'Кабелі для смартфонів')], 12);
  assert.deepEqual(categoryOnlyAccessory, []);
});

test('a charging station and a USB-C flash drive cannot masquerade as phone charging accessories', () => {
  const cableId = randomUUID();
  const recommendations = recommendAccessories({
    id: randomUUID(), titles: { uk: 'Смартфон Samsung Galaxy S24' }, brand: 'Samsung',
    categoryTitles: { uk: 'Смартфони' }, characteristics: { connector: 'USB-C' }
  }, [
    availableCandidate('Зарядна станція EcoFlow DELTA 2', 'Зарядні станції', {
      characteristics: { connector: 'USB-C' }
    }),
    availableCandidate('Флеш-накопичувач USB Type-C 128GB', 'USB флеш-накопичувачі', {
      characteristics: { connector: 'USB-C' }
    }),
    availableCandidate('Кабель USB-C to USB-C 1 м', 'Кабелі для смартфонів', {
      id: cableId, characteristics: { connector: 'USB-C' }
    })
  ], 12);

  assert.deepEqual(recommendations.map((item) => item.productId), [cableId]);
});

test('one shared model number is not enough for a model-specific case', () => {
  const nokiaCaseId = randomUUID();
  const recommendations = recommendAccessories({
    id: randomUUID(), titles: { uk: 'Смартфон Nokia 3' }, brand: 'Nokia',
    categoryTitles: { uk: 'Смартфони' }, characteristics: {}
  }, [
    availableCandidate('Чохол Apple AirPods 3 Slim Black', 'Чохли для навушників'),
    availableCandidate('Чохол для Nokia 3 Silicone Black', 'Чохли для смартфонів', { id: nokiaCaseId })
  ], 12);

  assert.deepEqual(recommendations.map((item) => item.productId), [nokiaCaseId]);
});

test('console recommendations respect the exact gaming platform', () => {
  const dualSenseId = randomUUID();
  const recommendations = recommendAccessories({
    id: randomUUID(), titles: { uk: 'Ігрова консоль Sony PlayStation 5 Slim' }, brand: 'Sony',
    categoryTitles: { uk: 'Ігрові консолі' }, characteristics: { connector: 'HDMI, USB-C' }
  }, [
    availableCandidate('Геймпад Sony DualSense Wireless White', 'Геймпади PlayStation 5', {
      id: dualSenseId, brand: 'Sony'
    }),
    availableCandidate('Xbox Wireless Controller Black', 'Геймпади Xbox', { brand: 'Microsoft' }),
    availableCandidate('RGB LED Controller 24-key', 'Контролери освітлення')
  ], 12);

  assert.deepEqual(recommendations.map((item) => item.productId), [dualSenseId]);
});

test('stylus recommendations respect the device ecosystem', () => {
  const sPenId = randomUUID();
  const recommendations = recommendAccessories({
    id: randomUUID(), titles: { uk: 'Планшет Samsung Galaxy Tab S9' }, brand: 'Samsung',
    categoryTitles: { uk: 'Планшети' }, characteristics: {}
  }, [
    availableCandidate('Apple Pencil 2', 'Стилуси для планшетів', { brand: 'Apple' }),
    availableCandidate('Стилус Samsung S Pen для Galaxy Tab S9', 'Стилуси для планшетів Samsung', {
      id: sPenId, brand: 'Samsung'
    })
  ], 12);

  assert.deepEqual(recommendations.map((item) => item.productId), [sPenId]);
});

test('smartwatch straps respect the case size even when the model family matches', () => {
  const matchingStrapId = randomUUID();
  const recommendations = recommendAccessories({
    id: randomUUID(), titles: { uk: 'Смарт-годинник Apple Watch Series 9 45 мм' }, brand: 'Apple',
    categoryTitles: { uk: 'Смарт-годинники' }, characteristics: {}
  }, [
    availableCandidate('Ремінець для Apple Watch 41 мм', 'Ремінці для Apple Watch', { brand: 'Apple' }),
    availableCandidate('Ремінець для Apple Watch 45 мм', 'Ремінці для Apple Watch', {
      id: matchingStrapId, brand: 'Apple'
    })
  ], 12);

  assert.deepEqual(recommendations.map((item) => item.productId), [matchingStrapId]);
});

test('TV remotes, laptop stands and camera bags stay inside their intended device domain', () => {
  const tvRemoteId = randomUUID();
  const laptopStandId = randomUUID();
  const cameraBagId = randomUUID();

  const tvRecommendations = recommendAccessories({
    id: randomUUID(), titles: { uk: 'Телевізор Samsung UE55DU7100' }, brand: 'Samsung',
    categoryTitles: { uk: 'Телевізори' }, characteristics: {}
  }, [
    availableCandidate('Універсальний пульт для кондиціонера KT-9018E', 'Пульти для кондиціонерів'),
    availableCandidate('Універсальний пульт для телевізора Samsung', 'Пульти для телевізорів', {
      id: tvRemoteId
    })
  ], 12);
  const laptopRecommendations = recommendAccessories({
    id: randomUUID(), titles: { uk: 'Ноутбук Apple MacBook Air 13 M2' }, brand: 'Apple',
    categoryTitles: { uk: 'Ноутбуки' }, characteristics: {}
  }, [
    availableCandidate('Підставка для смартфона Hoco PH52', 'Підставки для смартфонів'),
    availableCandidate('Підставка для ноутбука Proove Metal Stand', 'Підставки для ноутбуків', {
      id: laptopStandId
    })
  ], 12);
  const cameraRecommendations = recommendAccessories({
    id: randomUUID(), titles: { uk: 'Фотоапарат Canon EOS R6' }, brand: 'Canon',
    categoryTitles: { uk: 'Фотоапарати' }, characteristics: {}
  }, [
    availableCandidate('Рюкзак для ноутбука 15.6 Black', 'Рюкзаки для ноутбуків'),
    availableCandidate('Сумка для фотоапарата Canon EOS R6', 'Сумки для фотоапаратів', {
      id: cameraBagId
    })
  ], 12);

  assert.deepEqual(tvRecommendations.map((item) => item.productId), [tvRemoteId]);
  assert.deepEqual(laptopRecommendations.map((item) => item.productId), [laptopStandId]);
  assert.deepEqual(cameraRecommendations.map((item) => item.productId), [cameraBagId]);
});

test('accessory workflow hydrates current links, saves a draft and publishes an overwrite payload', async () => {
  const imports = [];
  const repository = new HoroshopAccessoryRepository(pool);
  const service = new HoroshopAccessoryService({
    repository,
    catalogService: { runExclusiveExternalWrite: (operation) => operation() },
    clientFactory: () => ({
      async authenticate(login, password) {
        assert.equal(login, 'owner');
        assert.equal(password, 'secret');
        return 'token';
      },
      async importCatalog(token, products) {
        imports.push({ token, products });
        return {};
      }
    })
  });

  let detail = await service.detail(ids.phone, null);
  assert.equal(Object.hasOwn(detail.product, 'sourceData'), false);
  assert.equal(Object.hasOwn(detail.product, 'characteristics'), false);
  assert.equal(detail.draft.catalogStateKnown, true);
  assert.equal(detail.draft.selected.length, 1);
  assert.equal(detail.draft.selected[0].target.id, ids.case);
  assert.equal(detail.draft.selected[0].published, true);

  const generated = await service.generateRecommendations(ids.phone, 12, null);
  assert.ok(generated.generatedCount >= 2);
  assert.ok(generated.draft.suggestions.some((item) => item.target.id === ids.charger));

  await pool.query(`
    UPDATE search_horoshop_accessory_links
    SET algorithm_version = 1
    WHERE source = 'algorithm' AND selected = FALSE AND published = FALSE
  `);
  const staleDetail = await service.detail(ids.phone, null);
  assert.equal(staleDetail.draft.suggestions.some((item) => item.target.id === ids.charger), false);
  const regenerated = await service.generateRecommendations(ids.phone, 12, null);
  assert.ok(regenerated.draft.suggestions.some((item) => item.target.id === ids.charger));

  const bulk = await service.generateAllRecommendations(12, null);
  assert.equal(bulk.analyzedProducts, 6);
  assert.equal(bulk.productsWithRecommendations + bulk.productsWithoutRecommendations, 6);
  assert.ok(bulk.productsWithoutRecommendations >= 4);
  assert.ok(bulk.recommendationsGenerated >= 3);

  detail = await service.saveDraft(ids.phone, [
    { type: 'product', id: ids.case },
    { type: 'product', id: ids.charger },
    { type: 'category', id: ids.accessoryCategory }
  ], null);
  assert.equal(detail.draft.selected.length, 3);
  assert.equal(detail.draft.isDirty, true);

  detail = await service.publish(ids.phone, null);
  assert.equal(detail.draft.isDirty, false);
  assert.equal(detail.latestPublication.status, 'succeeded');
  assert.deepEqual(imports, [{
    token: 'token',
    products: [{
      article: 'IPHONE-15',
      accessories: ['CASE-15', 'CHARGER-30', { page: { id: 'accessories' } }]
    }]
  }]);

  await pool.query('DELETE FROM search_horoshop_connections WHERE id = $1', [ids.connection]);
  const remaining = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM search_horoshop_accessory_sets) AS sets,
      (SELECT COUNT(*) FROM search_horoshop_accessory_links) AS links,
      (SELECT COUNT(*) FROM search_horoshop_accessory_publications) AS publications
  `);
  assert.deepEqual({
    sets: Number(remaining.rows[0].sets),
    links: Number(remaining.rows[0].links),
    publications: Number(remaining.rows[0].publications)
  }, { sets: 0, links: 0, publications: 0 });
});
