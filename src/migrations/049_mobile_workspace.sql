ALTER TABLE users
  ADD COLUMN IF NOT EXISTS two_factor_method VARCHAR(30);

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_two_factor_method_check;

ALTER TABLE users
  ADD CONSTRAINT users_two_factor_method_check
  CHECK (two_factor_method IS NULL OR two_factor_method IN ('totp', 'mt_workspace'));

UPDATE users
SET two_factor_method = 'totp'
WHERE two_factor_enabled = TRUE AND two_factor_method IS NULL;

CREATE TABLE IF NOT EXISTS mobile_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  platform VARCHAR(20) NOT NULL CHECK (platform IN ('android', 'ios')),
  access_token_hash TEXT NOT NULL UNIQUE,
  fcm_token_ciphertext TEXT,
  fcm_token_iv VARCHAR(32),
  fcm_token_tag VARCHAR(32),
  fcm_token_hash TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  revocation_reason VARCHAR(240)
);

CREATE INDEX IF NOT EXISTS mobile_devices_user_active_idx
  ON mobile_devices(user_id, paired_at DESC);

CREATE TABLE IF NOT EXISTS mobile_pairings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose VARCHAR(20) NOT NULL CHECK (purpose IN ('enable_2fa', 'add_device')),
  qr_token_hash TEXT NOT NULL UNIQUE,
  manual_code_hash TEXT NOT NULL UNIQUE,
  secret_ciphertext TEXT NOT NULL,
  secret_iv VARCHAR(32) NOT NULL,
  secret_tag VARCHAR(32) NOT NULL,
  recovery_codes_ciphertext TEXT,
  recovery_codes_iv VARCHAR(32),
  recovery_codes_tag VARCHAR(32),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'claimed', 'expired', 'cancelled')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  claimed_device_id UUID REFERENCES mobile_devices(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS mobile_pairings_pending_enable_user_idx
  ON mobile_pairings(user_id)
  WHERE purpose = 'enable_2fa' AND status = 'pending';

CREATE INDEX IF NOT EXISTS mobile_pairings_user_created_idx
  ON mobile_pairings(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS mobile_login_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_hash TEXT NOT NULL UNIQUE,
  browser VARCHAR(160) NOT NULL DEFAULT '',
  operating_system VARCHAR(160) NOT NULL DEFAULT '',
  location VARCHAR(240) NOT NULL DEFAULT 'Місце не визначено',
  ip_address VARCHAR(64) NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'denied', 'expired')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  decided_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  decided_by_device_id UUID REFERENCES mobile_devices(id) ON DELETE SET NULL,
  decision_method VARCHAR(20)
    CHECK (decision_method IS NULL OR decision_method IN ('mobile', 'totp', 'recovery', 'passkey'))
);

CREATE INDEX IF NOT EXISTS mobile_login_requests_user_status_idx
  ON mobile_login_requests(user_id, status, requested_at DESC);

CREATE TABLE IF NOT EXISTS mobile_push_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES mobile_devices(id) ON DELETE CASCADE,
  kind VARCHAR(40) NOT NULL
    CHECK (kind IN ('login_request', 'workspace_notification', 'device_revoked')),
  notification_id UUID REFERENCES notifications(id) ON DELETE CASCADE,
  login_request_id UUID REFERENCES mobile_login_requests(id) ON DELETE CASCADE,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(payload) = 'object'),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'delivered', 'retry', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  last_error VARCHAR(160),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mobile_push_outbox_delivery_idx
  ON mobile_push_outbox(status, available_at, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS mobile_push_outbox_notification_device_idx
  ON mobile_push_outbox(device_id, notification_id)
  WHERE notification_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS mobile_push_outbox_login_device_idx
  ON mobile_push_outbox(device_id, login_request_id)
  WHERE login_request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS mobile_security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  device_id UUID REFERENCES mobile_devices(id) ON DELETE SET NULL,
  pairing_id UUID REFERENCES mobile_pairings(id) ON DELETE SET NULL,
  login_request_id UUID REFERENCES mobile_login_requests(id) ON DELETE SET NULL,
  event_type VARCHAR(80) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mobile_security_events_user_created_idx
  ON mobile_security_events(user_id, created_at DESC);
