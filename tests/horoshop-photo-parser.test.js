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

  assert.deepEqual(result, { publishedDrafts: 1, publishedArticles: 1 });
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

  await service.deleteSelection(selectionId);
  const publishedDraft = await pool.query(`
    SELECT publish_status FROM search_horoshop_photo_drafts WHERE id = $1
  `, [black.id]);
  const publishedAssets = await pool.query(`
    SELECT id FROM search_horoshop_photo_assets WHERE draft_id = $1
  `, [black.id]);
  assert.equal(publishedDraft.rows[0].publish_status, 'published');
  assert.equal(publishedAssets.rows.length, 1);
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

test('desktop parser pairs securely, claims a selection and completes a reviewable draft', async () => {
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
  } finally {
    photoService.refreshBatch = refreshBatch;
  }
  await refreshBatch(job.batchId);
  const draft = await pool.query(`
    SELECT parse_status, publish_status, source_url, source_selection_id
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
  assert.equal(assets.rows.length, 1);

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
  await pool.query(`
    INSERT INTO search_horoshop_photo_runs (
      batch_id, draft_id, source_url, executor, created_at
    ) VALUES ($1, $2, '', 'desktop', $3)
  `, [duplicateBatch.rows[0].id, jobs[0].draftId, finishedRun.rows[0].created_at]);

  const repairedBatch = await photoService.loadBatch(duplicateBatch.rows[0].id);
  assert.equal(repairedBatch.status, 'completed');
  assert.deepEqual(repairedBatch.counts, { queued: 0, running: 0, success: 1, partial: 0, failed: 0 });
  assert.equal(repairedBatch.items[0].savedCount, 1);
  assert.equal((await desktopService.listJobs(device)).length, 0);

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
