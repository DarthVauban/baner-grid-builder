import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.SITE_THEMES_TEST_DATABASE_URL || 'pg-mem://site-themes-tests';
process.env.JWT_SECRET = 'site-themes-test-secret-0123456789';
process.env.COOKIE_SECURE = 'false';
process.env.APP_ORIGIN = 'https://panel.example.com';
process.env.ADMIN_NAME = 'Site Themes Admin';
process.env.ADMIN_EMAIL = 'site-themes-admin@test.local';
process.env.ADMIN_PASSWORD = 'AdminPassword123!';

const { default: app } = await import('../src/app.js');
const { pool } = await import('../src/db/pool.js');
const { runMigrations } = await import('../src/db/migrate.js');
const { ensureBootstrapAdmin } = await import('../src/modules/users/user.service.js');

const admin = request.agent(app);
const themesPath = '/api/site-themes';
const publicBarPath = '/api/public/site-themes/promo-bar';
const sharedEmbedPath = '/api/public/horoshop-widgets/embed.js';
const shopHost = 'shop.example.com';
const shopOrigin = `https://${shopHost}`;
const promoBar = {
  text: 'Чорна п’ятниця · знижки до 30%',
  buttonText: 'До акцій',
  buttonUrl: '/sale/',
  backgroundColor: '#101010',
  textColor: '#FFE086',
  buttonColor: '#F0CD53',
  buttonTextColor: '#161616',
  alignment: 'center',
  paddingY: 8,
  paddingX: 24,
  showDesktop: true,
  showMobile: true
};
const defaultPromoBarStyle = {
  textFontSize: 14,
  textFontWeight: 'inherit',
  buttonFontSize: 14,
  buttonFontWeight: 600,
  buttonPaddingY: 4,
  buttonPaddingX: 12
};
const editedPromoBarStyle = {
  textFontSize: 24,
  textFontWeight: 700,
  buttonFontSize: 18,
  buttonFontWeight: 800,
  buttonPaddingY: 10,
  buttonPaddingX: 20
};

before(async () => {
  await runMigrations();
  await ensureBootstrapAdmin();
  await pool.query(`
    INSERT INTO search_horoshop_connections (store_domain, encrypted_credentials)
    VALUES ($1, 'encrypted-test-credentials')
  `, [shopHost]);
  await admin.post('/api/auth/login').send({
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD
  }).expect(200);
});

after(async () => {
  await pool.end();
});

const themePath = (id) => `${themesPath}/${id}`;

async function createTheme(name, bar = promoBar) {
  return (await admin.post(themesPath).send({ name, promoBar: bar }).expect(201)).body.data;
}

async function setActive(id, active) {
  return (await admin.put(`${themePath(id)}/active`).send({ active }).expect(200)).body.data;
}

async function publicBar(origin = shopOrigin) {
  return (await request(app).get(publicBarPath).set('Origin', origin).expect(200)).body.data;
}

async function sharedEmbed() {
  return (await request(app).get(sharedEmbedPath).set('Origin', shopOrigin).expect(200)).text;
}

test('only users with tool access can read and change the theme library', async () => {
  await request(app).get(themesPath).expect(401);

  const editorId = randomUUID();
  const email = 'site-themes-editor@test.local';
  await pool.query(`INSERT INTO users (id, name, email, password_hash, role, status)
    SELECT $1, 'Themes Editor', $2, password_hash, 'editor', 'approved' FROM users WHERE email = $3`,
  [editorId, email, process.env.ADMIN_EMAIL]);

  const editor = request.agent(app);
  await editor.post('/api/auth/login').send({ email, password: process.env.ADMIN_PASSWORD }).expect(200);
  await editor.get(themesPath).expect(403);
  await editor.post(themesPath).send({ name: 'Без доступу', promoBar }).expect(403);
  await pool.query("INSERT INTO user_tool_access (user_id, tool_id) VALUES ($1, 'site_themes')", [editorId]);
  const allowed = await editor.get(themesPath).expect(200);
  assert.deepEqual(allowed.body.data, []);
});

test('theme publication snapshots the draft and live visibility can change independently', async () => {
  const first = await createTheme('Чорна п’ятниця');
  assert.equal(first.active, false);
  assert.equal(first.promoBarEnabled, true);
  assert.equal(first.publishedAt, null);
  assert.equal(first.hasUnpublishedChanges, true);
  assert.equal(await publicBar(), null);
  assert.doesNotMatch(await sharedEmbed(), /site-themes\/embed\.js/u);
  await admin.put(`${themePath(first.id)}/active`).send({ active: true }).expect(409);

  const publication = await admin.post(`${themePath(first.id)}/publish`).expect(200);
  assert.ok(Date.parse(publication.body.data.publishedAt) > 0);
  assert.equal(publication.body.data.active, false);
  assert.equal(publication.body.data.hasUnpublishedChanges, false);
  assert.equal(await publicBar(), null);

  assert.equal((await setActive(first.id, true)).active, true);
  const published = await publicBar();
  assert.equal(published.text, promoBar.text);
  assert.equal(published.buttonUrl, promoBar.buttonUrl);
  assert.equal(await publicBar('https://other.example.com'), null);
  assert.match(await sharedEmbed(), /site-themes\/embed\.js/u);

  const editedBar = { ...promoBar, ...editedPromoBarStyle, text: 'Оновлена пропозиція', showMobile: false };
  const draft = await admin.put(themePath(first.id)).send({ name: 'Оновлена тема', promoBar: editedBar }).expect(200);
  assert.equal(draft.body.data.hasUnpublishedChanges, true);
  assert.deepEqual(draft.body.data.promoBar, editedBar);
  assert.deepEqual(await publicBar(), { ...promoBar, ...defaultPromoBarStyle });

  const hidden = await admin.put(`${themePath(first.id)}/promo-bar/visibility`).send({ enabled: false }).expect(200);
  assert.equal(hidden.body.data.promoBarEnabled, false);
  assert.equal(hidden.body.data.active, true);
  assert.equal(hidden.body.data.hasUnpublishedChanges, true);
  assert.equal(await publicBar(), null);
  assert.doesNotMatch(await sharedEmbed(), /site-themes\/embed\.js/u);
  await admin.put(`${themePath(first.id)}/promo-bar/visibility`).send({ enabled: true }).expect(200);
  assert.equal((await publicBar()).text, promoBar.text);

  await admin.post(`${themePath(first.id)}/publish`).expect(200);
  assert.deepEqual(await publicBar(), editedBar);

  const second = await createTheme('Літній розпродаж', { ...promoBar, text: 'Літні знижки' });
  await admin.post(`${themePath(second.id)}/publish`).expect(200);
  await setActive(second.id, true);
  assert.equal((await publicBar()).text, 'Літні знижки');
  const library = (await admin.get(themesPath).expect(200)).body.data;
  assert.deepEqual(library.filter((theme) => theme.active).map((theme) => theme.id), [second.id]);
  await admin.delete(themePath(second.id)).expect(409);
  await admin.delete(themePath(first.id)).expect(204);
  await setActive(second.id, false);
  assert.equal(await publicBar(), null);
  await admin.delete(themePath(second.id)).expect(204);
});

test('legacy snapshots retain default styling and older clients can edit without dropping typography', async () => {
  const name = 'Раніше збережена тема';
  const legacy = await createTheme(name);
  await admin.post(`${themePath(legacy.id)}/publish`).expect(200);
  await setActive(legacy.id, true);
  await pool.query(`
    UPDATE site_themes
    SET draft_promo_bar = $2::JSONB, published_promo_bar = $2::JSONB
    WHERE id = $1
  `, [legacy.id, JSON.stringify(promoBar)]);

  const initial = (await admin.get(themesPath).expect(200)).body.data.find((theme) => theme.id === legacy.id);
  const normalizedBar = { ...promoBar, ...defaultPromoBarStyle };
  assert.equal(initial.hasUnpublishedChanges, false);
  assert.deepEqual(initial.promoBar, normalizedBar);
  assert.deepEqual(await publicBar(), normalizedBar);

  const updatedBar = { ...promoBar, ...editedPromoBarStyle };
  const edited = await admin.put(themePath(legacy.id)).send({ name, promoBar: updatedBar }).expect(200);
  assert.equal(edited.body.data.hasUnpublishedChanges, true);
  assert.deepEqual(edited.body.data.promoBar, updatedBar);

  const restored = await admin.put(themePath(legacy.id)).send({ name, promoBar: normalizedBar }).expect(200);
  assert.equal(restored.body.data.hasUnpublishedChanges, false);

  await admin.put(themePath(legacy.id)).send({ name, promoBar: updatedBar }).expect(200);
  const oldClientBar = { ...promoBar, text: 'Змінено зі старого редактора' };
  const oldClientEdit = await admin.put(themePath(legacy.id)).send({ name, promoBar: oldClientBar }).expect(200);
  assert.deepEqual(oldClientEdit.body.data.promoBar, { ...oldClientBar, ...editedPromoBarStyle });
  assert.deepEqual(await publicBar(), normalizedBar);
  await setActive(legacy.id, false);
  await admin.delete(themePath(legacy.id)).expect(204);
});

test('incomplete draft content is allowed but unsafe values are rejected', async () => {
  for (const invalidBar of [
    { buttonUrl: 'javascript:alert(1)' },
    { buttonUrl: '//outside.example.com/sale/' },
    { buttonUrl: '/\\outside.example.com/' },
    { backgroundColor: 'red;position:fixed' },
    { textFontSize: 9 },
    { textFontWeight: 450 },
    { buttonFontSize: 48.5 },
    { buttonFontWeight: '600' },
    { buttonPaddingY: -1 },
    { buttonPaddingX: 49 },
    { paddingX: 1000 },
    { showDesktop: 'yes' }
  ]) {
    await admin.post(themesPath).send({ name: 'Некоректна тема', promoBar: { ...promoBar, ...invalidBar } }).expect(422);
  }

  const blank = await createTheme('Чернетка', { ...promoBar, text: '', buttonText: '', buttonUrl: '' });
  await admin.post(`${themePath(blank.id)}/publish`).expect(422);
  await admin.delete(themePath(blank.id)).expect(204);
});

test('a reconnected store does not inherit any draft or active publication from the old connection generation', async () => {
  const theme = await createTheme('Попереднє підключення');
  await admin.post(`${themePath(theme.id)}/publish`).expect(200);
  await setActive(theme.id, true);
  assert.equal((await publicBar()).text, promoBar.text);

  await pool.query('UPDATE search_horoshop_connections SET generation = $1', [randomUUID()]);
  assert.equal(await publicBar(), null);
  assert.doesNotMatch(await sharedEmbed(), /site-themes\/embed\.js/u);
  const list = await admin.get(themesPath).expect(200);
  assert.deepEqual(list.body.data, []);
  await admin.put(themePath(theme.id)).send({ name: 'Стара тема', promoBar }).expect(404);
});
