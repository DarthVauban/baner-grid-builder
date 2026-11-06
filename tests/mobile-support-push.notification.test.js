import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSupportPushNotification } from '../src/modules/mobile/mobile-support-push.notification.js';

const visitorId = 'abc12345-0000-4000-8000-000000000001';
const segments = (value) => [...new Intl.Segmenter('uk', { granularity: 'grapheme' }).segment(value)].map((item) => item.segment);
const encodedBytes = (value) => Buffer.byteLength(JSON.stringify(value), 'utf8') - 2;

test('support preview identifies the visitor and normalizes whitespace, controls and bidi into one line', () => {
  assert.deepEqual(buildSupportPushNotification({ visitorId, visitorName: '  Олександр\u202E\n Іванов\u2069 ',
    body: ' Підкажіть\r\n\tнаявність\u0000 iPhone\u200B16?\u061C ' }), {
    title: 'Олександр Іванов: Підкажіть наявність iPhone 16?', body: 'Підкажіть наявність iPhone 16?'
  });
});

test('anonymous and empty previews have stable, meaningful fallbacks', () => {
  for (const visitorName of ['', null, '\u202E\u0000\t']) {
    assert.deepEqual(buildSupportPushNotification({ visitorId, visitorName, body: '\u0000\n\u2066' }), {
      title: 'Відвідувач abc123: Нове повідомлення', body: 'Нове повідомлення'
    });
  }
});

test('grapheme limits include the ellipsis and do not truncate values at the exact boundary', () => {
  const value = buildSupportPushNotification({ visitorId, visitorName: 'N'.repeat(41), body: 'T'.repeat(181) });
  assert.equal(value.title, `${'N'.repeat(39)}…: ${'T'.repeat(59)}…`);
  assert.equal(value.body, `${'T'.repeat(179)}…`);
  const exact = buildSupportPushNotification({ visitorId, visitorName: 'N'.repeat(40), body: 'T'.repeat(60) });
  assert.equal(exact.title, `${'N'.repeat(40)}: ${'T'.repeat(60)}`);
});

test('long Unicode previews retain complete combined accents, flags, skin tones and ZWJ emoji', () => {
  const pattern = 'е\u0301👨‍👩‍👧‍👦🇺🇦👍🏽';
  const value = buildSupportPushNotification({ visitorId, visitorName: pattern.repeat(20), body: pattern.repeat(100) });
  const [label, title] = value.title.split(': ');
  const allowed = new Set(['е́'.normalize('NFC'), '👨‍👩‍👧‍👦', '🇺🇦', '👍🏽', '…']);
  for (const [text, limit] of [[label, 40], [title, 60], [value.body, 180]]) {
    assert.ok(segments(text).length <= limit);
    assert.ok(segments(text).every((segment) => allowed.has(segment)));
    assert.ok(text.endsWith('…'));
  }
});

test('encoded UTF-8 caps leave FCM routing room even for large emoji and JSON escaping', () => {
  const text = '"\\👨‍👩‍👧‍👦'.repeat(500);
  const value = buildSupportPushNotification({ visitorId, visitorName: text, body: text });
  const [label, title] = value.title.split(': ');
  assert.ok(encodedBytes(label) <= 256);
  assert.ok(encodedBytes(title) <= 512);
  assert.ok(encodedBytes(value.body) <= 1536);
  assert.ok(encodedBytes(value.title) + encodedBytes(value.body) < 2400);
  const routed = { notification: value, data: { kind: 'support_chat_message', schemaVersion: '1',
    pushId: visitorId, deploymentId: 'd'.repeat(160), environment: 'development', targetDeviceId: visitorId,
    conversationId: visitorId, messageId: visitorId, expiresAt: '2026-11-06T12:00:00.000Z' },
  android: { priority: 'HIGH', ttl: '900s', notification: { tag: 't'.repeat(54), channel_id: 'support_chat_v1' } },
  apns: { headers: { 'apns-expiration': '1793966400', 'apns-collapse-id': 't'.repeat(54) } } };
  assert.ok(Buffer.byteLength(JSON.stringify(routed), 'utf8') < 4096);
});

test('an oversized single grapheme falls back without splitting it and malformed UTF-16 is repaired', () => {
  const hugeCluster = 'x' + '\u0301'.repeat(3000);
  assert.deepEqual(buildSupportPushNotification({ visitorId, visitorName: hugeCluster, body: hugeCluster }), {
    title: 'Відвідувач abc123: Нове повідомлення', body: 'Нове повідомлення'
  });
  assert.equal(buildSupportPushNotification({ visitorId, visitorName: 'Клієнт', body: '😀\uD800' }).body, '😀\uFFFD');
});
