import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'pg-mem://online-support-tests';
process.env.JWT_SECRET = '0123456789abcdef0123456789abcdef';
process.env.COOKIE_SECURE = 'false';
process.env.APP_ORIGIN = 'http://localhost:3000';
process.env.ADMIN_NAME = 'Support Admin';
process.env.ADMIN_EMAIL = 'support-admin@test.local';
process.env.ADMIN_PASSWORD = 'AdminPassword123!';

const { default: app } = await import('../src/app.js');
const { pool } = await import('../src/db/pool.js');
const { runMigrations } = await import('../src/db/migrate.js');
const { ensureBootstrapAdmin } = await import('../src/modules/users/user.service.js');

const admin = request.agent(app);
let siteId;
let visitorToken;
let conversationId;

const visitorAuth = () => ({ Authorization: `Bearer ${visitorToken}` });

before(async () => {
  await runMigrations();
  await ensureBootstrapAdmin();
  await admin.post('/api/auth/login')
    .send({ email: 'support-admin@test.local', password: 'AdminPassword123!' })
    .expect(200);
});

after(async () => pool.end());

test('widget creates a persistent conversation with one automatic reply and optional contacts', async () => {
  const settings = await admin.get('/api/support-chat/settings').expect(200);
  siteId = settings.body.data.publicId;
  assert.equal(settings.body.data.contactFormEnabled, true);

  const embed = await request(app)
    .get('/api/public/support-chat/embed.js')
    .set('Host', 'mt-panel.sbs')
    .set('X-Forwarded-Proto', 'https')
    .expect('Content-Type', /javascript/)
    .expect(200);
  assert.match(embed.text, /support-chat\/widget/);
  assert.match(embed.text, /iframe/);

  const session = await request(app).post('/api/public/support-chat/session').send({
    siteId,
    embedOrigin: 'https://mobiletrend.com.ua',
    pageUrl: 'https://mobiletrend.com.ua/phones/iphone-16',
    pageTitle: 'Apple iPhone 16'
  }).expect(200);
  visitorToken = session.body.data.token;
  assert.ok(visitorToken.length >= 32);
  assert.equal(session.body.data.conversation, null);

  const firstMessageId = crypto.randomUUID();
  const first = await request(app).post('/api/public/support-chat/messages')
    .set(visitorAuth())
    .send({
      body: 'Чи є цей смартфон у наявності?',
      clientMessageId: firstMessageId,
      pageUrl: 'https://mobiletrend.com.ua/phones/iphone-16',
      pageTitle: 'Apple iPhone 16'
    })
    .expect(201);
  conversationId = first.body.data.id;
  assert.equal(first.body.data.messages.length, 2);
  assert.deepEqual(first.body.data.messages.map((item) => item.senderType), ['visitor', 'system']);
  assert.match(first.body.data.messages[1].body, /зачекайте/i);

  const duplicate = await request(app).post('/api/public/support-chat/messages')
    .set(visitorAuth())
    .send({ body: 'Чи є цей смартфон у наявності?', clientMessageId: firstMessageId })
    .expect(201);
  assert.equal(duplicate.body.data.messages.length, 2);

  const second = await request(app).post('/api/public/support-chat/messages')
    .set(visitorAuth())
    .send({ body: 'Цікавить чорний колір.', clientMessageId: crypto.randomUUID() })
    .expect(201);
  assert.equal(second.body.data.messages.length, 3);
  assert.equal(second.body.data.messages.filter((item) => item.senderType === 'system').length, 1);

  await request(app).put('/api/public/support-chat/contact')
    .set(visitorAuth())
    .send({ name: 'Ірина Коваль', email: 'buyer@example.com', phone: '+380671234567' })
    .expect(200);

  const resumed = await request(app).get('/api/public/support-chat/session')
    .set(visitorAuth())
    .expect(200);
  assert.equal(resumed.body.data.visitor.name, 'Ірина Коваль');
  assert.equal(resumed.body.data.visitor.email, 'buyer@example.com');
  assert.equal(resumed.body.data.visitor.phone, '+380671234567');
  assert.equal(resumed.body.data.conversation.messages.length, 3);
});

test('operator can claim, read, reply and change support conversation status', async () => {
  const unread = await admin.get('/api/support-chat/unread-count').expect(200);
  assert.equal(unread.body.data, 2);

  const feed = await admin.get('/api/support-chat/conversations').expect(200);
  assert.equal(feed.body.data.length, 1);
  assert.equal(feed.body.data[0].visitor.email, 'buyer@example.com');
  assert.equal(feed.body.data[0].unreadCount, 2);

  const detail = await admin.get(`/api/support-chat/conversations/${conversationId}`).expect(200);
  assert.equal(detail.body.data.messages.length, 3);
  assert.equal(detail.body.data.conversation.visitor.lastPageTitle, 'Apple iPhone 16');

  const customer = await admin.patch(`/api/support-chat/conversations/${conversationId}/customer`).send({
    name: 'Ірина Ковальчук',
    email: 'iryna@example.com',
    phone: '+380931112233'
  }).expect(200);
  assert.equal(customer.body.data.visitor.name, 'Ірина Ковальчук');
  assert.equal(customer.body.data.visitor.email, 'iryna@example.com');
  assert.equal(customer.body.data.visitor.phone, '+380931112233');

  const claimed = await admin.post(`/api/support-chat/conversations/${conversationId}/claim`).expect(200);
  assert.equal(claimed.body.data.status, 'OPEN');
  assert.equal(claimed.body.data.assignedUser.name, 'Support Admin');

  await admin.post(`/api/support-chat/conversations/${conversationId}/read`).expect(204);
  const read = await admin.get('/api/support-chat/unread-count').expect(200);
  assert.equal(read.body.data, 0);

  const reply = await admin.post(`/api/support-chat/conversations/${conversationId}/messages`).send({
    body: 'Так, чорний iPhone 16 зараз у наявності.',
    clientMessageId: crypto.randomUUID()
  }).expect(201);
  assert.equal(reply.body.data.senderType, 'operator');

  const publicSession = await request(app).get('/api/public/support-chat/session')
    .set(visitorAuth())
    .expect(200);
  assert.equal(publicSession.body.data.conversation.messages.at(-1).body, 'Так, чорний iPhone 16 зараз у наявності.');
  assert.equal(publicSession.body.data.visitor.name, 'Ірина Ковальчук');

  const resolved = await admin.patch(`/api/support-chat/conversations/${conversationId}/status`)
    .send({ status: 'RESOLVED' })
    .expect(200);
  assert.equal(resolved.body.data.status, 'RESOLVED');

  await request(app).post('/api/public/support-chat/messages')
    .set(visitorAuth())
    .send({ body: 'А чи можна забронювати?', clientMessageId: crypto.randomUUID() })
    .expect(201);
  const reopened = await admin.get(`/api/support-chat/conversations/${conversationId}`).expect(200);
  assert.equal(reopened.body.data.conversation.status, 'NEW');
});

test('allowed origin setting blocks unknown embedding sites', async () => {
  const current = await admin.get('/api/support-chat/settings').expect(200);
  await admin.put('/api/support-chat/settings').send({
    ...current.body.data,
    allowedOrigins: ['https://mobiletrend.com.ua']
  }).expect(200);

  await request(app).post('/api/public/support-chat/session').send({
    siteId,
    embedOrigin: 'https://unknown.example'
  }).expect(403);

  await request(app).post('/api/public/support-chat/session').send({
    siteId,
    embedOrigin: 'https://mobiletrend.com.ua'
  }).expect(200);
});
