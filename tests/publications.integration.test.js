import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'pg-mem://publication-tests';
process.env.JWT_SECRET = '0123456789abcdef0123456789abcdef';
process.env.COOKIE_SECURE = 'false';
process.env.ADMIN_NAME = 'Publication Admin';
process.env.ADMIN_EMAIL = 'publication-admin@test.local';
process.env.ADMIN_PASSWORD = 'AdminPassword123!';

const { default: app } = await import('../src/app.js');
const { pool } = await import('../src/db/pool.js');
const { runMigrations } = await import('../src/db/migrate.js');
const { ensureBootstrapAdmin } = await import('../src/modules/users/user.service.js');
const { processPublicationReminders } = await import('../src/modules/publications/publication.worker.js');

const admin = request.agent(app);
const creator = request.agent(app);
const assignee = request.agent(app);
let creatorId;
let assigneeId;

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
  await admin.post('/api/auth/login').send({ email: 'publication-admin@test.local', password: 'AdminPassword123!' }).expect(200);
  const creatorUser = await registerAndVerify({ name: 'Content Planner', email: 'planner@test.local', password: 'PlannerPassword123!' });
  const assigneeUser = await registerAndVerify({ name: 'Blog Publisher', email: 'publisher@test.local', password: 'PublisherPassword123!' });
  creatorId = creatorUser.id;
  assigneeId = assigneeUser.id;
  for (const userId of [creatorId, assigneeId]) {
    await admin.put(`/api/admin/users/${userId}/tool-access`).send({
      tools: ['blog_publications'],
      canManageToolAccess: false
    }).expect(200);
  }
  await creator.post('/api/auth/login').send({ email: 'planner@test.local', password: 'PlannerPassword123!' }).expect(200);
  await assignee.post('/api/auth/login').send({ email: 'publisher@test.local', password: 'PublisherPassword123!' }).expect(200);
});

after(async () => pool.end());

test('publication planning, materials and status flow work through REST API', async () => {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const batch = await creator.post('/api/publications/batch').send({ items: [
    { title: 'First blog article', publishAt: tomorrow, assigneeId },
    { title: 'Second blog article', publishAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(), assigneeId }
  ] }).expect(201);
  assert.equal(batch.body.data.length, 2);

  const publication = batch.body.data[0];
  const assignedNotifications = await assignee.get('/api/notifications').expect(200);
  assert.ok(assignedNotifications.body.data.items.some((item) => item.type === 'publication_assigned'));

  const updated = await creator.put(`/api/publications/${publication.id}`).send({
    title: 'First updated blog article',
    description: 'Publish with the prepared cover image.',
    publishAt: tomorrow,
    assigneeId,
    materials: [
      { type: 'google_doc', label: 'Article text', url: 'https://docs.google.com/document/d/example/edit' },
      { type: 'drive_folder', label: 'Images', url: 'https://drive.google.com/drive/folders/example' }
    ]
  }).expect(200);
  assert.equal(updated.body.data.materials.length, 2);

  await creator.patch(`/api/publications/${publication.id}/status`).send({ status: 'ready' }).expect(200);
  const published = await assignee.patch(`/api/publications/${publication.id}/status`).send({
    status: 'published', publicationUrl: 'https://example.com/blog/first-article'
  }).expect(200);
  assert.equal(published.body.data.status, 'published');
  assert.equal(published.body.data.publicationUrl, 'https://example.com/blog/first-article');

  const creatorNotifications = await creator.get('/api/notifications').expect(200);
  assert.ok(creatorNotifications.body.data.items.some((item) => item.type === 'publication_published'));
});

test('publication can be created without an assignee', async () => {
  const response = await creator.post('/api/publications').send({
    title: 'Unassigned article',
    description: 'An editor can be selected later.',
    publishAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
    assigneeId: null,
    materials: []
  }).expect(201);

  assert.equal(response.body.data.assignee, null);
  assert.equal(response.body.data.creator.email, 'planner@test.local');
});

test('publication worker creates reminder and overdue notifications once', async () => {
  const created = await creator.post('/api/publications').send({
    title: 'Reminder article', description: '',
    publishAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    assigneeId, materials: []
  }).expect(201);
  assert.equal(await processPublicationReminders({ lockRows: false }), 1);
  assert.equal(await processPublicationReminders({ lockRows: false }), 0);
  await pool.query('UPDATE blog_publications SET publish_at = $2 WHERE id = $1', [created.body.data.id, new Date(Date.now() - 1000)]);
  assert.equal(await processPublicationReminders({ lockRows: false }), 1);
  const notifications = await assignee.get('/api/notifications').expect(200);
  assert.ok(notifications.body.data.items.some((item) => item.type === 'publication_reminder'));
  assert.ok(notifications.body.data.items.some((item) => item.type === 'publication_overdue'));
});
