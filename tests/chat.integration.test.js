import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'pg-mem://chat-tests';
process.env.JWT_SECRET = '0123456789abcdef0123456789abcdef';
process.env.COOKIE_SECURE = 'false';
process.env.APP_ORIGIN = 'http://localhost:3000';
process.env.ADMIN_NAME = 'Chat Admin';
process.env.ADMIN_EMAIL = 'chat-admin@test.local';
process.env.ADMIN_PASSWORD = 'AdminPassword123!';

const { default: app } = await import('../src/app.js');
const { pool } = await import('../src/db/pool.js');
const { runMigrations } = await import('../src/db/migrate.js');
const { ensureBootstrapAdmin } = await import('../src/modules/users/user.service.js');
const { subscribeToChatUpdates } = await import('../src/modules/chat/chat.events.js');

const admin = request.agent(app);
const planner = request.agent(app);
const colleague = request.agent(app);
let plannerId;
let colleagueId;
let adminId;

before(async () => {
  await runMigrations();
  await ensureBootstrapAdmin();
  const adminLogin = await admin.post('/api/auth/login').send({ email: 'chat-admin@test.local', password: 'AdminPassword123!' }).expect(200);
  adminId = adminLogin.body.data.id;
  for (const user of [
    { name: 'Chat Planner', email: 'chat-planner@test.local', password: 'PlannerPassword123!' },
    { name: 'Chat Colleague', email: 'chat-colleague@test.local', password: 'ColleaguePassword123!' }
  ]) await request(app).post('/api/auth/register').send(user).expect(201);
  const pending = await admin.get('/api/admin/users?status=pending').expect(200);
  for (const user of pending.body.data) await admin.patch(`/api/admin/users/${user.id}/status`).send({ status: 'approved' }).expect(200);
  plannerId = pending.body.data.find((user) => user.email === 'chat-planner@test.local').id;
  colleagueId = pending.body.data.find((user) => user.email === 'chat-colleague@test.local').id;
  await planner.post('/api/auth/login').send({ email: 'chat-planner@test.local', password: 'PlannerPassword123!' }).expect(200);
  await colleague.post('/api/auth/login').send({ email: 'chat-colleague@test.local', password: 'ColleaguePassword123!' }).expect(200);
});

after(async () => pool.end());

test('chat access, contacts and interactive task links work through REST API', async () => {
  await planner.get('/api/chat/contacts').expect(403);
  const defaultTools = ['banner_grid', 'blog_publications', 'product_selection', 'product_tables'];
  await admin.put(`/api/admin/users/${plannerId}/tool-access`).send({
    tools: [...defaultTools, 'chat'], canManageToolAccess: true
  }).expect(200);
  await planner.put(`/api/admin/users/${colleagueId}/tool-access`).send({
    tools: [...defaultTools, 'chat']
  }).expect(200);

  const contacts = await planner.get('/api/chat/contacts').expect(200);
  assert.ok(contacts.body.data.some((contact) => contact.id === colleagueId));

  const dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const task = await planner.post('/api/tasks').send({
    type: 'general', title: 'Approve shared task', description: '', isAllDay: false,
    startsAt: null, dueAt, location: '', meetingUrl: '', participantIds: [colleagueId],
    reminder: { enabled: true, remindBeforeMinutes: 60, repeatIntervalMinutes: null }
  }).expect(201);

  await planner.post('/api/chat/conversations').send({ userId: colleagueId }).expect(422);
  const emptyConversations = await colleague.get('/api/chat/conversations').expect(200);
  assert.equal(emptyConversations.body.data.length, 0);

  const conversation = await planner.post('/api/chat/conversations')
    .set('Host', 'mt-panel.sbs')
    .set('X-Forwarded-Proto', 'https')
    .send({
      userId: colleagueId,
      body: `Please review https://mt-panel.sbs/tasks?task=${task.body.data.id}`
    })
    .expect(201);
  const conversationId = conversation.body.data.id;
  const firstMessageId = conversation.body.data.message.id;
  assert.equal(conversation.body.data.message.entities[0].type, 'task');
  assert.deepEqual(conversation.body.data.message.linkPreviews, []);
  let unsubscribeTyping;
  const typingEvent = new Promise((resolve) => {
    unsubscribeTyping = subscribeToChatUpdates(colleagueId, resolve);
  });
  await planner.post(`/api/chat/conversations/${conversationId}/typing`).send({ isTyping: true }).expect(204);
  const typingPayload = await typingEvent;
  unsubscribeTyping();
  assert.deepEqual(typingPayload, {
    type: 'typing', conversationId, senderId: plannerId, senderName: 'Chat Planner', isTyping: true
  });

  const colleagueConversations = await colleague.get('/api/chat/conversations').expect(200);
  assert.equal(colleagueConversations.body.data[0].unreadCount, 1);
  const unread = await colleague.get('/api/chat/unread-count').expect(200);
  assert.equal(unread.body.data, 1);
  const messages = await colleague.get(`/api/chat/conversations/${conversationId}/messages`).expect(200);
  assert.equal(messages.body.data[0].entities[0].type, 'task');
  assert.equal(messages.body.data[0].entities[0].available, true);
  assert.equal(messages.body.data[0].entities[0].data.myResponseStatus, 'pending');
  await colleague.post(`/api/chat/conversations/${conversationId}/read`).expect(204);
  const read = await colleague.get('/api/chat/unread-count').expect(200);
  assert.equal(read.body.data, 0);

  await colleague.post(`/api/tasks/${task.body.data.id}/respond`).send({ response: 'accepted' }).expect(200);
  const acceptedMessages = await colleague.get(`/api/chat/conversations/${conversationId}/messages`).expect(200);
  assert.equal(acceptedMessages.body.data[0].entities[0].data.myResponseStatus, 'accepted');

  const reply = await colleague.post(`/api/chat/conversations/${conversationId}/messages`).send({
    body: 'Accepted. Screenshot: https://mt.in.ua/img/2026-06-25_174748.png and docs https://example.com/docs/start',
    replyToId: firstMessageId
  }).expect(201);
  assert.equal(reply.body.data.replyTo.id, firstMessageId);
  assert.equal(reply.body.data.replyTo.sender.id, plannerId);
  assert.equal(reply.body.data.linkPreviews.length, 2);
  assert.deepEqual(reply.body.data.linkPreviews.map((preview) => preview.type), ['image', 'link']);
  assert.equal(reply.body.data.linkPreviews[0].url, 'https://mt.in.ua/img/2026-06-25_174748.png');

  const messagesWithReply = await planner.get(`/api/chat/conversations/${conversationId}/messages`).expect(200);
  const storedReply = messagesWithReply.body.data.find((message) => message.id === reply.body.data.id);
  assert.equal(storedReply.replyTo.id, firstMessageId);
  assert.equal(storedReply.replyTo.own, true);

  const plannerReaction = await planner.put(`/api/chat/messages/${reply.body.data.id}/reaction`).send({ emoji: '👍' }).expect(200);
  assert.equal(plannerReaction.body.data[0].emoji, '👍');
  assert.equal(plannerReaction.body.data[0].reactedByMe, true);
  await colleague.put(`/api/chat/messages/${reply.body.data.id}/reaction`).send({ emoji: '❤️' }).expect(200);
  const reactedMessages = await planner.get(`/api/chat/conversations/${conversationId}/messages`).expect(200);
  const reactedReply = reactedMessages.body.data.find((message) => message.id === reply.body.data.id);
  assert.deepEqual(reactedReply.reactions.map((reaction) => reaction.emoji), ['👍', '❤️']);
  assert.equal(reactedReply.reactions.find((reaction) => reaction.emoji === '👍').reactedByMe, true);
  await planner.put(`/api/chat/messages/${reply.body.data.id}/reaction`).send({ emoji: null }).expect(200);

  const group = await planner.post('/api/chat/conversations/groups').send({
    title: 'Content team', participantIds: [colleagueId, adminId]
  }).expect(201);
  assert.equal(group.body.data.type, 'group');
  assert.equal(group.body.data.members.length, 3);
  const colleagueGroups = await colleague.get('/api/chat/conversations').expect(200);
  assert.equal(colleagueGroups.body.data.find((item) => item.id === group.body.data.id).title, 'Content team');
  await colleague.post(`/api/chat/conversations/${group.body.data.id}/messages`).send({ body: 'Hello group' }).expect(201);
  const groupMessages = await planner.get(`/api/chat/conversations/${group.body.data.id}/messages`).expect(200);
  assert.equal(groupMessages.body.data[0].sender.name, 'Chat Colleague');

  await pool.query(
    `INSERT INTO chat_messages (conversation_id, sender_id, body, entity_references)
     VALUES ($1, $2, $3, '[]'::JSONB)`,
    [conversationId, plannerId, `Legacy link https://mt-panel.sbs/tasks?task=${task.body.data.id}`]
  );
  const legacyMessages = await colleague.get(`/api/chat/conversations/${conversationId}/messages`)
    .set('Host', 'mt-panel.sbs')
    .set('X-Forwarded-Proto', 'https')
    .expect(200);
  assert.equal(legacyMessages.body.data.at(-1).entities[0].type, 'task');

  const publication = await planner.post('/api/publications').send({
    title: 'Shared blog publication', description: '', publishAt: dueAt,
    assigneeId: null, materials: []
  }).expect(201);
  await planner.post(`/api/chat/conversations/${conversationId}/messages`).send({
    body: `Publication: http://localhost:3000/tools/blog-publications?publication=${publication.body.data.id}`
  }).expect(201);
  const publicationMessages = await colleague.get(`/api/chat/conversations/${conversationId}/messages`).expect(200);
  const publicationEntity = publicationMessages.body.data.at(-1).entities[0];
  assert.equal(publicationEntity.type, 'publication');
  assert.equal(publicationEntity.available, true);
  assert.equal(publicationEntity.data.title, 'Shared blog publication');
});
