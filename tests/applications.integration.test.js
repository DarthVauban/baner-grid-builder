import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'pg-mem://applications-tests';
process.env.JWT_SECRET = '0123456789abcdef0123456789abcdef';
process.env.COOKIE_SECURE = 'false';
process.env.ADMIN_NAME = 'Applications Admin';
process.env.ADMIN_EMAIL = 'applications-admin@test.local';
process.env.ADMIN_PASSWORD = 'AdminPassword123!';

const { default: app } = await import('../src/app.js');
const { pool } = await import('../src/db/pool.js');
const { runMigrations } = await import('../src/db/migrate.js');
const { ensureBootstrapAdmin } = await import('../src/modules/users/user.service.js');

const admin = request.agent(app);
const builder = request.agent(app);
const manager = request.agent(app);
const otherManager = request.agent(app);
let builderId;
let managerId;
let otherManagerId;
let adminTotpSecret;

async function registerAndVerify(input) {
  const registration = await request(app).post('/api/auth/register').send(input).expect(202);
  assert.match(registration.body.data.devCode, /^\d{6}$/);
  const verified = await request(app).post('/api/auth/register/verify').send({
    email: input.email,
    code: registration.body.data.devCode
  }).expect(201);
  return verified.body.data;
}

const base32Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(secret) {
  const normalized = secret.replace(/\s+/g, '').replace(/=+$/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes = [];

  for (const char of normalized) {
    const index = base32Alphabet.indexOf(char);
    assert.notEqual(index, -1);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

function currentTotpCode(secret) {
  const counter = Math.floor(Date.now() / 1000 / 30);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuffer.writeUInt32BE(counter >>> 0, 4);
  const digest = crypto.createHmac('sha1', base32Decode(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);

  return String(binary % 1_000_000).padStart(6, '0');
}

before(async () => {
  await runMigrations();
  await ensureBootstrapAdmin();
  await admin.post('/api/auth/login').send({ email: 'applications-admin@test.local', password: 'AdminPassword123!' }).expect(200);
  const adminTwoFactorSetup = await admin.post('/api/users/profile/2fa/setup').expect(200);
  adminTotpSecret = adminTwoFactorSetup.body.data.manualKey.replace(/\s+/g, '');
  await admin.post('/api/users/profile/2fa/confirm').send({ code: currentTotpCode(adminTotpSecret) }).expect(200);
  const formBuilder = await registerAndVerify({ name: 'Form Builder', email: 'form-builder@test.local', password: 'BuilderPassword123!' });
  const applicationManager = await registerAndVerify({ name: 'Application Manager', email: 'application-manager@test.local', password: 'ManagerPassword123!' });
  const secondApplicationManager = await registerAndVerify({ name: 'Second Manager', email: 'second-manager@test.local', password: 'SecondManager123!' });
  builderId = formBuilder.id;
  managerId = applicationManager.id;
  otherManagerId = secondApplicationManager.id;
  await admin.patch(`/api/admin/users/${managerId}/role`).send({ role: 'manager' }).expect(200);
  await admin.patch(`/api/admin/users/${otherManagerId}/role`).send({ role: 'manager' }).expect(200);
  await admin.put(`/api/admin/users/${builderId}/tool-access`).send({
    tools: ['form_builder'],
    canManageToolAccess: false
  }).expect(200);
  await admin.put(`/api/admin/users/${managerId}/tool-access`).send({
    tools: ['applications'],
    canManageToolAccess: false
  }).expect(200);
  await admin.put(`/api/admin/users/${otherManagerId}/tool-access`).send({
    tools: ['applications'],
    canManageToolAccess: false
  }).expect(200);
  await builder.post('/api/auth/login').send({ email: 'form-builder@test.local', password: 'BuilderPassword123!' }).expect(200);
  await manager.post('/api/auth/login').send({ email: 'application-manager@test.local', password: 'ManagerPassword123!' }).expect(200);
  await otherManager.post('/api/auth/login').send({ email: 'second-manager@test.local', password: 'SecondManager123!' }).expect(200);
});

after(async () => pool.end());

test('form builder and applications list have separate access and process public submissions', async () => {
  await builder.get('/api/applications/counts').expect(403);
  await manager.get('/api/forms').expect(403);

  const bank = await builder.post('/api/forms/banks').send({
    label: 'Mono Bank',
    value: 'mono',
    active: true,
    sortOrder: 1
  }).expect(201);
  assert.equal(bank.body.data.value, 'mono');

  const form = await builder.post('/api/forms').send({
    name: 'Credit request',
    title: 'Leave a credit request',
    description: 'A manager will contact the customer.',
    buttonText: 'Send request',
    successMessage: 'Request received.',
    settings: {},
    styles: {}
  }).expect(201);
  assert.equal(form.body.data.fields.length, 4);

  const flexibleForm = await builder.post('/api/forms').send({
    name: 'Flexible request',
    title: 'Flexible request',
    description: '',
    buttonText: 'Send',
    successMessage: 'Done.',
    settings: {},
    styles: {}
  }).expect(201);
  const phoneField = flexibleForm.body.data.fields.find((field) => field.systemFieldType === 'phone');
  assert.ok(phoneField);
  const flexibleConfigured = await builder.put(`/api/forms/${flexibleForm.body.data.id}`).send({
    name: flexibleForm.body.data.name,
    title: flexibleForm.body.data.title,
    description: flexibleForm.body.data.description,
    buttonText: flexibleForm.body.data.buttonText,
    successMessage: flexibleForm.body.data.successMessage,
    settings: flexibleForm.body.data.settings,
    styles: flexibleForm.body.data.styles,
    fields: [
      {
        key: 'comment',
        label: 'Comment',
        type: 'textarea',
        placeholder: '',
        helpText: '',
        defaultValue: '',
        required: false,
        active: true,
        system: false,
        systemFieldType: null,
        sortOrder: 0,
        validation: {},
        options: []
      },
      { ...phoneField, sortOrder: 1 }
    ]
  }).expect(200);
  assert.deepEqual(flexibleConfigured.body.data.fields.map((field) => field.key), ['comment', 'phone']);
  assert.equal(flexibleConfigured.body.data.fields.some((field) => field.systemFieldType === 'first_name'), false);
  await builder.patch(`/api/forms/${flexibleForm.body.data.id}/publish`).expect(200);
  const flexiblePublic = await request(app).get(`/api/public/application-forms/${flexibleForm.body.data.publicId}`).expect(200);
  assert.deepEqual(flexiblePublic.body.data.fields.map((field) => field.key), ['comment', 'phone']);
  assert.equal(flexiblePublic.body.data.fields.some((field) => field.systemFieldType === 'bank'), false);

  const formInput = {
    name: form.body.data.name,
    title: form.body.data.title,
    description: form.body.data.description,
    buttonText: form.body.data.buttonText,
    successMessage: form.body.data.successMessage,
    settings: form.body.data.settings,
    styles: {
      accentColor: '#172033',
      buttonBackgroundColor: '#172033',
      buttonTextColor: '#ffffff',
      borderRadius: '14px',
      numberBlockBackgroundColor: '#f6f4ff',
      numberBlockBorderColor: '#d8d4ff',
      numberBlockTextColor: '#172033',
      numberBlockRadius: '18px',
      choiceAccentColor: '#172033',
      choiceBorderColor: '#98a2b3',
      choiceBackgroundColor: '#ffffff',
      choiceTextColor: '#101828',
      checkboxRadius: '6px'
    },
    fields: [
      ...form.body.data.fields,
      {
        key: 'credit_term',
        label: 'Credit term',
        type: 'radio',
        placeholder: '',
        helpText: '',
        defaultValue: '',
        required: true,
        active: true,
        system: false,
        systemFieldType: null,
        sortOrder: 100,
        validation: {},
        options: [
          { label: '12 months', value: '12_months', sortOrder: 0, active: true },
          { label: '24 months', value: '24_months', sortOrder: 1, active: true }
        ]
      },
      {
        key: 'addons',
        label: 'Additional services',
        type: 'checkbox',
        placeholder: '',
        helpText: '',
        defaultValue: '',
        required: false,
        active: true,
        system: false,
        systemFieldType: null,
        sortOrder: 110,
        validation: {},
        options: [
          { label: 'Screen protection', value: 'screen_protection', sortOrder: 0, active: true },
          { label: 'Extended warranty', value: 'extended_warranty', sortOrder: 1, active: true }
        ]
      }
    ]
  };
  const configuredForm = await builder.put(`/api/forms/${form.body.data.id}`).send(formInput).expect(200);
  assert.equal(configuredForm.body.data.fields.some((field) => field.key === 'credit_term'), true);
  assert.equal(configuredForm.body.data.fields.find((field) => field.key === 'addons').options.length, 2);

  const button = await builder.post('/api/forms/buttons').send({
    name: 'Product page button',
    formId: form.body.data.id,
    selector: '.product__buy',
    insertPosition: 'after',
    text: 'Buy in credit',
    styles: { backgroundColor: '#172033', color: '#ffffff', fontWeight: '800', fontSize: '15px' },
    cssClass: '',
    fullWidth: true,
    active: true,
    productSelectors: {
      title: { selector: 'h1', source: 'textContent' },
      imageUrl: { selector: '.product img', source: 'src' },
      price: { selector: '.product-price__item', source: 'textContent' },
      priceCondition: { enabled: true, minPrice: '10000' }
    }
  }).expect(201);
  const script = await builder.get(`/api/forms/buttons/${button.body.data.id}/script`).expect(200);
  assert.match(script.body.data.script, /^<script>\s*/);
  assert.match(script.body.data.script, /<\/script>$/);
  assert.match(script.body.data.script, /MTApplicationForms/);
  assert.doesNotMatch(script.body.data.script, /fetch\s*\(/);
  assert.doesNotMatch(script.body.data.script, /XMLHttpRequest/);
  assert.match(script.body.data.script, new RegExp(form.body.data.publicId));
  assert.match(script.body.data.script, /readGalleryImage/);
  assert.match(script.body.data.script, /gallery__photos-list/);
  assert.match(script.body.data.script, /img\[src\*='\/content\/images\/'\]/);
  assert.match(script.body.data.script, /data-href/);
  assert.match(script.body.data.script, /fontFamily = "inherit"/);
  assert.match(script.body.data.script, /fontWeight/);
  assert.match(script.body.data.script, /fontSize/);
  assert.match(script.body.data.script, /priceCondition/);
  assert.match(script.body.data.script, /parsePrice/);
  assert.match(script.body.data.script, /productPrice >= minimum/);
  assert.match(script.body.data.compactScript, /^<script async src="/);
  assert.match(script.body.data.compactScript, new RegExp(`/api/public/application-forms/buttons/${button.body.data.id}/embed\\.js`));
  assert.doesNotMatch(script.body.data.compactScript, /Buy in credit/);

  const compactEmbed = await request(app).get(`/api/public/application-forms/buttons/${button.body.data.id}/embed.js`).expect(200);
  assert.match(compactEmbed.headers['content-type'] || '', /application\/javascript/);
  assert.match(compactEmbed.headers['cache-control'] || '', /no-store/);
  assert.doesNotMatch(compactEmbed.text, /^<script>/);
  assert.match(compactEmbed.text, /Buy in credit/);
  assert.match(compactEmbed.text, /fontSize/);
  assert.match(compactEmbed.text, /priceCondition/);

  const published = await builder.patch(`/api/forms/${form.body.data.id}/publish`).expect(200);
  assert.equal(published.body.data.status, 'published');

  const loader = await request(app).get('/api/public/application-forms/loader.js').expect(200);
  assert.match(loader.text, /new URL\("\/api\/public\/application-forms"/);
  assert.match(loader.headers['access-control-allow-origin'] || '', /\*/);
  assert.match(loader.text, /\+380 \(__\) ___-__-__/);
  assert.match(loader.text, /\.mtf-submit\{width:100%/);
  assert.match(loader.text, /cursor:pointer/);
  assert.match(loader.text, /mtf-number/);
  assert.match(loader.text, /--mtf-number-bg/);
  assert.match(loader.text, /mtf-choice input\[type=checkbox\]/);
  assert.match(loader.text, /--mtf-choice-accent/);
  assert.match(loader.text, /justify-items:start/);
  assert.match(loader.text, /mtf-choice__text/);
  assert.match(loader.text, /type='checkbox'/);
  assert.match(loader.text, /text-wrap:balance/);

  const preflight = await request(app)
    .options(`/api/public/application-forms/${form.body.data.publicId}/applications`)
    .set('Origin', 'http://shop551651.horoshop.ua')
    .set('Access-Control-Request-Method', 'POST')
    .set('Access-Control-Request-Headers', 'Content-Type')
    .expect(204);
  assert.equal(preflight.headers['access-control-allow-origin'], '*');

  const publicForm = await request(app).get(`/api/public/application-forms/${form.body.data.publicId}`).expect(200);
  assert.equal(publicForm.body.data.fields.find((field) => field.systemFieldType === 'bank').options[0].value, 'mono');
  assert.equal(publicForm.body.data.styles.numberBlockRadius, '18px');
  assert.equal(publicForm.body.data.fields.find((field) => field.key === 'addons').options[1].value, 'extended_warranty');

  const submitted = await request(app).post(`/api/public/application-forms/${form.body.data.publicId}/applications`).send({
    values: {
      first_name: 'Ivan',
      last_name: 'Buyer',
      phone: '+380501112233',
      bank: 'mono',
      credit_term: '12_months',
      addons: ['screen_protection', 'extended_warranty']
    },
    product: {
      title: 'Smartphone X',
      price: '12999',
      currency: 'UAH',
      sku: 'SKU-1',
      imageUrl: '/content/images/phone.webp'
    },
    context: {
      sourceUrl: 'http://shop.example.com/products/smartphone-x',
      pageTitle: 'Smartphone X',
      utm_source: 'newsletter'
    },
    idempotencyKey: 'same-customer-1'
  }).expect(201);
  assert.equal(submitted.body.data.number, '00001');

  const duplicate = await request(app).post(`/api/public/application-forms/${form.body.data.publicId}/applications`).send({
    values: { first_name: 'Ivan', last_name: 'Buyer', phone: '+380501112233', bank: 'mono', credit_term: '12_months' },
    product: { title: 'Smartphone X' },
    context: { sourceUrl: 'https://shop.example.com/products/smartphone-x' },
    idempotencyKey: 'same-customer-1'
  }).expect(200);
  assert.equal(duplicate.body.data.duplicate, true);
  assert.equal(duplicate.body.data.number, '00001');

  const feed = await manager.get('/api/applications?search=1').expect(200);
  assert.equal(feed.body.data.total, 1);
  assert.equal(feed.body.data.items[0].number, '00001');
  assert.equal(feed.body.data.items[0].customer.bankLabel, 'Mono Bank');
  assert.equal(feed.body.data.items[0].product.title, 'Smartphone X');
  assert.equal(feed.body.data.items[0].product.imageUrl, 'http://shop.example.com/content/images/phone.webp');
  assert.equal(feed.body.data.items[0].product.imageProxyUrl, `/api/applications/${feed.body.data.items[0].id}/product-image`);
  assert.equal(feed.body.data.items[0].values.find((value) => value.key === 'credit_term').optionLabel, '12 months');
  assert.equal(feed.body.data.items[0].values.find((value) => value.key === 'addons').optionLabel, 'Screen protection, Extended warranty');
  assert.equal(feed.body.data.items[0].assignedManager, null);

  const formFilters = await manager.get('/api/applications/forms').expect(200);
  const creditFormFilter = formFilters.body.data.find((item) => item.id === form.body.data.id);
  const flexibleFormFilter = formFilters.body.data.find((item) => item.id === flexibleForm.body.data.id);
  assert.ok(creditFormFilter);
  assert.ok(flexibleFormFilter);
  assert.equal(creditFormFilter.all, 1);
  assert.equal(creditFormFilter.new, 1);
  assert.equal(flexibleFormFilter.all, 0);
  const creditFormFeed = await manager.get(`/api/applications?formId=${form.body.data.id}`).expect(200);
  assert.equal(creditFormFeed.body.data.total, 1);
  assert.equal(creditFormFeed.body.data.items[0].formId, form.body.data.id);
  const flexibleFormFeed = await manager.get(`/api/applications?formId=${flexibleForm.body.data.id}`).expect(200);
  assert.equal(flexibleFormFeed.body.data.total, 0);

  const otherInitialFeed = await otherManager.get('/api/applications?search=1').expect(200);
  assert.equal(otherInitialFeed.body.data.total, 1);

  const nameFeed = await manager.get('/api/applications?search=Ivan').expect(200);
  assert.equal(nameFeed.body.data.total, 1);
  const fullNameFeed = await manager.get('/api/applications?search=Ivan%20Buyer').expect(200);
  assert.equal(fullNameFeed.body.data.total, 1);
  const phoneFeed = await manager.get('/api/applications?search=050111').expect(200);
  assert.equal(phoneFeed.body.data.total, 1);

  const applicationId = feed.body.data.items[0].id;
  const inProgress = await manager.post(`/api/applications/${applicationId}/claim`).send({
    expectedVersion: feed.body.data.items[0].version
  }).expect(200);
  assert.equal(inProgress.body.data.status, 'in_progress');
  assert.equal(inProgress.body.data.assignedManager.id, managerId);
  assert.equal(inProgress.body.data.assignedManager.name, 'Application Manager');
  assert.equal(inProgress.body.data.version, 2);

  const otherFeedAfterClaim = await otherManager.get('/api/applications?search=1').expect(200);
  assert.equal(otherFeedAfterClaim.body.data.total, 0);
  await otherManager.get(`/api/applications/${applicationId}`).expect(404);

  const countsAfterClaim = await manager.get('/api/applications/counts').expect(200);
  assert.equal(countsAfterClaim.body.data.inProgress, 1);
  assert.equal(countsAfterClaim.body.data.unassigned.all, 0);
  assert.equal(countsAfterClaim.body.data.managerStats[0].manager.id, managerId);
  assert.equal(countsAfterClaim.body.data.managerStats[0].inProgress, 1);

  await manager.patch(`/api/applications/${applicationId}/status`).send({
    status: 'rejected',
    expectedVersion: 1,
    comment: 'Stale update.'
  }).expect(409);

  const commented = await manager.post(`/api/applications/${applicationId}/comments`).send({
    text: 'Customer asked for a callback tomorrow.',
    expectedVersion: inProgress.body.data.version
  }).expect(201);
  assert.equal(commented.body.data.version, 3);
  assert.equal(commented.body.data.comments[0].text, 'Customer asked for a callback tomorrow.');

  const notifications = await manager.get('/api/notifications').expect(200);
  assert.ok(notifications.body.data.items.some((item) => item.type === 'application_created' && item.applicationId === applicationId));

  await manager.delete(`/api/applications/${applicationId}`).send({ code: '000000' }).expect(403)
    .expect((response) => assert.equal(response.body.error.code, 'PRIMARY_ADMIN_REQUIRED'));

  const wrongTotpCode = currentTotpCode(adminTotpSecret) === '000000' ? '000001' : '000000';
  await admin.delete(`/api/applications/${applicationId}`).send({ code: wrongTotpCode }).expect(401)
    .expect((response) => assert.equal(response.body.error.code, 'INVALID_TWO_FACTOR_CODE'));

  await admin.delete(`/api/applications/${applicationId}`).send({ code: currentTotpCode(adminTotpSecret) }).expect(204);
  await manager.get(`/api/applications/${applicationId}`).expect(404);
  const feedAfterDelete = await manager.get('/api/applications?search=1').expect(200);
  assert.equal(feedAfterDelete.body.data.total, 0);
});
