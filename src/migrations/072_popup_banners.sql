ALTER TABLE user_tool_access
  DROP CONSTRAINT IF EXISTS user_tool_access_tool_id_check;

ALTER TABLE user_tool_access
  DROP CONSTRAINT IF EXISTS user_tool_access_constraint_1;

ALTER TABLE user_tool_access
  ADD CONSTRAINT user_tool_access_tool_id_check CHECK (tool_id IN (
    'banner_grid', 'product_selection', 'product_tables', 'blog_publications',
    'chat', 'applications', 'form_builder', 'used_smartphones_catalog', 'trade_in',
    'store_map', 'facebook_group_publications', 'horoshop_related_products',
    'horoshop_photo_parser', 'online_support', 'popup_banners'
  ));

ALTER TABLE tool_security_requirements
  DROP CONSTRAINT IF EXISTS tool_security_requirements_tool_id_check;

ALTER TABLE tool_security_requirements
  DROP CONSTRAINT IF EXISTS tool_security_requirements_constraint_1;

ALTER TABLE tool_security_requirements
  ADD CONSTRAINT tool_security_requirements_tool_id_check CHECK (tool_id IN (
    'banner_grid', 'product_selection', 'product_tables', 'blog_publications',
    'chat', 'applications', 'form_builder', 'used_smartphones_catalog', 'trade_in',
    'store_map', 'facebook_group_publications', 'horoshop_related_products',
    'horoshop_photo_parser', 'online_support', 'popup_banners'
  ));

INSERT INTO tool_security_requirements (tool_id, requires_two_factor)
VALUES ('popup_banners', FALSE)
ON CONFLICT (tool_id) DO NOTHING;

ALTER TABLE search_horoshop_products
  ADD COLUMN stickers JSONB NOT NULL DEFAULT '[]'::JSONB,
  ADD COLUMN condition_label TEXT;

ALTER TABLE search_horoshop_modifications
  ADD COLUMN stickers JSONB NOT NULL DEFAULT '[]'::JSONB,
  ADD COLUMN condition_label TEXT;

CREATE TABLE popup_banner_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  connection_id UUID REFERENCES search_horoshop_connections(id) ON DELETE SET NULL,
  connection_generation UUID,
  name VARCHAR(160) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused')),
  priority INTEGER NOT NULL DEFAULT 100 CHECK (priority BETWEEN 0 AND 1000),
  content JSONB NOT NULL DEFAULT '{}'::JSONB,
  styles JSONB NOT NULL DEFAULT '{}'::JSONB,
  targeting JSONB NOT NULL DEFAULT '{}'::JSONB,
  behavior JSONB NOT NULL DEFAULT '{}'::JSONB,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE popup_banner_product_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES popup_banner_campaigns(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES search_horoshop_products(id) ON DELETE CASCADE,
  modification_id UUID REFERENCES search_horoshop_modifications(id) ON DELETE CASCADE,
  target_key VARCHAR(96) NOT NULL,
  input_value VARCHAR(500) NOT NULL DEFAULT '',
  matched_by VARCHAR(30) NOT NULL DEFAULT 'manual'
    CHECK (matched_by IN ('product_sku', 'modification_sku', 'product_title', 'modification_title', 'manual')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, target_key)
);

CREATE TABLE popup_banner_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES popup_banner_campaigns(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  snapshot JSONB NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, version_number)
);

CREATE TABLE popup_banner_events (
  id BIGSERIAL PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES popup_banner_campaigns(id) ON DELETE CASCADE,
  product_id UUID REFERENCES search_horoshop_products(id) ON DELETE SET NULL,
  modification_id UUID REFERENCES search_horoshop_modifications(id) ON DELETE SET NULL,
  event_type VARCHAR(24) NOT NULL
    CHECK (event_type IN ('impression', 'dismiss', 'click', 'acknowledge')),
  visitor_key_hash VARCHAR(64),
  page_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX popup_banner_campaigns_status_priority_idx
  ON popup_banner_campaigns (status, priority DESC, updated_at DESC);

CREATE INDEX popup_banner_targets_campaign_idx
  ON popup_banner_product_targets (campaign_id, product_id, modification_id);

CREATE INDEX popup_banner_events_campaign_created_idx
  ON popup_banner_events (campaign_id, created_at DESC);

CREATE INDEX popup_banner_events_created_idx
  ON popup_banner_events (created_at DESC);
