CREATE TABLE user_passkeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  device_type VARCHAR(32) NOT NULL,
  backed_up BOOLEAN NOT NULL DEFAULT FALSE,
  transports JSONB NOT NULL DEFAULT '[]'::JSONB,
  name VARCHAR(120) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX user_passkeys_user_idx ON user_passkeys(user_id, created_at DESC);

CREATE TABLE user_passkey_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose VARCHAR(20) NOT NULL CHECK (purpose IN ('registration', 'login')),
  challenge TEXT NOT NULL,
  expected_origin TEXT NOT NULL,
  rp_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX user_passkey_challenges_user_idx
  ON user_passkey_challenges(user_id, purpose, created_at DESC);
CREATE INDEX user_passkey_challenges_expiry_idx
  ON user_passkey_challenges(expires_at);
