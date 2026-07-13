import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
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
let builderId;
let managerId;

async function registerAndVerify(input) {
  const registration = await request(app).post('/api/auth/register').send(input).expect(202);
  assert.match(registration.body.data.devCode, /^\d{6}$/);
  const verified = await request(app).post('/api/auth/register/verify').send({
    email: input.email,
    code: registration.body.data.devCode
  }).expect(201);
  return verified.body.data;
}

before(async () => {
  await runMigrations();
  await ensureBootstrapAdmin();
  await admin.post('/api/auth/login').send({ email: 'applications-admin@test.local', password: 'AdminPassword123!' }).expect(200);
  const formBuilder = await registerAndVerify({ name: 'Form Builder', email: 'form-builder@test.local', password: 'BuilderPassword123!' });
  const applicationManager = await registerAndVerify({ name: 'Application Manager', email: 'application-manager@test.local', password: 'ManagerPassword123!' });
  builderId = formBuilder.id;
  managerId = applicationManager.id;
  await admin.patch(`/api/admin/users/${managerId}/role`).send({ role: 'manager' }).expect(200);
  await admin.put(`/api/admin/users/${builderId}/tool-access`).send({
    tools: ['form_builder'],
    canManageToolAccess: false
  }).expect(200);
  await admin.put(`/api/admin/users/${managerId}/tool-access`).send({
    tools: ['applications'],
    canManageToolAccess: false
  }).expect(200);
  await builder.post('/api/auth/login').send({ email: 'form-builder@test.local', password: 'BuilderPassword123!' }).expect(200);
  await manager.post('/api/auth/login').send({ email: 'application-manager@test.local', password: 'ManagerPassword123!' }).expect(200);
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
  const formInput = {
    name: form.body.data.name,
    title: form.body.data.title,
    description: form.body.data.description,
    buttonText: form.body.data.buttonText,
    successMessage: form.body.data.successMessage,
    settings: form.body.data.settings,
    styles: { accentColor: '#172033', buttonBackgroundColor: '#172033', buttonTextColor: '#ffffff', borderRadius: '14px' },
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
      }
    ]
  };
  const configuredForm = await builder.put(`/api/forms/${form.body.data.id}`).send(formInput).expect(200);
  assert.equal(configuredForm.body.data.fields.some((field) => field.key === 'credit_term'), true);

  const button = await builder.post('/api/forms/buttons').send({
    name: 'Product page button',
    formId: form.body.data.id,
    selector: '.product__buy',
    insertPosition: 'after',
    text: 'Buy in credit',
    styles: { backgroundColor: '#172033', color: '#ffffff' },
    cssClass: '',
    fullWidth: true,
    active: true,
    productSelectors: {
      title: { selector: 'h1', source: 'textContent' },
      imageUrl: { selector: '.product img', source: 'src' }
    }
  }).expect(201);
  const script = await builder.get(`/api/forms/buttons/${button.body.data.id}/script`).expect(200);
  assert.match(script.body.data.script, /^<script>\s*/);
  assert.match(script.body.data.script, /<\/script>$/);
  assert.match(script.body.data.script, /MTApplicationForms/);
  assert.doesNotMatch(script.body.data.script, /fetch\s*\(/);
  assert.doesNotMatch(script.body.data.script, /XMLHttpRequest/);
  assert.match(script.body.data.script, new RegExp(form.body.data.publicId));

  const published = await builder.patch(`/api/forms/${form.body.data.id}/publish`).expect(200);
  assert.equal(published.body.data.status, 'published');

  const loader = await request(app).get('/api/public/application-forms/loader.js').expect(200);
  assert.match(loader.text, /new URL\("\/api\/public\/application-forms"/);
  assert.match(loader.headers['access-control-allow-origin'] || '', /\*/);

  const publicForm = await request(app).get(`/api/public/application-forms/${form.body.data.publicId}`).expect(200);
  assert.equal(publicForm.body.data.fields.find((field) => field.systemFieldType === 'bank').options[0].value, 'mono');

  const submitted = await request(app).post(`/api/public/application-forms/${form.body.data.publicId}/applications`).send({
    values: {
      first_name: 'Ivan',
      last_name: 'Buyer',
      phone: '+380501112233',
      bank: 'mono',
      credit_term: '12_months'
    },
    product: {
      title: 'Smartphone X',
      price: '12999',
      currency: 'UAH',
      sku: 'SKU-1',
      imageUrl: 'https://example.com/phone.jpg'
    },
    context: {
      sourceUrl: 'https://shop.example.com/products/smartphone-x',
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
  assert.equal(feed.body.data.items[0].values.find((value) => value.key === 'credit_term').optionLabel, '12 months');

  const applicationId = feed.body.data.items[0].id;
  const inProgress = await manager.patch(`/api/applications/${applicationId}/status`).send({
    status: 'in_progress',
    expectedVersion: feed.body.data.items[0].version,
    comment: 'Manager started processing.'
  }).expect(200);
  assert.equal(inProgress.body.data.status, 'in_progress');
  assert.equal(inProgress.body.data.version, 2);

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
});
