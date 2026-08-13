ALTER TABLE mobile_devices
  DROP CONSTRAINT IF EXISTS mobile_devices_fcm_token_hash_key;

DROP INDEX IF EXISTS mobile_devices_fcm_token_hash_key;

CREATE INDEX IF NOT EXISTS mobile_devices_fcm_token_hash_idx
  ON mobile_devices(fcm_token_hash)
  WHERE fcm_token_hash IS NOT NULL;

ALTER TABLE mobile_devices
  ADD COLUMN IF NOT EXISTS installation_id_hash TEXT,
  ADD COLUMN IF NOT EXISTS auth_key_id VARCHAR(160),
  ADD COLUMN IF NOT EXISTS auth_public_key JSONB,
  ADD COLUMN IF NOT EXISTS auth_key_algorithm VARCHAR(20),
  ADD COLUMN IF NOT EXISTS auth_key_version INTEGER,
  ADD COLUMN IF NOT EXISTS auth_key_registered_at TIMESTAMPTZ;

ALTER TABLE mobile_devices
  DROP CONSTRAINT IF EXISTS mobile_devices_auth_key_check;

ALTER TABLE mobile_devices
  ADD CONSTRAINT mobile_devices_auth_key_check CHECK (
    (
      auth_key_id IS NULL
      AND auth_public_key IS NULL
      AND auth_key_algorithm IS NULL
      AND auth_key_version IS NULL
      AND auth_key_registered_at IS NULL
    )
    OR
    (
      auth_key_id IS NOT NULL
      AND auth_public_key IS NOT NULL
      AND jsonb_typeof(auth_public_key) = 'object'
      AND auth_key_algorithm = 'ES256'
      AND auth_key_version = 1
      AND auth_key_registered_at IS NOT NULL
    )
  );

CREATE INDEX IF NOT EXISTS mobile_devices_installation_idx
  ON mobile_devices(installation_id_hash)
  WHERE installation_id_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS mobile_qr_login_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id VARCHAR(160) NOT NULL,
  scan_token_hash TEXT NOT NULL UNIQUE,
  browser_token_hash TEXT NOT NULL UNIQUE,
  approval_nonce_hash TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'denied', 'expired', 'consumed', 'cancelled')),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_device_id UUID REFERENCES mobile_devices(id) ON DELETE SET NULL,
  browser VARCHAR(160) NOT NULL DEFAULT '',
  operating_system VARCHAR(160) NOT NULL DEFAULT '',
  ip_address VARCHAR(64) NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  location VARCHAR(240) NOT NULL DEFAULT 'Місце не визначено',
  return_path VARCHAR(2048) NOT NULL DEFAULT '/',
  denial_reason VARCHAR(160),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  scanned_at TIMESTAMPTZ,
  decided_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS mobile_qr_login_status_expiry_idx
  ON mobile_qr_login_challenges(status, expires_at);

CREATE INDEX IF NOT EXISTS mobile_qr_login_user_created_idx
  ON mobile_qr_login_challenges(user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS mobile_qr_login_device_created_idx
  ON mobile_qr_login_challenges(approved_device_id, created_at DESC)
  WHERE approved_device_id IS NOT NULL;

ALTER TABLE mobile_security_events
  ADD COLUMN IF NOT EXISTS qr_login_challenge_id UUID
    REFERENCES mobile_qr_login_challenges(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS mobile_security_events_qr_login_idx
  ON mobile_security_events(qr_login_challenge_id, created_at DESC)
  WHERE qr_login_challenge_id IS NOT NULL;
