ALTER TABLE users
  ADD COLUMN IF NOT EXISTS two_factor_secret_ciphertext TEXT,
  ADD COLUMN IF NOT EXISTS two_factor_secret_iv VARCHAR(32),
  ADD COLUMN IF NOT EXISTS two_factor_secret_tag VARCHAR(32),
  ADD COLUMN IF NOT EXISTS two_factor_pending_secret_ciphertext TEXT,
  ADD COLUMN IF NOT EXISTS two_factor_pending_secret_iv VARCHAR(32),
  ADD COLUMN IF NOT EXISTS two_factor_pending_secret_tag VARCHAR(32),
  ADD COLUMN IF NOT EXISTS two_factor_pending_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS two_factor_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS two_factor_last_used_step BIGINT;

CREATE TABLE user_two_factor_recovery_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX user_two_factor_recovery_codes_user_idx
  ON user_two_factor_recovery_codes(user_id);

CREATE TABLE tool_security_requirements (
  tool_id VARCHAR(50) PRIMARY KEY CHECK (tool_id IN (
    'banner_grid', 'product_selection', 'product_tables', 'blog_publications', 'chat'
  )),
  requires_two_factor BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO tool_security_requirements (tool_id, requires_two_factor)
VALUES
  ('banner_grid', FALSE),
  ('product_selection', FALSE),
  ('product_tables', FALSE),
  ('blog_publications', FALSE),
  ('chat', FALSE)
ON CONFLICT (tool_id) DO NOTHING;
