function safeMetadata(metadata = {}) {
  return Object.fromEntries(Object.entries(metadata)
    .filter(([key]) => !/(authorization|credential|token|secret|code)/i.test(key))
    .map(([key, value]) => [key, value == null || ['string', 'number', 'boolean'].includes(typeof value) ? value : String(value)]));
}

export async function recordMobileSecurityEvent(db, {
  userId = null,
  deviceId = null,
  pairingId = null,
  loginRequestId = null,
  eventType,
  metadata = {}
}) {
  await db.query(
    `INSERT INTO mobile_security_events (
       user_id, device_id, pairing_id, login_request_id, event_type, metadata
     ) VALUES ($1, $2, $3, $4, $5, $6::JSONB)`,
    [userId, deviceId, pairingId, loginRequestId, eventType, JSON.stringify(safeMetadata(metadata))]
  );
}
