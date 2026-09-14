import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { JSDOM } from 'jsdom';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.FORM_CAMPAIGN_TEST_DATABASE_URL || 'pg-mem://form-campaigns-tests';
process.env.JWT_SECRET = 'form-campaigns-test-secret-0123456789';
process.env.COOKIE_SECURE = 'false';
process.env.APP_ORIGIN = 'https://panel.example.com';
process.env.ADMIN_NAME = 'Form Campaign Admin';
process.env.ADMIN_EMAIL = 'form-campaign-admin@test.local';
process.env.ADMIN_PASSWORD = 'AdminPassword123!';

const { default: app } = await import('../src/app.js');
const { pool } = await import('../src/db/pool.js');
const { runMigrations } = await import('../src/db/migrate.js');
const { ensureBootstrapAdmin } = await import('../src/modules/users/user.service.js');
const { formCampaignEmbedScript } = await import('../src/modules/applications/form-campaign.service.js');

const admin = request.agent(app);
const connectionId = randomUUID();
const generation = randomUUID();
const syncId = randomUUID();
const productId = randomUUID();
const otherProductId = randomUUID();
const blueModificationId = randomUUID();
const blackModificationId = randomUUID();

const placement = {
  desktop: { selector: '#desktop-buy', insertPosition: 'after' },
  mobile: { selector: '#mobile-buy', insertPosition: 'start' }
};

const buttonStyles = {
  backgroundColor: '#172033',
  color: '#ffffff',
  borderRadius: '14px',
  padding: '12px 18px',
  fontWeight: '700',
  fontSize: '16px'
};

before(async () => {
  await runMigrations();
  await ensureBootstrapAdmin();
  await admin.post('/api/auth/login').send({
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD
  }).expect(200);

  await pool.query(`
    INSERT INTO search_horoshop_connections (
      id, generation, store_domain, encrypted_credentials, status, last_sync_at
    ) VALUES ($1, $2, 'shop.example.com', 'ciphertext', 'connected', NOW())
  `, [connectionId, generation]);
  await pool.query(`
    INSERT INTO search_horoshop_categories (
      id, connection_id, generation, external_id, titles, active, last_seen_sync_id
    ) VALUES
      ($1, $3, $4, 'smartphones', $5::JSONB, TRUE, $7),
      ($2, $3, $4, 'laptops', $6::JSONB, TRUE, $7)
  `, [randomUUID(), randomUUID(), connectionId, generation,
    JSON.stringify({ uk: 'Смартфони' }), JSON.stringify({ uk: 'Ноутбуки' }), syncId]);
  await pool.query(`
    INSERT INTO search_horoshop_stickers (
      id, connection_id, generation, external_id, title, enabled, active, last_seen_sync_id
    ) VALUES ($1, $2, $3, 'preorder', 'Передзамовлення', TRUE, TRUE, $4)
  `, [randomUUID(), connectionId, generation, syncId]);
  await pool.query(`
    INSERT INTO search_horoshop_products (
      id, connection_id, generation, external_id, sku, titles, brand,
      category_external_id, price, old_price, currency, availability, visible,
      primary_image_url, canonical_url, stickers, active, last_seen_sync_id
    ) VALUES (
      $1, $2, $3, 'iphone-17', 'IPHONE-17', $4::JSONB, 'Apple',
      'smartphones', '46999', '48999', 'UAH', 'Немає в наявності', TRUE,
      'https://cdn.example.com/iphone-17.webp',
      'https://shop.example.com/iphone-17/', $5::JSONB, TRUE, $6
    )
  `, [productId, connectionId, generation, JSON.stringify({ uk: 'Apple iPhone 17' }),
    JSON.stringify([{ id: 'preorder', title: 'Передзамовлення' }]), syncId]);
  await pool.query(`
    INSERT INTO search_horoshop_products (
      id, connection_id, generation, external_id, sku, titles, brand,
      category_external_id, price, currency, availability, visible,
      canonical_url, active, last_seen_sync_id
    ) VALUES (
      $1, $2, $3, 'laptop-1', 'LAPTOP-1', $4::JSONB, 'Example',
      'laptops', '29999', 'UAH', 'В наявності', TRUE,
      'https://shop.example.com/laptop-1/', TRUE, $5
    )
  `, [otherProductId, connectionId, generation, JSON.stringify({ uk: 'Ноутбук Example' }), syncId]);
  await pool.query(`
    INSERT INTO search_horoshop_modifications (
      id, connection_id, product_id, generation, external_id, sku, titles,
      price, old_price, currency, availability, visible, image_url, page_url,
      active, last_seen_sync_id
    ) VALUES
      ($1, $3, $4, $5, 'iphone-17:blue', 'IPHONE-17-BLUE', $6::JSONB,
       '47999', '49999', 'UAH', 'Немає в наявності', TRUE,
       'https://cdn.example.com/iphone-17-blue.webp',
       'https://shop.example.com/iphone-17-blue/', TRUE, $7),
      ($2, $3, $4, $5, 'iphone-17:black', 'IPHONE-17-BLACK', $8::JSONB,
       '46999', NULL, 'UAH', 'В наявності', TRUE,
       'https://cdn.example.com/iphone-17-black.webp',
       'https://shop.example.com/iphone-17-black/', TRUE, $7)
  `, [blueModificationId, blackModificationId, connectionId, productId, generation,
    JSON.stringify({ uk: 'Apple iPhone 17 Blue' }), syncId,
    JSON.stringify({ uk: 'Apple iPhone 17 Black' })]);
});

after(async () => pool.end());

function formInput(form) {
  return {
    name: form.name,
    title: 'Передзамовлення товару',
    description: 'Залиште контакти, і ми повідомимо про надходження.',
    buttonText: 'Надіслати заявку',
    successMessage: 'Заявку прийнято.',
    settings: {},
    styles: {},
    fields: [
      {
        key: 'contact_name', label: 'Ваше ім’я', type: 'text', placeholder: '', helpText: '',
        defaultValue: '', required: true, active: true, system: false,
        systemFieldType: null, showInSummary: true, sortOrder: 0, validation: {}, options: []
      },
      {
        key: 'quantity', label: 'Кількість', type: 'number', placeholder: '', helpText: '',
        defaultValue: '1', required: true, active: true, system: false,
        systemFieldType: null, showInSummary: true, sortOrder: 1, validation: {}, options: []
      },
      {
        key: 'comment', label: 'Коментар', type: 'textarea', placeholder: '', helpText: '',
        defaultValue: '', required: false, active: true, system: false,
        systemFieldType: null, showInSummary: false, sortOrder: 2, validation: {}, options: []
      }
    ]
  };
}

function campaignInput(formId, targets, overrides = {}) {
  return {
    formId,
    name: 'Передзамовлення iPhone 17 Blue',
    priority: 300,
    buttonText: 'Передзамовити',
    buttonStyles,
    placement,
    availabilityMode: 'all',
    targetMode: 'products',
    categoryExternalId: null,
    stickerExternalId: null,
    startsAt: null,
    endsAt: null,
    targets,
    ...overrides
  };
}

test('preorder placement targets an exact Horoshop modification and creates an application from trusted catalog data', async () => {
  const createdForm = (await admin.post('/api/forms').send({
    name: 'Preorder form',
    title: 'Preorder form',
    description: '',
    buttonText: 'Send',
    successMessage: 'Done',
    settings: {},
    styles: {}
  }).expect(201)).body.data;
  assert.deepEqual(createdForm.fields, []);

  const configuredForm = (await admin.put(`/api/forms/${createdForm.id}`)
    .send(formInput(createdForm)).expect(200)).body.data;
  assert.equal(configuredForm.fields.every((field) => field.system === false), true);
  assert.deepEqual(configuredForm.fields.filter((field) => field.required).map((field) => field.key), [
    'contact_name', 'quantity'
  ]);
  await admin.post('/api/form-campaigns')
    .send(campaignInput(createdForm.id, [{ productId, modificationId: blueModificationId }]))
    .expect(422)
    .expect((response) => assert.equal(response.body.error.code, 'FORM_CAMPAIGN_FORM_NOT_PUBLISHED'));
  await admin.patch(`/api/forms/${createdForm.id}/publish`).expect(200);

  const catalog = (await admin.get('/api/form-campaigns/catalog').expect(200)).body.data;
  assert.equal(catalog.integration.storeDomain, 'shop.example.com');
  assert.equal(catalog.items.find((item) => item.id === productId).modifications.length, 2);
  assert.deepEqual(catalog.stickers, [{ externalId: 'preorder', title: 'Передзамовлення' }]);

  const campaign = (await admin.post('/api/form-campaigns')
    .send(campaignInput(createdForm.id, [{ productId, modificationId: blueModificationId }]))
    .expect(201)).body.data;
  assert.equal(campaign.status, 'draft');
  assert.equal(campaign.targets.length, 1);
  assert.equal(campaign.targets[0].modificationId, blueModificationId);

  const embedCode = (await admin.get('/api/form-campaigns/embed-code')
    .set('Host', 'panel.example.com').set('X-Forwarded-Proto', 'https').expect(200)).body.data.code;
  assert.equal(embedCode, '<script async src="https://panel.example.com/api/public/application-form-campaigns/embed.js"></script>');

  const activationResponse = await admin.patch(`/api/form-campaigns/${campaign.id}/status`)
    .send({ status: 'active' });
  assert.equal(activationResponse.status, 200, JSON.stringify(activationResponse.body));
  const activated = activationResponse.body.data;
  assert.equal(activated.status, 'active');
  assert.ok(activated.publishedAt);

  const unrelatedModification = await request(app)
    .get('/api/public/application-form-campaigns/resolve')
    .set('Origin', 'https://shop.example.com')
    .query({
      pageUrl: 'https://shop.example.com/iphone-17-black/',
      article: 'IPHONE-17-BLACK',
      stockState: 'in_stock'
    })
    .expect(200);
  assert.equal(unrelatedModification.body.data, null);

  const resolved = await request(app)
    .get('/api/public/application-form-campaigns/resolve')
    .set('Origin', 'https://shop.example.com')
    .query({
      pageUrl: 'https://shop.example.com/iphone-17/',
      article: 'IPHONE-17-BLUE',
      stockState: 'out_of_stock'
    })
    .expect(200);
  assert.equal(resolved.body.data.campaign.publicId, campaign.publicId);
  assert.equal(resolved.body.data.form.publicId, createdForm.publicId);
  assert.equal(resolved.body.data.product.title, 'Apple iPhone 17 Blue');
  assert.equal(resolved.body.data.product.sku, 'IPHONE-17-BLUE');
  assert.equal(resolved.body.data.product.externalProductId, 'iphone-17');
  assert.equal(resolved.body.data.product.externalModificationId, 'iphone-17:blue');
  assert.ok(resolved.body.data.contextToken.length > 40);

  const resolvedByUniqueModificationUrl = await request(app)
    .get('/api/public/application-form-campaigns/resolve')
    .set('Origin', 'https://shop.example.com')
    .query({ pageUrl: 'https://shop.example.com/iphone-17-blue/' })
    .expect(200);
  assert.equal(resolvedByUniqueModificationUrl.body.data.product.externalModificationId, 'iphone-17:blue');

  const wrongOrigin = await request(app)
    .get('/api/public/application-form-campaigns/resolve')
    .set('Origin', 'https://attacker.example.com')
    .query({ pageUrl: 'https://shop.example.com/iphone-17-blue/', article: 'IPHONE-17-BLUE' })
    .expect(200);
  assert.equal(wrongOrigin.body.data, null);

  const submitted = await request(app)
    .post(`/api/public/application-form-campaigns/${campaign.publicId}/applications`)
    .set('Origin', 'https://shop.example.com')
    .send({
      values: { contact_name: 'Олена', quantity: '2', comment: 'Бажано синій' },
      product: { title: 'Spoofed product', sku: 'SPOOFED' },
      context: { sourceUrl: 'https://shop.example.com/iphone-17-blue/' },
      contextToken: resolved.body.data.contextToken,
      idempotencyKey: 'iphone-17-blue-preorder-1'
    })
    .expect(201);

  const application = (await admin.get(`/api/applications/${submitted.body.data.id}`).expect(200)).body.data;
  assert.equal(application.source, 'preorder_campaign');
  assert.equal(application.campaignId, campaign.id);
  assert.equal(application.campaignPublicId, campaign.publicId);
  assert.equal(application.campaignName, campaign.name);
  assert.equal(application.product.title, 'Apple iPhone 17 Blue');
  assert.equal(application.product.sku, 'IPHONE-17-BLUE');
  assert.equal(application.product.externalModificationId, 'iphone-17:blue');
  assert.equal(application.values.find((value) => value.key === 'quantity').value, '2');
  assert.match(application.history[0].comment, /Передзамовлення iPhone 17 Blue/u);

  await request(app)
    .post(`/api/public/application-form-campaigns/${campaign.publicId}/applications`)
    .set('Origin', 'https://shop.example.com')
    .send({
      values: { contact_name: 'Олена', quantity: '2' },
      context: { sourceUrl: 'https://shop.example.com/iphone-17-blue/' },
      contextToken: `${resolved.body.data.contextToken}x`
    })
    .expect(422)
    .expect((response) => assert.equal(response.body.error.code, 'FORM_CAMPAIGN_CONTEXT_INVALID'));

  const parentCampaign = (await admin.put(`/api/form-campaigns/${campaign.id}`)
    .send(campaignInput(createdForm.id, [
      { productId, modificationId: blueModificationId },
      { productId, modificationId: null }
    ], { name: 'Передзамовлення всіх iPhone 17' }))
    .expect(200)).body.data;
  assert.equal(parentCampaign.targets.length, 1);
  assert.equal(parentCampaign.targets[0].modificationId, null);

  const parentResolved = await request(app)
    .get('/api/public/application-form-campaigns/resolve')
    .set('Origin', 'https://shop.example.com')
    .query({
      pageUrl: 'https://shop.example.com/iphone-17-black/',
      article: 'IPHONE-17-BLACK',
      stockState: 'in_stock'
    })
    .expect(200);
  assert.equal(parentResolved.body.data.campaign.publicId, campaign.publicId);
  assert.equal(parentResolved.body.data.product.externalModificationId, 'iphone-17:black');

  const parentProductResolved = await request(app)
    .get('/api/public/application-form-campaigns/resolve')
    .set('Origin', 'https://shop.example.com')
    .query({ pageUrl: 'https://shop.example.com/iphone-17/' })
    .expect(200);
  assert.equal(parentProductResolved.body.data.campaign.publicId, campaign.publicId);
  assert.equal(parentProductResolved.body.data.product.externalModificationId, '');

  const allProductsCampaign = (await admin.put(`/api/form-campaigns/${campaign.id}`)
    .send(campaignInput(createdForm.id, [], {
      name: 'Кнопка на всіх товарах',
      targetMode: 'all_products'
    })).expect(200)).body.data;
  assert.equal(allProductsCampaign.targetMode, 'all_products');
  assert.equal(allProductsCampaign.targets.length, 0);
  const allProductsResolved = await request(app)
    .get('/api/public/application-form-campaigns/resolve')
    .set('Origin', 'https://shop.example.com')
    .query({ pageUrl: 'https://shop.example.com/laptop-1/', article: 'LAPTOP-1' })
    .expect(200);
  assert.equal(allProductsResolved.body.data.campaign.publicId, campaign.publicId);

  const categoryCampaign = (await admin.put(`/api/form-campaigns/${campaign.id}`)
    .send(campaignInput(createdForm.id, [], {
      name: 'Кнопка для смартфонів',
      targetMode: 'category',
      categoryExternalId: 'smartphones'
    })).expect(200)).body.data;
  assert.equal(categoryCampaign.categoryExternalId, 'smartphones');
  const categoryMatch = await request(app)
    .get('/api/public/application-form-campaigns/resolve')
    .set('Origin', 'https://shop.example.com')
    .query({ pageUrl: 'https://shop.example.com/iphone-17-blue/', article: 'IPHONE-17-BLUE' })
    .expect(200);
  assert.equal(categoryMatch.body.data.campaign.publicId, campaign.publicId);
  const categoryMiss = await request(app)
    .get('/api/public/application-form-campaigns/resolve')
    .set('Origin', 'https://shop.example.com')
    .query({ pageUrl: 'https://shop.example.com/laptop-1/', article: 'LAPTOP-1' })
    .expect(200);
  assert.equal(categoryMiss.body.data, null);

  const stickerCampaign = (await admin.put(`/api/form-campaigns/${campaign.id}`)
    .send(campaignInput(createdForm.id, [], {
      name: 'Кнопка за стікером',
      targetMode: 'sticker',
      stickerExternalId: 'preorder'
    })).expect(200)).body.data;
  assert.equal(stickerCampaign.stickerExternalId, 'preorder');
  const stickerMatch = await request(app)
    .get('/api/public/application-form-campaigns/resolve')
    .set('Origin', 'https://shop.example.com')
    .query({ pageUrl: 'https://shop.example.com/iphone-17-blue/', article: 'IPHONE-17-BLUE' })
    .expect(200);
  assert.equal(stickerMatch.body.data.campaign.publicId, campaign.publicId);
  const stickerMiss = await request(app)
    .get('/api/public/application-form-campaigns/resolve')
    .set('Origin', 'https://shop.example.com')
    .query({ pageUrl: 'https://shop.example.com/laptop-1/', article: 'LAPTOP-1' })
    .expect(200);
  assert.equal(stickerMiss.body.data, null);

  await admin.put(`/api/form-campaigns/${campaign.id}`)
    .send(campaignInput(createdForm.id, [{ productId, modificationId: null }], {
      name: 'Передзамовлення відсутніх iPhone 17',
      availabilityMode: 'out_of_stock'
    }))
    .expect(200);
  const inStockWithSpoofedState = await request(app)
    .get('/api/public/application-form-campaigns/resolve')
    .set('Origin', 'https://shop.example.com')
    .query({
      pageUrl: 'https://shop.example.com/iphone-17-black/',
      article: 'IPHONE-17-BLACK',
      stockState: 'out_of_stock'
    })
    .expect(200);
  assert.equal(inStockWithSpoofedState.body.data, null);
  const outOfStock = await request(app)
    .get('/api/public/application-form-campaigns/resolve')
    .set('Origin', 'https://shop.example.com')
    .query({ pageUrl: 'https://shop.example.com/iphone-17-blue/', article: 'IPHONE-17-BLUE' })
    .expect(200);
  assert.equal(outOfStock.body.data.campaign.publicId, campaign.publicId);

  const workflowForm = (await admin.post('/api/forms').send({
    formType: 'workflow',
    name: 'Workflow form',
    title: 'Workflow form',
    description: '',
    buttonText: 'Send',
    successMessage: 'Done',
    settings: {},
    styles: {},
    workflow: {}
  }).expect(201)).body.data;
  await admin.post('/api/form-campaigns')
    .send(campaignInput(workflowForm.id, [{ productId, modificationId: null }]))
    .expect(422)
    .expect((response) => assert.equal(response.body.error.code, 'FORM_CAMPAIGN_SIMPLE_ONLY'));

  const unpublishedForm = (await admin.post('/api/forms').send({
    name: 'Unpublished simple form',
    title: 'Unpublished simple form',
    description: '',
    buttonText: 'Send',
    successMessage: 'Done',
    settings: {},
    styles: {}
  }).expect(201)).body.data;
  await admin.put(`/api/form-campaigns/${campaign.id}`)
    .send(campaignInput(unpublishedForm.id, [{ productId, modificationId: null }]))
    .expect(422)
    .expect((response) => assert.equal(response.body.error.code, 'FORM_CAMPAIGN_FORM_NOT_PUBLISHED'));

  await admin.patch(`/api/form-campaigns/${campaign.id}/status`).send({ status: 'paused' }).expect(200);
  const paused = await request(app)
    .get('/api/public/application-form-campaigns/resolve')
    .set('Origin', 'https://shop.example.com')
    .query({ pageUrl: 'https://shop.example.com/iphone-17-black/', article: 'IPHONE-17-BLACK' })
    .expect(200);
  assert.equal(paused.body.data, null);
});

async function renderEmbed({ userAgent, width }) {
  const dom = new JSDOM(`<!doctype html><html><head>
    <meta itemprop="sku" content="IPHONE-17-BLUE">
    </head><body><div id="desktop-buy"></div><div id="mobile-buy"></div></body></html>`, {
    url: 'https://shop.example.com/iphone-17-blue/',
    runScripts: 'outside-only'
  });
  Object.defineProperty(dom.window.navigator, 'userAgent', { configurable: true, value: userAgent });
  Object.defineProperty(dom.window, 'innerWidth', { configurable: true, value: width });
  dom.window.fetch = async () => ({
    ok: true,
    json: async () => ({
      data: {
        campaign: {
          publicId: randomUUID(),
          name: 'Передзамовлення',
          buttonText: 'Передзамовити',
          buttonStyles,
          placement
        },
        form: { publicId: randomUUID(), name: 'Форма' },
        product: { title: 'Apple iPhone 17 Blue', sku: 'IPHONE-17-BLUE' },
        contextToken: 'signed-context'
      }
    })
  });
  dom.window.eval(formCampaignEmbedScript('https://panel.example.com'));
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
  await new Promise((resolve) => setTimeout(resolve, 240));
  return dom;
}

test('embed keeps independently verified desktop and mobile placement contracts', async () => {
  const desktop = await renderEmbed({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140 Safari/537.36',
    width: 1280
  });
  assert.equal(desktop.window.document.querySelector('#desktop-buy + .mt-application-campaign-button')?.textContent, 'Передзамовити');
  assert.equal(desktop.window.document.querySelector('#mobile-buy .mt-application-campaign-button'), null);
  desktop.window.close();

  const mobile = await renderEmbed({
    userAgent: 'Mozilla/5.0 (Linux; Android 16; Pixel 10) AppleWebKit/537.36 Mobile Safari/537.36',
    width: 390
  });
  assert.equal(mobile.window.document.querySelector('#mobile-buy > .mt-application-campaign-button')?.textContent, 'Передзамовити');
  assert.equal(mobile.window.document.querySelector('#desktop-buy + .mt-application-campaign-button'), null);
  mobile.window.close();
});
