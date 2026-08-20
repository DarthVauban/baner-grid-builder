import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { after, before } from 'node:test';
import sharp from 'sharp';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'pg-mem://horoshop-photo-parser-tests';
process.env.JWT_SECRET = '0123456789abcdef0123456789abcdef';
process.env.COOKIE_SECURE = 'false';
process.env.ADMIN_NAME = 'Photo Parser Admin';
process.env.ADMIN_EMAIL = 'photo-parser-admin@test.local';
process.env.ADMIN_PASSWORD = 'PhotoParserAdmin123!';

const { pool } = await import('../src/db/pool.js');
const { runMigrations } = await import('../src/db/migrate.js');
const { encryptHoroshopCredentials } = await import('../src/modules/search/horoshop/credential-cipher.js');
const { HoroshopCatalogRepository } = await import('../src/modules/search/horoshop/catalog.repository.js');
const { HoroshopCatalogService } = await import('../src/modules/search/horoshop/catalog.service.js');
const { resolveHoroshopPhotoSelection } = await import('../src/modules/search/horoshop/photo-selection.js');
const { HoroshopPhotoService } = await import('../src/modules/search/horoshop/photo.service.js');
const { HoroshopPhotoDesktopService } = await import('../src/modules/search/horoshop/photo-desktop.service.js');
const { ensureBootstrapAdmin } = await import('../src/modules/users/user.service.js');

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
  await ensureBootstrapAdmin();
  const admin = await pool.query(`
    UPDATE users SET two_factor_enabled = TRUE
    WHERE email = 'photo-parser-admin@test.local'
    RETURNING id
  `);
  ids.admin = admin.rows[0].id;
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
      source: { gallery_common: { links: ['https://photo-shop.example/current-phone-2.webp'] } }
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
    { id: ids.blue, externalId: 'phone-1-blue', sku: 'PHONE-1-BLUE', title: 'PHONE-1-BLUE' }
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

function createDesktopHarness() {
  const photoService = new HoroshopPhotoService({ databasePool: pool });
  const desktopService = new HoroshopPhotoDesktopService({
    databasePool: pool,
    photoService,
    createAsset: async ({ buffer, originalName, folderId }, db) => {
      const id = randomUUID();
      const storageKey = `desktop-${id}.webp`;
      const metadata = await sharp(buffer).metadata();
      const result = await db.query(`
        INSERT INTO media_library_assets (
          id, original_name, storage_key, url, mime_type, size_bytes,
          original_size_bytes, width, height, content_sha256, folder_id
        ) VALUES ($1, $2, $3, $4, 'image/webp', $5, $5, $6, $7, $8, $9)
        RETURNING id, url, width, height, size_bytes
      `, [
        id, originalName, storageKey, `/media/catalog/library/${storageKey}`, buffer.length,
        metadata.width || 0, metadata.height || 0, id.replaceAll('-', '').padEnd(64, '0'), folderId
      ]);
      const row = result.rows[0];
      return { ...row, size: Number(row.size_bytes || 0) };
    }
  });
  return { photoService, desktopService };
}

async function createPublicationFixture(service, modificationCount = 2) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase();
  const productId = randomUUID();
  const productSku = `PUB-${suffix}`;
  await pool.query(`
    INSERT INTO search_horoshop_products (
      id, connection_id, generation, external_id, sku, titles, source_data,
      active, visible, last_seen_sync_id
    ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, '{}'::jsonb, TRUE, TRUE, $7)
  `, [
    productId, ids.connection, ids.generation, `publication-${suffix}`, productSku,
    JSON.stringify({ uk: `Publication ${suffix}` }), ids.sync
  ]);
  const modifications = [];
  for (let index = 0; index < modificationCount; index += 1) {
    const modification = {
      id: randomUUID(),
      sku: `${productSku}-${index + 1}`,
      externalId: `publication-${suffix}-${index + 1}`
    };
    await pool.query(`
      INSERT INTO search_horoshop_modifications (
        id, connection_id, product_id, generation, external_id, sku, titles,
        source_data, active, visible, last_seen_sync_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, '{}'::jsonb, TRUE, TRUE, $8)
    `, [
      modification.id, ids.connection, productId, ids.generation, modification.externalId,
      modification.sku, JSON.stringify({ uk: `Modification ${index + 1}` }), ids.sync
    ]);
    modifications.push(modification);
  }
  const selection = await service.createSelection({
    name: `Publication ${suffix}`,
    entries: [productSku],
    userId: ids.admin
  });
  const drafts = [];
  for (const modification of modifications) {
    drafts.push(await service.saveDraft({
      productId,
      modificationId: modification.id,
      sourceUrl: `https://supplier.example/${modification.externalId}`,
      userId: ids.admin
    }));
  }
  return { productId, productSku, modifications, selection, drafts, mediaAssetIds: [], photoAssetIds: [] };
}

async function addPublicationAsset(fixture, draftId, options = {}) {
  const mediaAssetId = randomUUID();
  const photoAssetId = randomUUID();
  const storageKey = `publication-${mediaAssetId}.webp`;
  const hash = mediaAssetId.replaceAll('-', '').padEnd(64, 'a');
  const sizeBytes = options.sizeBytes ?? 100;
  const url = options.url ?? `/media/catalog/library/${storageKey}`;
  await pool.query(`
    INSERT INTO media_library_assets (
      id, original_name, storage_key, url, mime_type, size_bytes,
      original_size_bytes, width, height, content_sha256
    ) VALUES ($1, $2, $3, $4, 'image/webp', $5, $5, 1000, 1000, $6)
  `, [mediaAssetId, storageKey, storageKey, url, sizeBytes, hash]);
  await pool.query(`
    INSERT INTO search_horoshop_photo_assets (
      id, draft_id, media_asset_id, source_url, content_sha256, selected, sort_order
    ) VALUES ($1, $2, $3, $4, $5, TRUE, 0)
  `, [photoAssetId, draftId, mediaAssetId, `https://supplier.example/${photoAssetId}.webp`, hash]);
  await pool.query(`
    UPDATE search_horoshop_photo_drafts
    SET parse_status = 'ready', publish_status = 'draft', error_message = ''
    WHERE id = $1
  `, [draftId]);
  fixture.mediaAssetIds.push(mediaAssetId);
  fixture.photoAssetIds.push(photoAssetId);
  return { mediaAssetId, photoAssetId };
}

async function removePublicationFixture(fixture) {
  await pool.query('DELETE FROM search_horoshop_photo_selections WHERE id = $1', [fixture.selection.id]);
  await pool.query('DELETE FROM search_horoshop_products WHERE id = $1', [fixture.productId]);
  if (fixture.mediaAssetIds.length) {
    await pool.query(`
      DELETE FROM media_library_assets
      WHERE id IN (${fixture.mediaAssetIds.map((_, index) => `$${index + 1}`).join(', ')})
    `, fixture.mediaAssetIds);
  }
}

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

  const articleTitle = resolveHoroshopPhotoSelection(['PHONE-1-BLUE'], {
    products: [{ id: ids.phone, sku: 'PHONE-1', titles: { uk: 'Смартфон Example One' } }],
    modifications: [{
      id: ids.blue,
      product_id: ids.phone,
      sku: 'PHONE-1-BLUE',
      titles: { uk: 'PHONE-1-BLUE' }
    }]
  });
  assert.equal(articleTitle.matched[0].target.title, 'Смартфон Example One');
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
  assert.equal(selection.products[0].modifications.length, 0);
  assert.ok(selection.products[0].commonDraft);
  await service.deleteSelection(selection.id);
});

test('saved selection exposes unique modification targets without an article-only title', async () => {
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
  assert.equal(selection.products[0].commonDraft, null);
  assert.equal(selection.products[0].modifications.find((item) => item.id === ids.blue).title, 'Смартфон Example One');
  assert.deepEqual(selection.resolution.unmatched, ['відсутній артикул']);
});

test('bulk publication skips a common gallery when a product has unique modification photos', async () => {
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

  assert.deepEqual(result, {
    publishedDrafts: 1,
    publishedArticles: 1,
    failedDrafts: 0,
    failedArticles: 0,
    failures: []
  });
  assert.equal(imports.length, 1);
  assert.deepEqual(imports[0].products[0], {
    article: 'PHONE-1-BLACK',
    images: { links: ['https://panel.example/media/catalog/library/photo-1.webp'], override: false }
  });
  assert.equal(progress.at(-1).stage, 'completed');
  assert.equal(progress.at(-1).percentage, 100);

  const batch = await service.createBatch({ selectionId, userId: null });
  const queued = await pool.query('SELECT draft_id FROM search_horoshop_photo_runs WHERE batch_id = $1', [batch.id]);
  assert.equal(batch.requestedCount, 1);
  assert.deepEqual(queued.rows.map((row) => row.draft_id), [black.id]);
  await pool.query('DELETE FROM search_horoshop_photo_runs WHERE batch_id = $1', [batch.id]);
  await pool.query('DELETE FROM search_horoshop_photo_batches WHERE id = $1', [batch.id]);
  await pool.query(`
    UPDATE search_horoshop_photo_drafts
    SET parse_status = 'ready', publish_status = 'published'
    WHERE id = $1
  `, [black.id]);

  const legacyPublishedBatch = await pool.query(`
    INSERT INTO search_horoshop_photo_batches (
      connection_id, generation, selection_id, selection_based, requested_count, created_by
    ) VALUES ($1, $2, $3, TRUE, 1, $4)
    RETURNING id
  `, [ids.connection, ids.generation, selectionId, ids.admin]);
  const legacyPublishedRun = await pool.query(`
    INSERT INTO search_horoshop_photo_runs (batch_id, draft_id, executor, source_url)
    VALUES ($1, $2, 'desktop', '')
    RETURNING id
  `, [legacyPublishedBatch.rows[0].id, black.id]);
  const publishedMedia = await pool.query(`
    SELECT photo.media_asset_id, photo.source_url, photo.content_sha256, photo.sort_order
    FROM search_horoshop_photo_assets AS photo
    WHERE photo.draft_id = $1
  `, [black.id]);
  await pool.query(`
    INSERT INTO search_horoshop_photo_run_uploads (
      run_id, media_asset_id, source_url, content_sha256, sort_order
    ) VALUES ($1, $2, $3, $4, $5)
  `, [
    legacyPublishedRun.rows[0].id,
    publishedMedia.rows[0].media_asset_id,
    publishedMedia.rows[0].source_url,
    publishedMedia.rows[0].content_sha256,
    publishedMedia.rows[0].sort_order
  ]);

  await service.deleteSelection(selectionId);
  const publishedDraft = await pool.query(`
    SELECT publish_status FROM search_horoshop_photo_drafts WHERE id = $1
  `, [black.id]);
  const publishedAssets = await pool.query(`
    SELECT id, media_asset_id FROM search_horoshop_photo_assets WHERE draft_id = $1
  `, [black.id]);
  const preservedMedia = await pool.query('SELECT id FROM media_library_assets WHERE id = $1', [
    publishedMedia.rows[0].media_asset_id
  ]);
  assert.equal(publishedDraft.rows[0].publish_status, 'published');
  assert.equal(publishedAssets.rows.length, 1);
  assert.equal(preservedMedia.rows.length, 1);
});

test('bulk publication continues after one article fails and retries only the failed draft', async () => {
  const imports = [];
  const progress = [];
  let round = 1;
  let callsInRound = 0;
  let failedArticle = '';
  const service = new HoroshopPhotoService({
    databasePool: pool,
    publicOrigin: 'https://panel.example',
    publicationHeartbeatMilliseconds: 2,
    catalogService: { runExclusiveExternalWrite: (operation) => operation() },
    clientFactory: () => ({
      async authenticate() { return 'token'; },
      async importCatalog(token, products, options) {
        const article = products[0].article;
        imports.push({ round, token, products, options });
        await new Promise((resolve) => setTimeout(resolve, 12));
        if (round === 1 && callsInRound++ === 0) {
          failedArticle = article;
          throw new Error('private upstream diagnostics must not be exposed');
        }
        if (round === 3) throw Object.assign(new Error('single draft failed remotely'), { code: 'ETIMEDOUT' });
        return {};
      }
    })
  });
  const fixture = await createPublicationFixture(service, 2);
  try {
    for (const draft of fixture.drafts) await addPublicationAsset(fixture, draft.id);

    const first = await service.publishSelection(fixture.selection.id, {
      mode: 'append',
      userId: ids.admin,
      onProgress: (event) => progress.push(event)
    });
    assert.equal(first.publishedDrafts, 1);
    assert.equal(first.publishedArticles, 1);
    assert.equal(first.failedDrafts, 1);
    assert.equal(first.failedArticles, 1);
    assert.equal(first.failures.length, 1);
    assert.equal(first.failures[0].article, failedArticle);
    assert.equal(first.failures[0].code, 'HOROSHOP_PHOTO_PUBLISH_FAILED');
    assert.doesNotMatch(first.failures[0].message, new RegExp(failedArticle, 'u'));
    assert.doesNotMatch(first.failures[0].message, /private upstream diagnostics/u);
    assert.equal(imports.filter((item) => item.round === 1).length, 2);
    assert.ok(imports.filter((item) => item.round === 1).every((item) => (
      item.token === 'token'
      && item.options.timeoutMilliseconds === 300_000
      && item.options.maxAttempts === 1
    )));
    assert.ok(progress.filter((event) => event.stage === 'publishing').length > 2, 'expected heartbeat progress events');
    assert.equal(progress.at(-1).percentage, 100);
    assert.equal(progress.at(-1).processedDrafts, 2);

    const failedIndex = fixture.modifications.findIndex((item) => item.sku === failedArticle);
    assert.notEqual(failedIndex, -1);
    const publishedIndex = failedIndex === 0 ? 1 : 0;
    assert.equal((await pool.query(`
      SELECT publish_status FROM search_horoshop_photo_drafts WHERE id = $1
    `, [fixture.drafts[failedIndex].id])).rows[0].publish_status, 'failed');
    assert.equal((await pool.query(`
      SELECT publish_status FROM search_horoshop_photo_drafts WHERE id = $1
    `, [fixture.drafts[publishedIndex].id])).rows[0].publish_status, 'published');

    round = 2;
    callsInRound = 0;
    const retry = await service.publishSelection(fixture.selection.id, {
      mode: 'append',
      userId: ids.admin
    });
    assert.deepEqual(retry, {
      publishedDrafts: 1,
      publishedArticles: 1,
      failedDrafts: 0,
      failedArticles: 0,
      failures: []
    });
    assert.deepEqual(imports.filter((item) => item.round === 2).map((item) => item.products[0].article), [failedArticle]);
    await assert.rejects(
      () => service.publishSelection(fixture.selection.id, { mode: 'append', userId: ids.admin }),
      (error) => error?.code === 'HOROSHOP_PHOTO_PUBLICATION_EMPTY'
    );

    const directIndex = failedIndex;
    await service.selectAssets(fixture.drafts[directIndex].id, [fixture.photoAssetIds[directIndex]]);
    round = 3;
    await assert.rejects(
      () => service.publishDraft(fixture.drafts[directIndex].id, { mode: 'append', userId: ids.admin }),
      (error) => error?.code === 'HOROSHOP_PHOTO_PUBLISH_TIMEOUT'
        && error.message.includes(failedArticle)
        && !error.message.includes('single draft failed remotely')
    );
    const failedDirect = await pool.query(`
      SELECT publish_status FROM search_horoshop_photo_drafts WHERE id = $1
    `, [fixture.drafts[directIndex].id]);
    assert.equal(failedDirect.rows[0].publish_status, 'failed');
  } finally {
    await removePublicationFixture(fixture);
  }
});

test('publication preflight rejects invalid URLs and oversized assets without leaving publishing state', async () => {
  let importCalls = 0;
  const service = new HoroshopPhotoService({
    databasePool: pool,
    publicOrigin: 'https://panel.example',
    catalogService: { runExclusiveExternalWrite: (operation) => operation() },
    clientFactory: () => ({
      async authenticate() { return 'token'; },
      async importCatalog() { importCalls += 1; return {}; }
    })
  });
  const fixture = await createPublicationFixture(service, 1);
  try {
    await addPublicationAsset(fixture, fixture.drafts[0].id, { url: 'ftp://files.example/photo.webp' });
    await assert.rejects(
      () => service.publishDraft(fixture.drafts[0].id, { mode: 'replace', userId: ids.admin }),
      (error) => error?.code === 'HOROSHOP_PHOTO_URL_INVALID'
        && error.message.includes(fixture.modifications[0].sku)
    );
    assert.equal((await pool.query(`
      SELECT publish_status FROM search_horoshop_photo_drafts WHERE id = $1
    `, [fixture.drafts[0].id])).rows[0].publish_status, 'draft');

    await pool.query(`
      UPDATE media_library_assets
      SET url = '/media/catalog/library/oversized.webp', size_bytes = $2
      WHERE id = $1
    `, [fixture.mediaAssetIds[0], (5 * 1024 * 1024) + 1]);
    await assert.rejects(
      () => service.publishDraft(fixture.drafts[0].id, { mode: 'replace', userId: ids.admin }),
      (error) => error?.code === 'HOROSHOP_PHOTO_ASSET_TOO_LARGE'
        && error.message.includes(fixture.modifications[0].sku)
    );
    assert.equal((await pool.query(`
      SELECT publish_status FROM search_horoshop_photo_drafts WHERE id = $1
    `, [fixture.drafts[0].id])).rows[0].publish_status, 'draft');
    assert.equal(importCalls, 0);
  } finally {
    await removePublicationFixture(fixture);
  }
});

test('publication excludes inactive products and modifications before calling Horoshop', async () => {
  let importCalls = 0;
  const service = new HoroshopPhotoService({
    databasePool: pool,
    publicOrigin: 'https://panel.example',
    catalogService: { runExclusiveExternalWrite: (operation) => operation() },
    clientFactory: () => ({
      async authenticate() { return 'token'; },
      async importCatalog() { importCalls += 1; return {}; }
    })
  });
  const fixture = await createPublicationFixture(service, 1);
  try {
    await addPublicationAsset(fixture, fixture.drafts[0].id);
    await pool.query('UPDATE search_horoshop_products SET active = FALSE WHERE id = $1', [fixture.productId]);
    await assert.rejects(
      () => service.publishSelection(fixture.selection.id, { mode: 'replace', userId: ids.admin }),
      (error) => error?.code === 'HOROSHOP_PHOTO_PUBLICATION_EMPTY'
    );
    await assert.rejects(
      () => service.publishDraft(fixture.drafts[0].id, { mode: 'replace', userId: ids.admin }),
      (error) => error?.code === 'HOROSHOP_PHOTO_TARGET_INACTIVE'
        && error.message.includes(fixture.modifications[0].sku)
    );

    await pool.query('UPDATE search_horoshop_products SET active = TRUE WHERE id = $1', [fixture.productId]);
    await pool.query('UPDATE search_horoshop_modifications SET active = FALSE WHERE id = $1', [fixture.modifications[0].id]);
    await assert.rejects(
      () => service.publishSelection(fixture.selection.id, { mode: 'replace', userId: ids.admin }),
      (error) => error?.code === 'HOROSHOP_PHOTO_PUBLICATION_EMPTY'
    );
    await assert.rejects(
      () => service.publishDraft(fixture.drafts[0].id, { mode: 'replace', userId: ids.admin }),
      (error) => error?.code === 'HOROSHOP_PHOTO_TARGET_INACTIVE'
        && error.message.includes(fixture.modifications[0].sku)
    );
    assert.equal((await pool.query(`
      SELECT publish_status FROM search_horoshop_photo_drafts WHERE id = $1
    `, [fixture.drafts[0].id])).rows[0].publish_status, 'draft');
    assert.equal(importCalls, 0);
  } finally {
    await removePublicationFixture(fixture);
  }
});

test('per-article claim rolls back atomically when one grouped draft becomes stale', async () => {
  let importCalls = 0;
  let staleDraftId = '';
  const service = new HoroshopPhotoService({
    databasePool: pool,
    publicOrigin: 'https://panel.example',
    catalogService: { runExclusiveExternalWrite: (operation) => operation() },
    clientFactory: () => ({
      async authenticate() {
        await pool.query(`
          UPDATE search_horoshop_photo_drafts SET publish_status = 'published' WHERE id = $1
        `, [staleDraftId]);
        return 'token';
      },
      async importCatalog() { importCalls += 1; return {}; }
    })
  });
  const fixture = await createPublicationFixture(service, 1);
  try {
    await pool.query(`
      UPDATE search_horoshop_modifications SET sku = $2 WHERE id = $1
    `, [fixture.modifications[0].id, fixture.productSku]);
    fixture.modifications[0].sku = fixture.productSku;
    await addPublicationAsset(fixture, fixture.drafts[0].id);
    const commonDraft = await service.saveDraft({
      productId: fixture.productId,
      sourceUrl: 'https://supplier.example/common-gallery',
      userId: ids.admin
    });
    await addPublicationAsset(fixture, commonDraft.id);
    staleDraftId = fixture.drafts[0].id;

    const result = await service.publishDraftIds({
      draftIds: [commonDraft.id, fixture.drafts[0].id],
      mode: 'replace',
      userId: ids.admin
    });
    assert.equal(result.publishedDrafts, 0);
    assert.equal(result.publishedArticles, 0);
    assert.equal(result.failedDrafts, 2);
    assert.equal(result.failedArticles, 1);
    assert.equal(result.failures[0].code, 'HOROSHOP_PHOTO_DRAFT_NOT_PUBLISHABLE');
    assert.equal(importCalls, 0);

    const states = await Promise.all([commonDraft.id, fixture.drafts[0].id].map(async (draftId) => (
      await pool.query('SELECT publish_status FROM search_horoshop_photo_drafts WHERE id = $1', [draftId])
    ).rows[0].publish_status));
    assert.deepEqual(states, ['draft', 'published']);
  } finally {
    await removePublicationFixture(fixture);
  }
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

test('desktop batch with two modifications advances from 50 to 100 percent without stale runs', async () => {
  const { photoService, desktopService } = createDesktopHarness();
  const selection = await photoService.createSelection({
    name: 'Two modification progress',
    entries: ['PHONE-1'],
    userId: ids.admin
  });
  const pairing = await desktopService.createPairing(ids.admin);
  const claimed = await desktopService.claimPairing({
    code: pairing.manualCode,
    deviceName: 'Two target parser',
    appVersion: '0.9.3',
    installationId: randomUUID(),
    capabilities: { upload: true }
  });
  const device = await desktopService.authenticate(claimed.accessToken);
  const jobs = await desktopService.listJobs(device);
  assert.equal(jobs.length, 2);
  assert.equal(new Set(jobs.map((item) => item.batchId)).size, 1);

  const image = await sharp({
    create: { width: 900, height: 900, channels: 3, background: '#3a76ff' }
  }).webp().toBuffer();
  for (const [index, queuedJob] of jobs.entries()) {
    const job = await desktopService.claimJob(device, queuedJob.id);
    await desktopService.uploadAsset(device, job.id, {
      buffer: image,
      sourceUrl: `https://supplier.example/two-targets/${index + 1}.webp`,
      sortOrder: 0,
      originalName: `${job.sku}-${index + 1}.webp`
    });
    await desktopService.completeJob(device, job.id, {
      sourceUrl: `https://supplier.example/two-targets/${index + 1}`,
      adapterId: 'builtin-test',
      foundCount: 1,
      errors: []
    });
    const progress = await photoService.loadBatch(job.batchId);
    if (index === 0) {
      assert.equal(progress.status, 'queued');
      assert.deepEqual(progress.counts, { queued: 1, running: 0, success: 1, partial: 0, failed: 0 });
    } else {
      assert.equal(progress.status, 'completed');
      assert.deepEqual(progress.counts, { queued: 0, running: 0, success: 2, partial: 0, failed: 0 });
    }
  }

  const finalized = await pool.query(`
    SELECT draft.parse_status, draft.source_run_id, COUNT(asset.id)::INTEGER AS asset_count
    FROM search_horoshop_photo_drafts AS draft
    INNER JOIN search_horoshop_photo_assets AS asset ON asset.draft_id = draft.id
    WHERE draft.source_selection_id = $1
    GROUP BY draft.id, draft.parse_status, draft.source_run_id
    ORDER BY draft.id
  `, [selection.id]);
  assert.equal(finalized.rows.length, 2);
  assert.ok(finalized.rows.every((row) => row.parse_status === 'ready' && row.source_run_id && row.asset_count === 1));
  assert.equal(await photoService.activeBatch({ selectionId: selection.id, userId: ids.admin }), null);
  assert.deepEqual(await desktopService.listJobs(device), []);

  const finalizedMediaIds = await pool.query(`
    SELECT asset.media_asset_id
    FROM search_horoshop_photo_assets AS asset
    INNER JOIN search_horoshop_photo_drafts AS draft ON draft.id = asset.draft_id
    WHERE draft.source_selection_id = $1
  `, [selection.id]);
  await photoService.deleteSelection(selection.id);
  assert.equal((await pool.query(`
    SELECT COUNT(*)::INTEGER AS asset_count
    FROM search_horoshop_photo_assets
    WHERE media_asset_id = ANY($1::uuid[])
  `, [finalizedMediaIds.rows.map((row) => row.media_asset_id)])).rows[0].asset_count, 0);
  assert.equal((await pool.query(`
    SELECT COUNT(*)::INTEGER AS media_count
    FROM media_library_assets
    WHERE id = ANY($1::uuid[])
  `, [finalizedMediaIds.rows.map((row) => row.media_asset_id)])).rows[0].media_count, 0);
  await desktopService.revokeDevice(device.userId, device.id);
});

test('desktop parser pairs securely, claims a selection and completes a reviewable draft', async () => {
  const { photoService, desktopService } = createDesktopHarness();
  const selection = await photoService.createSelection({
    name: 'Desktop parser flow',
    entries: ['PHONE-2'],
    userId: ids.admin
  });
  const pairing = await desktopService.createPairing(ids.admin);
  const claimed = await desktopService.claimPairing({
    code: pairing.manualCode,
    deviceName: 'Test Windows parser',
    appVersion: '0.9.0',
    installationId: randomUUID(),
    capabilities: { upload: true }
  });
  const device = await desktopService.authenticate(claimed.accessToken);
  const jobs = await desktopService.listJobs(device);

  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].selectionId, selection.id);
  assert.equal(jobs[0].sku, 'PHONE-2');
  assert.equal(jobs[0].title, 'Смартфон з однаковою назвою');
  assert.deepEqual((await desktopService.listJobs(device)).map((item) => item.id), [jobs[0].id]);

  const job = await desktopService.claimJob(device, jobs[0].id);
  await desktopService.saveSource(device, job.id, {
    sourceUrl: 'https://supplier.example/phone-2',
    adapterId: 'builtin-test'
  });
  const image = await sharp({
    create: { width: 900, height: 900, channels: 3, background: '#ffd500' }
  }).webp().toBuffer();
  await desktopService.uploadAsset(device, job.id, {
    buffer: image,
    sourceUrl: 'https://supplier.example/phone-2/front.webp',
    sortOrder: 0,
    originalName: 'PHONE-2-1.webp'
  });
  const replaceDraftAssets = photoService.replaceDraftAssets.bind(photoService);
  photoService.replaceDraftAssets = async (run, prepared, options) => {
    assert.equal(run.id, job.id);
    assert.equal(prepared.length, 1);
    assert.ok(options?.db, 'asset replacement must share the completion transaction');
    throw new Error('Simulated failure during atomic finalization');
  };
  try {
    await assert.rejects(
      () => desktopService.completeJob(device, job.id, {
        sourceUrl: 'https://supplier.example/phone-2',
        adapterId: 'builtin-test',
        foundCount: 1,
        errors: []
      }),
      /Simulated failure during atomic finalization/
    );
  } finally {
    photoService.replaceDraftAssets = replaceDraftAssets;
  }
  const rolledBack = await pool.query(`
    SELECT run.status, draft.parse_status, COALESCE(upload.upload_count, 0)::INTEGER AS upload_count
    FROM search_horoshop_photo_runs AS run
    INNER JOIN search_horoshop_photo_drafts AS draft ON draft.id = run.draft_id
    LEFT JOIN (
      SELECT run_id, COUNT(*)::INTEGER AS upload_count
      FROM search_horoshop_photo_run_uploads
      GROUP BY run_id
    ) AS upload ON upload.run_id = run.id
    WHERE run.id = $1
  `, [job.id]);
  assert.deepEqual(rolledBack.rows[0], { status: 'running', parse_status: 'running', upload_count: 1 });

  const stagedUpload = await pool.query(`
    SELECT media_asset_id, source_url, content_sha256, sort_order
    FROM search_horoshop_photo_run_uploads
    WHERE run_id = $1
  `, [job.id]);
  await pool.query(`
    INSERT INTO search_horoshop_photo_assets (
      draft_id, media_asset_id, source_url, content_sha256, selected, sort_order
    ) VALUES ($1, $2, $3, $4, TRUE, $5)
  `, [
    jobs[0].draftId,
    stagedUpload.rows[0].media_asset_id,
    stagedUpload.rows[0].source_url,
    stagedUpload.rows[0].content_sha256,
    stagedUpload.rows[0].sort_order
  ]);
  await pool.query(`
    UPDATE search_horoshop_photo_drafts
    SET parse_status = 'ready', source_selection_id = $2, source_run_id = NULL
    WHERE id = $1
  `, [jobs[0].draftId, selection.id]);

  const refreshBatch = photoService.refreshBatch.bind(photoService);
  photoService.refreshBatch = async () => {
    throw new Error('Simulated derived batch refresh failure');
  };
  let completed;
  try {
    completed = await desktopService.completeJob(device, job.id, {
      sourceUrl: 'https://supplier.example/phone-2',
      adapterId: 'builtin-test',
      foundCount: 1,
      errors: []
    });
    const derivedBatch = await photoService.loadBatch(job.batchId);
    assert.equal(derivedBatch.status, 'completed');
    assert.deepEqual(derivedBatch.counts, { queued: 0, running: 0, success: 1, partial: 0, failed: 0 });
  } finally {
    photoService.refreshBatch = refreshBatch;
  }
  await refreshBatch(job.batchId);
  const draft = await pool.query(`
    SELECT parse_status, publish_status, source_url, source_selection_id, source_run_id
    FROM search_horoshop_photo_drafts WHERE id = $1
  `, [jobs[0].draftId]);
  const assets = await pool.query(`
    SELECT media_asset_id FROM search_horoshop_photo_assets WHERE draft_id = $1
  `, [jobs[0].draftId]);

  assert.deepEqual(completed, { status: 'success', foundCount: 1, savedCount: 1, errors: [] });
  assert.equal(draft.rows[0].parse_status, 'ready');
  assert.equal(draft.rows[0].publish_status, 'draft');
  assert.equal(draft.rows[0].source_url, 'https://supplier.example/phone-2');
  assert.equal(draft.rows[0].source_selection_id, selection.id);
  assert.equal(draft.rows[0].source_run_id, job.id);
  assert.equal(assets.rows.length, 1);
  assert.deepEqual(await desktopService.completeJob(device, job.id, {
    sourceUrl: 'https://supplier.example/phone-2',
    adapterId: 'builtin-test',
    foundCount: 1,
    errors: []
  }), completed);
  assert.equal((await pool.query(`
    SELECT COUNT(*)::INTEGER AS asset_count
    FROM search_horoshop_photo_assets
    WHERE draft_id = $1
  `, [jobs[0].draftId])).rows[0].asset_count, 1);

  await pool.query(`
    UPDATE search_horoshop_photo_drafts
    SET source_run_id = NULL, parse_status = 'queued'
    WHERE id = $1
  `, [jobs[0].draftId]);
  const recoveredTerminalBatch = await photoService.loadBatch(job.batchId);
  const recoveredTerminalDraft = await pool.query(`
    SELECT source_run_id, parse_status
    FROM search_horoshop_photo_drafts
    WHERE id = $1
  `, [jobs[0].draftId]);
  assert.equal(recoveredTerminalBatch.status, 'completed');
  assert.deepEqual(recoveredTerminalDraft.rows[0], { source_run_id: job.id, parse_status: 'ready' });

  const finishedRun = await pool.query(`
    SELECT created_at, completed_at
    FROM search_horoshop_photo_runs
    WHERE id = $1
  `, [job.id]);
  const duplicateSelection = await photoService.createSelection({
    name: 'Concurrent selection for the same draft',
    entries: ['PHONE-2'],
    userId: ids.admin
  });
  const duplicateBatch = await pool.query(`
    INSERT INTO search_horoshop_photo_batches (
      connection_id, generation, selection_id, selection_based,
      requested_count, created_by, created_at
    ) VALUES ($1, $2, $3, TRUE, 1, $4, $5)
    RETURNING id
  `, [ids.connection, ids.generation, duplicateSelection.id, ids.admin, finishedRun.rows[0].created_at]);
  const duplicateRun = await pool.query(`
    INSERT INTO search_horoshop_photo_runs (
      batch_id, draft_id, source_url, executor, created_at
    ) VALUES ($1, $2, '', 'desktop', $3)
    RETURNING id
  `, [duplicateBatch.rows[0].id, jobs[0].draftId, finishedRun.rows[0].created_at]);
  await pool.query(`
    UPDATE search_horoshop_photo_drafts
    SET source_run_id = $2
    WHERE id = $1
  `, [jobs[0].draftId, duplicateRun.rows[0].id]);

  const repairedBatch = await photoService.loadBatch(duplicateBatch.rows[0].id);
  assert.equal(repairedBatch.status, 'completed');
  assert.deepEqual(repairedBatch.counts, { queued: 0, running: 0, success: 1, partial: 0, failed: 0 });
  assert.equal(repairedBatch.items[0].savedCount, 1);
  assert.equal((await desktopService.listJobs(device)).length, 0);

  await pool.query(`
    UPDATE search_horoshop_photo_drafts
    SET source_run_id = NULL, source_selection_id = $2, parse_status = 'ready'
    WHERE id = $1
  `, [jobs[0].draftId, selection.id]);
  const intentionalRetry = await photoService.createBatch({
    selectionId: selection.id,
    userId: ids.admin,
    executor: 'desktop'
  });
  assert.equal(intentionalRetry.counts.queued, 1);
  assert.equal((await photoService.loadBatch(intentionalRetry.id)).counts.queued, 1);
  await pool.query('DELETE FROM search_horoshop_photo_batches WHERE id = $1', [intentionalRetry.id]);
  await pool.query("UPDATE search_horoshop_photo_drafts SET parse_status = 'ready' WHERE id = $1", [jobs[0].draftId]);

  await photoService.deleteSelection(selection.id);
  const discardedDraft = await pool.query(`
    SELECT parse_status, publish_status, source_url, source_selection_id, found_count
    FROM search_horoshop_photo_drafts WHERE id = $1
  `, [jobs[0].draftId]);
  const discardedPhotos = await pool.query(`
    SELECT id FROM search_horoshop_photo_assets WHERE draft_id = $1
  `, [jobs[0].draftId]);
  const discardedMedia = await pool.query(`
    SELECT id FROM media_library_assets WHERE id = $1
  `, [assets.rows[0].media_asset_id]);
  assert.deepEqual(discardedDraft.rows[0], {
    parse_status: 'idle',
    publish_status: 'draft',
    source_url: '',
    source_selection_id: null,
    found_count: 0
  });
  assert.equal(discardedPhotos.rows.length, 0);
  assert.equal(discardedMedia.rows.length, 0);

  const recreatedSelection = await photoService.createSelection({
    name: 'Recreated after discarding unpublished photos',
    entries: ['PHONE-2'],
    userId: ids.admin
  });
  assert.deepEqual(recreatedSelection.products[0].commonDraft.assets, []);
  assert.deepEqual(recreatedSelection.products[0].commonDraft.currentImages, [
    'https://photo-shop.example/current-phone-2.webp'
  ]);
  const legacyMediaId = randomUUID();
  const legacyPhotoId = randomUUID();
  const legacyHash = legacyMediaId.replaceAll('-', '').padEnd(64, '0');
  const legacyFolder = await pool.query(`
    SELECT media_folder_id FROM search_horoshop_photo_drafts WHERE id = $1
  `, [jobs[0].draftId]);
  await pool.query(`
    INSERT INTO media_library_assets (
      id, original_name, storage_key, url, mime_type, size_bytes,
      original_size_bytes, width, height, content_sha256, folder_id
    ) VALUES ($1, 'legacy.webp', $2, $3, 'image/webp', 100, 100, 900, 900, $4, $5)
  `, [
    legacyMediaId,
    `legacy-${legacyMediaId}.webp`,
    `/media/catalog/library/legacy-${legacyMediaId}.webp`,
    legacyHash,
    legacyFolder.rows[0].media_folder_id
  ]);
  await pool.query(`
    INSERT INTO search_horoshop_photo_assets (
      id, draft_id, media_asset_id, source_url, content_sha256, selected, sort_order
    ) VALUES ($1, $2, $3, 'https://legacy.example/photo.webp', $4, TRUE, 0)
  `, [legacyPhotoId, jobs[0].draftId, legacyMediaId, legacyHash]);
  await pool.query(`
    UPDATE search_horoshop_photo_drafts
    SET parse_status = 'ready', publish_status = 'draft', source_selection_id = NULL,
        source_run_id = NULL,
        source_url = 'https://legacy.example/product', found_count = 1
    WHERE id = $1
  `, [jobs[0].draftId]);
  await photoService.deleteSelection(recreatedSelection.id);
  const legacyPhotosAfterDelete = await pool.query(`
    SELECT id FROM search_horoshop_photo_assets WHERE id = $1
  `, [legacyPhotoId]);
  const legacyMediaAfterDelete = await pool.query(`
    SELECT id FROM media_library_assets WHERE id = $1
  `, [legacyMediaId]);
  assert.equal(legacyPhotosAfterDelete.rows.length, 0);
  assert.equal(legacyMediaAfterDelete.rows.length, 0);
  await photoService.deleteSelection(duplicateSelection.id);

  const newSelection = await photoService.createSelection({
    name: 'Created after pairing',
    entries: ['PHONE-1-BLUE'],
    userId: ids.admin
  });
  const newJobs = await desktopService.listJobs(device);
  assert.equal(newJobs.length, 1);
  assert.equal(newJobs[0].selectionId, newSelection.id);
  assert.equal(newJobs[0].sku, 'PHONE-1-BLUE');
  assert.equal(newJobs[0].title, 'Смартфон Example One');
  assert.deepEqual((await desktopService.listJobs(device)).map((item) => item.id), [newJobs[0].id]);

  await photoService.deleteSelection(newSelection.id);
  assert.deepEqual(await desktopService.listJobs(device), []);
  const deletedBatch = await pool.query('SELECT id FROM search_horoshop_photo_batches WHERE id = $1', [newJobs[0].batchId]);
  assert.equal(deletedBatch.rows.length, 0);

  const cascadedSelection = await photoService.createSelection({
    name: 'Deleted outside photo service',
    entries: ['PHONE-1-BLACK'],
    userId: ids.admin
  });
  const cascadedJobs = await desktopService.listJobs(device);
  assert.equal(cascadedJobs.length, 1);
  assert.equal(cascadedJobs[0].selectionId, cascadedSelection.id);

  await pool.query('DELETE FROM search_horoshop_photo_selections WHERE id = $1', [cascadedSelection.id]);

  assert.deepEqual(await desktopService.listJobs(device), []);
  const cascadedBatch = await pool.query('SELECT id FROM search_horoshop_photo_batches WHERE id = $1', [cascadedJobs[0].batchId]);
  assert.equal(cascadedBatch.rows.length, 0);

  const legacySelection = await photoService.createSelection({
    name: 'Legacy orphaned queue',
    entries: ['PHONE-1'],
    userId: ids.admin
  });
  const legacyJobs = await desktopService.listJobs(device);
  assert.equal(legacyJobs.length, 2);
  await pool.query(`
    UPDATE search_horoshop_photo_runs SET source_url = 'https://supplier.example/legacy'
    WHERE id = $1
  `, [legacyJobs[0].id]);
  await pool.query(`
    UPDATE search_horoshop_photo_batches SET selection_id = NULL WHERE id = $1
  `, [legacyJobs[0].batchId]);
  await pool.query('DELETE FROM search_horoshop_photo_selections WHERE id = $1', [legacySelection.id]);

  assert.equal(await photoService.activeBatch(), null);
  assert.deepEqual(await desktopService.listJobs(device), []);
  const legacyBatch = await pool.query('SELECT id FROM search_horoshop_photo_batches WHERE id = $1', [legacyJobs[0].batchId]);
  assert.equal(legacyBatch.rows.length, 0);

  await desktopService.revokeDevice(device.userId, device.id);
  await assert.rejects(
    () => desktopService.authenticate(claimed.accessToken),
    (error) => error?.code === 'PHOTO_DESKTOP_DEVICE_REVOKED'
  );
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
