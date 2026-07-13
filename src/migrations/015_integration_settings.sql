CREATE TABLE integration_settings (
  key VARCHAR(80) PRIMARY KEY,
  display_name VARCHAR(120) NOT NULL,
  public_config JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(public_config) = 'object'),
  secret_ciphertext TEXT,
  secret_iv VARCHAR(32),
  secret_tag VARCHAR(32),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
