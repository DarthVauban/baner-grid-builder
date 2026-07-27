CREATE TABLE trade_in_settings (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE,
  public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  public_origin VARCHAR(500) NOT NULL DEFAULT '',
  draft_config JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(draft_config) = 'object'),
  published_config JSONB CHECK (published_config IS NULL OR jsonb_typeof(published_config) = 'object'),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  CONSTRAINT trade_in_settings_singleton CHECK (id)
);

INSERT INTO trade_in_settings (id)
VALUES (TRUE)
ON CONFLICT (id) DO NOTHING;
