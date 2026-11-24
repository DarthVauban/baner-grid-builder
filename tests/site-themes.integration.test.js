import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.SITE_THEMES_TEST_DATABASE_URL || 'pg-mem://site-themes-tests';
process.env.JWT_SECRET = 'site-themes-test-secret-0123456789';
process.env.COOKIE_SECURE = 'false';
process.env.APP_ORIGIN = 'https://panel.example.com';
process.env.ADMIN_NAME = 'Site Themes Admin';
process.env.ADMIN_EMAIL = 'site-themes-admin@test.local';
process.env.ADMIN_PASSWORD = 'AdminPassword123!';
const mediaDir = await mkdtemp(join(tmpdir(), 'mt-site-theme-images-'));
process.env.CATALOG_MEDIA_DIR = mediaDir;

const { default: app } = await import('../src/app.js');
const { pool } = await import('../src/db/pool.js');
const { runMigrations } = await import('../src/db/migrate.js');
const { ensureBootstrapAdmin } = await import('../src/modules/users/user.service.js');

const admin = request.agent(app);
const themesPath = '/api/site-themes';
const publicBarPath = '/api/public/site-themes/promo-bar';
const appearancePath = '/api/public/site-themes/appearance';
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
  mode: 'standard',
  marqueeSpeed: 60,
  backgroundImageUrl: '',
  goldGlint: null,
  textFontSize: 14,
  textFontWeight: 'inherit',
  buttonFontSize: 14,
  buttonFontWeight: 600,
  buttonPaddingY: 4,
  buttonPaddingX: 12
};
const editedPromoBarStyle = {
  ...defaultPromoBarStyle,
  textFontSize: 24,
  textFontWeight: 700,
  buttonFontSize: 18,
  buttonFontWeight: 800,
  buttonPaddingY: 10,
  buttonPaddingX: 20
};
const goldGlint = {
  color: '#ffcc48', intensity: 55, durationMs: 1400, repeat: 'interval', intervalSeconds: 12
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
  await rm(mediaDir, { recursive: true, force: true });
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
    { backgroundImageUrl: 'data:image/svg+xml,<!-- -->' },
    { backgroundImageUrl: 'https://user:password@example.com/image.png' },
    { backgroundImageUrl: '/media/catalog/library/../other.webp' },
    { mode: 'invalid' },
    { marqueeSpeed: 19 },
    { marqueeSpeed: 241 },
    { goldGlint: { ...goldGlint, color: 'red;position:fixed' } },
    { goldGlint: { ...goldGlint, durationMs: 4001 } },
    { goldGlint: { ...goldGlint, intervalSeconds: 4 } },
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

test('uploads a public promo background and publishes a marquee independently of the saved button draft', async () => {
  const imagePath = `${themesPath}/background-image`;
  await request(app).post(imagePath).set('Content-Type', 'image/png').expect(401);
  await admin.post(imagePath).set('Content-Type', 'image/svg+xml').send('<svg />').expect(415);
  const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } }).png().toBuffer();
  const response = await admin.post(imagePath).set('Content-Type', 'image/png')
    .set('X-File-Name', 'banner.png').send(png).expect(201);
  const backgroundImageUrl = response.body.data.url;
  assert.match(backgroundImageUrl, /^\/media\/catalog\/library\/.*\.webp$/u);
  await request(app).get(backgroundImageUrl).expect('Content-Type', 'image/webp').expect(200);

  const name = 'Біжуча акція';
  const marquee = {
    ...promoBar,
    buttonUrl: '',
    mode: 'marquee',
    marqueeSpeed: 100,
    backgroundImageUrl
  };
  const theme = await createTheme(name, marquee);
  await admin.post(`${themePath(theme.id)}/publish`).expect(200);
  await setActive(theme.id, true);
  assert.deepEqual(await publicBar(), { ...defaultPromoBarStyle, ...marquee });

  await admin.put(themePath(theme.id)).send({
    name,
    promoBar: { ...marquee, mode: 'standard', backgroundImageUrl: '' }
  }).expect(200);
  await admin.post(`${themePath(theme.id)}/publish`).expect(422);
  assert.equal((await publicBar()).mode, 'marquee');
  assert.equal((await publicBar()).backgroundImageUrl, backgroundImageUrl);
  await setActive(theme.id, false);
  await admin.delete(themePath(theme.id)).expect(204);
});

test('publishes a gold glint and toggles its live visibility independently of the draft', async () => {
  const name = 'Чорна п’ятниця з відблиском';
  const theme = await createTheme(name, { ...promoBar, goldGlint });
  const visibilityPath = `${themePath(theme.id)}/effects/gold-glint/visibility`;
  assert.equal(theme.goldGlintEnabled, true);
  const publication = await admin.post(`${themePath(theme.id)}/publish`).expect(200);
  await setActive(theme.id, true);
  assert.deepEqual((await publicBar()).goldGlint, goldGlint);

  const hidden = await admin.put(visibilityPath).send({ enabled: false }).expect(200);
  assert.equal(hidden.body.data.goldGlintEnabled, false);
  assert.equal(hidden.body.data.hasUnpublishedChanges, false);
  assert.equal(hidden.body.data.publishedAt, publication.body.data.publishedAt);
  assert.equal((await publicBar()).goldGlint, null);

  const edited = { ...goldGlint, intensity: 75 };
  await admin.put(themePath(theme.id)).send({ name, promoBar: { ...promoBar, goldGlint: edited } }).expect(200);
  await admin.put(visibilityPath).send({ enabled: true }).expect(200);
  assert.deepEqual((await publicBar()).goldGlint, goldGlint);
  await admin.post(`${themePath(theme.id)}/publish`).expect(200);
  assert.deepEqual((await publicBar()).goldGlint, edited);

  await setActive(theme.id, false);
  await admin.delete(themePath(theme.id)).expect(204);
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

test('standalone effects publish and toggle independently of the promo strip', async () => {
  const cornerRibbons = {
    imageUrl: '', opacity: 90,
    desktop: { placement: 'both', size: 110 }, mobile: { placement: 'right', size: 60 }
  };
  const confetti = {
    primaryColor: '#ffcc48', secondaryColor: '#171717', count: 42, durationMs: 1800,
    delayMs: 500, frequency: 'session', showDesktop: true, showMobile: true
  };
  const storefrontEffects = { cornerRibbons, confetti };
  const name = 'Святкова вітрина';
  const emptyPromoBar = { ...promoBar, text: '', buttonText: '', buttonUrl: '' };
  for (const invalidEffects of [
    { cornerRibbons: { ...cornerRibbons, mobile: { ...cornerRibbons.mobile, size: 270 } } },
    { cornerRibbons: { ...cornerRibbons, imageUrl: 'javascript:alert(1)' } },
    { confetti: { ...confetti, count: 101 } }
  ]) {
    await admin.post(themesPath).send({ name, promoBar: emptyPromoBar, storefrontEffects: invalidEffects }).expect(422);
  }
  const created = await admin.post(themesPath).send({ name, promoBar: emptyPromoBar, storefrontEffects }).expect(201);
  const { id } = created.body.data;
  const path = themePath(id);
  await admin.put(`${path}/promo-bar/visibility`).send({ enabled: false }).expect(200);
  await admin.post(`${path}/publish`).expect(200);
  await setActive(id, true);

  async function appearance(origin = shopOrigin) {
    return (await request(app).get(appearancePath).set('Origin', origin).expect(200)).body.data;
  }

  assert.deepEqual(await appearance(), { themeId: id, promoBar: null, storefrontEffects });
  assert.equal(await publicBar(), null);
  assert.equal(await appearance('https://other.example.com'), null);
  assert.match(await sharedEmbed(), /site-themes\/embed\.js/u);

  const olderClient = await admin.put(path).send({ name, promoBar: emptyPromoBar }).expect(200);
  assert.deepEqual(olderClient.body.data.storefrontEffects, storefrontEffects);
  await admin.put(path).send({ name, promoBar: emptyPromoBar, storefrontEffects: { confetti: null } }).expect(200);
  assert.deepEqual((await appearance()).storefrontEffects, storefrontEffects);
  await admin.put(`${path}/effects/cornerRibbons/visibility`).send({ enabled: false }).expect(200);
  assert.deepEqual((await appearance()).storefrontEffects, { cornerRibbons: null, confetti });
  await admin.put(`${path}/effects/confetti/visibility`).send({ enabled: false }).expect(200);
  assert.equal(await appearance(), null);
  assert.doesNotMatch(await sharedEmbed(), /site-themes\/embed\.js/u);
  await setActive(id, false);
  await admin.delete(path).expect(204);
});
