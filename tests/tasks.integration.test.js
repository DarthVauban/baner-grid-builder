import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'pg-mem://task-tests';
process.env.JWT_SECRET = '0123456789abcdef0123456789abcdef';
process.env.COOKIE_SECURE = 'false';
process.env.ADMIN_NAME = 'Task Admin';
process.env.ADMIN_EMAIL = 'task-admin@test.local';
process.env.ADMIN_PASSWORD = 'AdminPassword123!';

const { default: app } = await import('../src/app.js');
const { pool } = await import('../src/db/pool.js');
const { runMigrations } = await import('../src/db/migrate.js');
const { ensureBootstrapAdmin } = await import('../src/modules/users/user.service.js');
const { processDueReminders } = await import('../src/modules/tasks/reminder.worker.js');

const admin = request.agent(app);
const owner = request.agent(app);
const participant = request.agent(app);

before(async () => {
  await runMigrations();
  await ensureBootstrapAdmin();
  await admin.post('/api/auth/login').send({
    email: 'task-admin@test.local',
    password: 'AdminPassword123!'
  }).expect(200);

  for (const user of [
    { name: 'Task Owner', email: 'owner@test.local', password: 'OwnerPassword123!' },
    { name: 'Task Participant', email: 'participant@test.local', password: 'ParticipantPassword123!' }
  ]) {
    await request(app).post('/api/auth/register').send(user).expect(201);
  }

  const pending = await admin.get('/api/admin/users?status=pending').expect(200);
  for (const user of pending.body.data) {
    await admin.patch(`/api/admin/users/${user.id}/status`).send({ status: 'approved' }).expect(200);
  }

  await owner.post('/api/auth/login').send({
    email: 'owner@test.local',
    password: 'OwnerPassword123!'
  }).expect(200);
  await participant.post('/api/auth/login').send({
    email: 'participant@test.local',
    password: 'ParticipantPassword123!'
  }).expect(200);
});

after(async () => {
  await pool.end();
});

test('shared task invitation, privacy and reminder flow work through REST API', async () => {
  const search = await owner.get('/api/users/search?search=Participant').expect(200);
  const invitedUser = search.body.data[0];
  assert.equal(invitedUser.email, 'participant@test.local');

  const dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const created = await owner.post('/api/tasks').send({
    type: 'online_meeting',
    title: 'Weekly sync',
    description: 'Discuss the weekly plan',
    isAllDay: false,
    startsAt: new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString(),
    dueAt,
    meetingUrl: 'https://meet.google.com/abc-defg-hij',
    location: '',
    participantIds: [invitedUser.id],
    reminder: {
      enabled: true,
      remindBeforeMinutes: 60,
      repeatIntervalMinutes: 15
    }
  }).expect(201);

  const taskId = created.body.data.id;
  assert.equal(created.body.data.isOwner, true);
  assert.equal(created.body.data.participants[0].responseStatus, 'pending');

  const adminTasks = await admin.get('/api/tasks?filter=all').expect(200);
  assert.equal(adminTasks.body.data.length, 0, 'admin must not bypass task privacy');

  const invitations = await participant.get('/api/tasks?filter=invitations').expect(200);
  assert.equal(invitations.body.data.length, 1);
  assert.equal(invitations.body.data[0].myResponseStatus, 'pending');

  const participantNotifications = await participant.get('/api/notifications').expect(200);
  assert.equal(participantNotifications.body.data.unreadCount, 1);
  assert.equal(participantNotifications.body.data.items[0].type, 'task_invitation');

  await participant.post(`/api/tasks/${taskId}/respond`).send({ response: 'accepted' }).expect(200)
    .expect((response) => assert.equal(response.body.data.myResponseStatus, 'accepted'));

  await participant.put(`/api/tasks/${taskId}/reminder`).send({
    enabled: true,
    remindBeforeMinutes: 120,
    repeatIntervalMinutes: null
  }).expect(200)
    .expect((response) => assert.equal(response.body.data.remindBeforeMinutes, 120));

  const updatedInput = {
    type: 'online_meeting',
    title: 'Updated weekly sync',
    description: 'Updated agenda',
    isAllDay: false,
    startsAt: new Date(Date.now() + 47 * 60 * 60 * 1000).toISOString(),
    dueAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    meetingUrl: 'https://zoom.us/j/123456789',
    location: '',
    participantIds: [invitedUser.id],
    reminder: { enabled: true, remindBeforeMinutes: 60, repeatIntervalMinutes: null }
  };
  await participant.put(`/api/tasks/${taskId}`).send(updatedInput).expect(404);
  await owner.put(`/api/tasks/${taskId}`).send(updatedInput).expect(200)
    .expect((response) => {
      assert.equal(response.body.data.title, 'Updated weekly sync');
      assert.equal(response.body.data.participants[0].responseStatus, 'accepted');
    });

  const ownerNotifications = await owner.get('/api/notifications').expect(200);
  assert.equal(ownerNotifications.body.data.items[0].type, 'invitation_accepted');

  await owner.patch(`/api/tasks/${taskId}/status`).send({ status: 'completed' }).expect(200)
    .expect((response) => assert.equal(response.body.data.status, 'completed'));

  await owner.delete(`/api/tasks/${taskId}`).expect(409)
    .expect((response) => assert.equal(response.body.error.code, 'SHARED_TASK_CANNOT_BE_DELETED'));
});

test('due reminder worker creates one persisted notification', async () => {
  const dueAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const created = await owner.post('/api/tasks').send({
    type: 'reminder',
    title: 'Worker check',
    description: '',
    isAllDay: false,
    startsAt: null,
    dueAt,
    meetingUrl: '',
    location: '',
    participantIds: [],
    reminder: { enabled: true, remindBeforeMinutes: 30, repeatIntervalMinutes: null }
  }).expect(201);

  await pool.query(
    `UPDATE task_reminder_settings SET next_reminder_at = $2
     WHERE task_id = $1`,
    [created.body.data.id, new Date('2000-01-01T00:00:00.000Z')]
  );
  const pendingReminder = await pool.query(
    `SELECT reminder.enabled, reminder.next_reminder_at, tasks.status
     FROM task_reminder_settings AS reminder
     JOIN tasks ON tasks.id = reminder.task_id
     WHERE reminder.task_id = $1`,
    [created.body.data.id]
  );
  assert.equal(pendingReminder.rows.length, 1);
  assert.equal(pendingReminder.rows[0].enabled, true);
  assert.equal(pendingReminder.rows[0].status, 'active');
  const dueReminder = await pool.query(
    `SELECT task_id FROM task_reminder_settings
     WHERE task_id = $1 AND next_reminder_at <= NOW()`,
    [created.body.data.id]
  );
  assert.equal(dueReminder.rows.length, 1);
  assert.equal(await processDueReminders({ lockRows: false }), 1);

  const notifications = await owner.get('/api/notifications').expect(200);
  assert.ok(notifications.body.data.items.some((item) => (
    item.taskId === created.body.data.id && item.type === 'task_reminder'
  )));
});
