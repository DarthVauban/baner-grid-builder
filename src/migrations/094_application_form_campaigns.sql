BEGIN;

CREATE TABLE application_form_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  form_id UUID NOT NULL REFERENCES application_forms(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES search_horoshop_connections(id) ON DELETE SET NULL,
  connection_generation UUID,
  name VARCHAR(160) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused')),
  priority INTEGER NOT NULL DEFAULT 100 CHECK (priority BETWEEN 0 AND 1000),
  button_text VARCHAR(120) NOT NULL DEFAULT 'Передзамовити',
  button_styles JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (jsonb_typeof(button_styles) = 'object'),
  placement JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (jsonb_typeof(placement) = 'object'),
  availability_mode VARCHAR(30) NOT NULL DEFAULT 'all'
    CHECK (availability_mode IN ('all', 'out_of_stock')),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE application_form_campaign_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES application_form_campaigns(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES search_horoshop_products(id) ON DELETE CASCADE,
  modification_id UUID REFERENCES search_horoshop_modifications(id) ON DELETE CASCADE,
  product_external_id TEXT NOT NULL,
  modification_external_id TEXT,
  sku VARCHAR(300) NOT NULL DEFAULT '',
  title VARCHAR(500) NOT NULL DEFAULT '',
  target_key VARCHAR(700) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, target_key)
);

CREATE INDEX application_form_campaigns_status_priority_idx
  ON application_form_campaigns(status, priority DESC, updated_at DESC)
  WHERE archived_at IS NULL;

CREATE INDEX application_form_campaigns_form_idx
  ON application_form_campaigns(form_id, updated_at DESC)
  WHERE archived_at IS NULL;

CREATE INDEX application_form_campaign_targets_lookup_idx
  ON application_form_campaign_targets(campaign_id, product_id, modification_id);

ALTER TABLE applications
  ADD COLUMN campaign_id UUID REFERENCES application_form_campaigns(id) ON DELETE SET NULL,
  ADD COLUMN campaign_public_id UUID,
  ADD COLUMN campaign_name_snapshot VARCHAR(160) NOT NULL DEFAULT '';

CREATE INDEX applications_campaign_created_idx
  ON applications(campaign_id, created_at DESC);

ALTER TABLE application_product_snapshots
  ADD COLUMN external_modification_id VARCHAR(180) NOT NULL DEFAULT '';

-- Retire storefront-wide installment buttons. Their records remain available for
-- rollback/history, but deployed legacy snippets stop rendering after this release.
UPDATE application_button_configurations
SET active = FALSE, updated_at = NOW()
WHERE active = TRUE AND archived_at IS NULL;

COMMIT;
