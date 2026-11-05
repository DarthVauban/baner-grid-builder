// Support dispatch holds the subscription gate: use one cancellable HTTP request,
// not Admin SDK internal retries that could outlive an unsubscribe timeout.
const deadlineMs = 30_000;
const deliveryError = (code) => Object.assign(new Error('Support push transport failed'), { code });

export async function createSupportPushTransport(messaging, fetchImpl = fetch) {
  // Test/injected transports have no Firebase app and retain their explicit send.
  if (!messaging.app) return messaging;
  let timer;
  let credential;
  try {
    credential = await Promise.race([
      messaging.app.options.credential.getAccessToken(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(deliveryError('messaging/server-unavailable')), deadlineMs); })
    ]);
  } finally { clearTimeout(timer); }
  // Credential refresh happens BEFORE acquiring the gate; abandoning it cannot
  // send a notification. No token/credential is logged or persisted in outbox.
  const projectId = messaging.app.options.projectId;
  return {
    async send(message) {
      const restMessage = { ...message, android: { ...message.android,
        priority: 'HIGH', ttl: `${Math.floor(message.android.ttl / 1000)}s` } };
      if (message.android.notification) {
        const { channelId, ...notification } = message.android.notification;
        restMessage.android.notification = { ...notification,
          ...(channelId === undefined ? {} : { channel_id: channelId }) };
      }
      let response, payload;
      try {
        response = await fetchImpl(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`, {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(deadlineMs),
          headers: { Authorization: `Bearer ${credential.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: restMessage })
        });
        payload = await response.json();
      } catch { throw deliveryError('messaging/server-unavailable'); }
      if (response.ok) return payload?.name;
      const details = payload?.error?.details;
      const unregistered = Array.isArray(details) && details.some((item) => item['@type'] === 'type.googleapis.com/google.firebase.fcm.v1.FcmError' && item.errorCode === 'UNREGISTERED');
      if (unregistered) throw deliveryError('messaging/registration-token-not-registered');
      if (response.status === 429) throw deliveryError('messaging/quota-exceeded');
      if (response.status >= 500) throw deliveryError('messaging/server-unavailable');
      throw deliveryError('FCM_DELIVERY_REJECTED');
    }
  };
}
