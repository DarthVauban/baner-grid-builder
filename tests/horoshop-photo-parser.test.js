import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { after, before } from 'node:test';
import sharp from 'sharp';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'pg-mem://horoshop-photo-parser-tests';
process.env.JWT_SECRET = '0123456789abcdef0123456789abcdef';
process.env.COOKIE_SECURE = 'false';

const { pool } = await import('../src/db/pool.js');
const { runMigrations } = await import('../src/db/migrate.js');
const { encryptHoroshopCredentials } = await import('../src/modules/search/horoshop/credential-cipher.js');
const { HoroshopCatalogRepository } = await import('../src/modules/search/horoshop/catalog.repository.js');
const { HoroshopCatalogService } = await import('../src/modules/search/horoshop/catalog.service.js');
const { resolveHoroshopPhotoSelection } = await import('../src/modules/search/horoshop/photo-selection.js');
const { HoroshopPhotoService } = await import('../src/modules/search/horoshop/photo.service.js');

const ids = {
  connection: randomUUID(),
  generation: randomUUID(),
  sync: randomUUID(),
  phone: randomUUID(),
  duplicatePhone: randomUUID(),
  black: randomUUID(),
  blue: randomUUID()
};

before(async () => {
  await runMigrations();
  await pool.query(`
    INSERT INTO search_horoshop_connections (
      id, generation, store_domain, encrypted_credentials, status, last_sync_at
    ) VALUES ($1, $2, 'photo-shop.example', $3, 'connected', NOW())
  `, [ids.connection, ids.generation, encryptHoroshopCredentials({ login: 'owner', password: 'secret' })]);
  for (const product of [
    {
      id: ids.phone,
      externalId: 'phone-1',
      sku: 'PHONE-1',
      title: 'Смартфон Example One',
      source: { gallery_common: { links: ['https://photo-shop.example/current-common.webp'] } }
    },
    {
      id: ids.duplicatePhone,
      externalId: 'phone-2',
      sku: 'PHONE-2',
      title: 'Смартфон з однаковою назвою',
      source: {}
    }
  ]) {
    await pool.query(`
      INSERT INTO search_horoshop_products (
        id, connection_id, generation, external_id, sku, titles, source_data,
        active, visible, last_seen_sync_id
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, TRUE, TRUE, $8)
    `, [
      product.id, ids.connection, ids.generation, product.externalId, product.sku,
      JSON.stringify({ uk: product.title }), JSON.stringify(product.source), ids.sync
    ]);
  }
  for (const modification of [
    { id: ids.black, externalId: 'phone-1-black', sku: 'PHONE-1-BLACK', title: 'Example One Black' },
    { id: ids.blue, externalId: 'phone-1-blue', sku: 'PHONE-1-BLUE', title: 'Example One Blue' }
  ]) {
    await pool.query(`
      INSERT INTO search_horoshop_modifications (
        id, connection_id, product_id, generation, external_id, sku, titles,
        source_data, active, visible, last_seen_sync_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, TRUE, TRUE, $9)
    `, [
      modification.id, ids.connection, ids.phone, ids.generation, modification.externalId,
      modification.sku, JSON.stringify({ uk: modification.title }),
      JSON.stringify({ images: { links: [`https://photo-shop.example/${modification.externalId}.webp`] } }), ids.sync
    ]);
  }
});

after(async () => pool.end());

test('selection resolver prioritizes exact article and title matches without guessing', () => {
  const catalog = {
    products: [
      { id: ids.phone, sku: 'PHONE-1', titles: { uk: 'Смартфон Example One' } },
      { id: ids.duplicatePhone, sku: 'PHONE-2', titles: { uk: 'Смартфон з однаковою назвою' } },
      { id: randomUUID(), sku: 'PHONE-3', titles: { uk: 'Смартфон з однаковою назвою' } }
    ],
    modifications: [
      { id: ids.black, product_id: ids.phone, sku: 'PHONE-1-BLACK', titles: { uk: 'Example One Black' } }
    ]
  };
  const result = resolveHoroshopPhotoSelection([
    'PHONE-1-BLACK',
    'Смартфон Example One',
    'Смартфон з однаковою назвою',
    'невідомий товар',
    'phone-1-black'
  ], catalog);

  assert.equal(result.matched.length, 2);
  assert.equal(result.matched[0].matchedBy, 'modification_sku');
  assert.equal(result.matched[0].target.modificationId, ids.black);
  assert.equal(result.matched[1].matchedBy, 'product_title');
  assert.equal(result.ambiguous.length, 1);
  assert.equal(result.ambiguous[0].candidates.length, 2);
  assert.deepEqual(result.unmatched, ['невідомий товар']);
});

test('catalog filters can create a selection while direct lists remain available', async () => {
  const calls = [];
  const service = new HoroshopPhotoService({
    databasePool: pool,
    catalogService: {
      async catalog(input) {
        calls.push(input);
        return {
          items: [{ sku: 'PHONE-2', titles: { uk: 'Смартфон з однаковою назвою' } }],
          pageCount: 1
        };
      }
    }
  });
  const selection = await service.createFilteredSelection({
    name: 'Приховані товари',
    filters: { search: 'PHONE', category: 'phones', availability: '', visibility: 'hidden' },
    userId: null
  });

  assert.equal(selection.products.length, 1);
  assert.equal(selection.products[0].id, ids.duplicatePhone);
  assert.deepEqual(calls[0], {
    search: 'PHONE', category: 'phones', availability: '', visibility: 'hidden',
    state: 'active', page: 1, pageSize: 100
  });
  await service.deleteSelection(selection.id);
});

test('saved selection keeps the product modification tree and unresolved input', async () => {
  const service = new HoroshopPhotoService({ databasePool: pool });
  const selection = await service.createSelection({
    name: 'Точкова вибірка',
    entries: ['Смартфон Example One', 'PHONE-1-BLACK', 'відсутній артикул'],
    userId: null
  });
  const list = await service.listSelections();

  assert.equal(list.length, 1);
  assert.equal(list[0].matchedCount, 2);
  assert.equal(list[0].unmatchedCount, 1);
  assert.equal(selection.products.length, 1);
  assert.equal(selection.products[0].includeAllModifications, true);
  assert.equal(selection.products[0].modifications.length, 2);
  assert.deepEqual(selection.products[0].commonDraft.currentImages, [
    'https://photo-shop.example/current-common.webp'
  ]);
  assert.deepEqual(selection.resolution.unmatched, ['відсутній артикул']);
});

test('reviewed common and modification photos publish with explicit append mode and progress', async () => {
  const imports = [];
  const progress = [];
  const service = new HoroshopPhotoService({
    databasePool: pool,
    publicOrigin: 'https://panel.example',
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
  const selectionId = (await service.listSelections())[0].id;
  const common = await service.saveDraft({
    productId: ids.phone,
    sourceUrl: 'https://supplier.example/example-one',
    userId: null
  });
  const black = await service.saveDraft({
    productId: ids.phone,
    modificationId: ids.black,
    sourceUrl: 'https://supplier.example/example-one-black',
    userId: null
  });
  const rootFolderId = randomUUID();
  const productFolderId = randomUUID();
  await pool.query(`
    INSERT INTO media_library_folders (id, name) VALUES ($1, 'Фото Хорошоп — test'), ($2, 'PHONE-1')
  `, [rootFolderId, productFolderId]);
  await pool.query('UPDATE media_library_folders SET parent_id = $2 WHERE id = $1', [productFolderId, rootFolderId]);
  await pool.query(`
    UPDATE search_horoshop_photo_drafts SET media_folder_id = $3 WHERE id IN ($1, $2)
  `, [common.id, black.id, productFolderId]);
  for (const [index, draft] of [common, black].entries()) {
    const assetId = randomUUID();
    const photoAssetId = randomUUID();
    const hash = String(index + 1).repeat(64);
    await pool.query(`
      INSERT INTO media_library_assets (
        id, original_name, storage_key, url, mime_type, size_bytes,
        original_size_bytes, width, height, content_sha256, folder_id
      ) VALUES ($1, $2, $3, $4, 'image/webp', 100, 120, 1000, 1000, $5, $6)
    `, [assetId, `photo-${index}.webp`, `photo-${index}.webp`, `/media/catalog/library/photo-${index}.webp`, hash, productFolderId]);
    await pool.query(`
      INSERT INTO search_horoshop_photo_assets (
        id, draft_id, media_asset_id, source_url, content_sha256, selected, sort_order
      ) VALUES ($1, $2, $3, $4, $5, TRUE, 0)
    `, [photoAssetId, draft.id, assetId, `https://supplier.example/photo-${index}.jpg`, hash]);
    await pool.query(`
      UPDATE search_horoshop_photo_drafts SET parse_status = 'ready' WHERE id = $1
    `, [draft.id]);
  }

  const result = await service.publishSelection(selectionId, {
    mode: 'append',
    userId: null,
    onProgress: (event) => progress.push(event)
  });

  assert.deepEqual(result, { publishedDrafts: 2, publishedArticles: 2 });
  assert.equal(imports.length, 2);
  assert.deepEqual(imports.map((entry) => entry.products[0]).sort((left, right) => left.article.localeCompare(right.article)), [
    {
      article: 'PHONE-1',
      gallery_common: { links: ['https://panel.example/media/catalog/library/photo-0.webp'], override: false }
    },
    {
      article: 'PHONE-1-BLACK',
      images: { links: ['https://panel.example/media/catalog/library/photo-1.webp'], override: false }
    }
  ]);
  assert.equal(progress.at(-1).stage, 'completed');
  assert.equal(progress.at(-1).percentage, 100);
});

test('background queue reuses the shared scraper engine and stores a reviewable draft', async () => {
  const sourceImage = await sharp({
    create: { width: 800, height: 800, channels: 3, background: '#7656ff' }
  }).png().toBuffer();
  const service = new HoroshopPhotoService({
    databasePool: pool,
    scrape: async ({ url }) => ({
      images: [{ sourceUrl: `${url}/image.jpg`, buffer: sourceImage }],
      errors: [],
      diagnostics: { candidates: 1 }
    }),
    createAsset: async ({ originalName, folderId }, db) => {
      const id = randomUUID();
      const storageKey = `${id}.webp`;
      const inserted = await db.query(`
        INSERT INTO media_library_assets (
          id, original_name, storage_key, url, mime_type, size_bytes,
          original_size_bytes, width, height, content_sha256, folder_id
        ) VALUES ($1, $2, $3, $4, 'image/webp', 100, 120, 20, 20, $5, $6)
        RETURNING id, url
      `, [id, originalName, storageKey, `/media/catalog/library/${storageKey}`, id.replaceAll('-', '').padEnd(64, '0'), folderId]);
      return inserted.rows[0];
    }
  });
  const draft = await service.saveDraft({
    productId: ids.phone,
    modificationId: ids.blue,
    sourceUrl: 'https://supplier.example/example-one-blue',
    userId: null
  });
  const batch = await service.createBatch({ draftIds: [draft.id], userId: null });
  const run = await service.claimNextRun({ lockRows: false });
  const result = await service.processRun(run);
  const detail = await pool.query(`
    SELECT parse_status, media_folder_id FROM search_horoshop_photo_drafts WHERE id = $1
  `, [draft.id]);
  const assets = await pool.query(`
    SELECT COUNT(*)::INTEGER AS asset_count FROM search_horoshop_photo_assets WHERE draft_id = $1
  `, [draft.id]);

  assert.equal(batch.requestedCount, 1);
  assert.equal(result.status, 'success', result.errorMessage);
  assert.equal(detail.rows[0].parse_status, 'ready');
  assert.ok(detail.rows[0].media_folder_id);
  assert.equal(Number(assets.rows[0].asset_count), 1);
});

test('disconnect removes selections, drafts and their generated media', async () => {
  const repository = new HoroshopCatalogRepository(pool);
  const service = new HoroshopCatalogService({ repository });
  let result;
  try {
    result = await service.disconnect('photo-shop.example', null);
  } catch (error) {
    const connection = await repository.getConnection();
    throw new Error(connection?.lastError || error.message, { cause: error });
  }

  assert.deepEqual(result, { categories: 0, products: 2, modifications: 2 });
  for (const table of [
    'search_horoshop_photo_selections',
    'search_horoshop_photo_drafts',
    'search_horoshop_photo_assets',
    'media_library_assets',
    'media_library_folders'
  ]) {
    const count = await pool.query(`SELECT COUNT(*) AS count FROM ${table}`);
    assert.equal(Number(count.rows[0].count), 0, table);
  }
});
