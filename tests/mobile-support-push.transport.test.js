import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupportPushTransport } from '../src/modules/mobile/mobile-support-push.transport.js';

const messaging = { app: { options: { projectId: 'support-test-project', credential: { getAccessToken: async () => ({ access_token: 'test-token' }) } } } };
const message = { token: 'test-device-token', data: { kind: 'support_chat_message' }, android: { priority: 'high', ttl: 12345, notification: { tag: 'stable' } } };

test('bounded FCM HTTP transport preserves notification identity and converts Admin TTL units', async () => {
  let calls = 0;
  const transport = await createSupportPushTransport(messaging, async (url, options) => {
    calls++;
    assert.equal(url, 'https://fcm.googleapis.com/v1/projects/support-test-project/messages:send');
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.redirect, 'error');
    const sent = JSON.parse(options.body).message;
    assert.equal(sent.android.ttl, '12s');
    assert.equal(sent.android.priority, 'HIGH');
    assert.equal(sent.android.notification.tag, 'stable');
    return { ok: true, json: async () => ({ name: 'accepted' }) };
  });
  assert.equal(await transport.send(message), 'accepted');
  assert.equal(calls, 1);
});

test('transport does not internally retry and only explicit UNREGISTERED invalidates a token', async () => {
  for (const [status, details, expected] of [
    [404, [], 'FCM_DELIVERY_REJECTED'],
    [404, [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode: 'UNREGISTERED' }], 'messaging/registration-token-not-registered'],
    [429, [], 'messaging/quota-exceeded'], [503, [], 'messaging/server-unavailable']
  ]) {
    let calls = 0;
    const transport = await createSupportPushTransport(messaging, async () => {
      calls++; return { ok: false, status, json: async () => ({ error: { details } }) };
    });
    await assert.rejects(transport.send(message), { code: expected });
    assert.equal(calls, 1);
  }
  const transport = await createSupportPushTransport(messaging, async () => { throw new Error('timeout'); });
  await assert.rejects(transport.send(message), { code: 'messaging/server-unavailable' });
});
