ALTER TABLE user_tool_access
  DROP CONSTRAINT IF EXISTS user_tool_access_tool_id_check;

ALTER TABLE user_tool_access
  DROP CONSTRAINT IF EXISTS user_tool_access_constraint_1;

ALTER TABLE user_tool_access
  ADD CONSTRAINT user_tool_access_tool_id_check CHECK (tool_id IN (
    'banner_grid', 'product_selection', 'product_tables', 'blog_publications',
    'chat', 'applications', 'form_builder', 'used_smartphones_catalog', 'trade_in',
    'store_map', 'facebook_group_publications'
  ));

ALTER TABLE tool_security_requirements
  DROP CONSTRAINT IF EXISTS tool_security_requirements_tool_id_check;

ALTER TABLE tool_security_requirements
  DROP CONSTRAINT IF EXISTS tool_security_requirements_constraint_1;

ALTER TABLE tool_security_requirements
  ADD CONSTRAINT tool_security_requirements_tool_id_check CHECK (tool_id IN (
    'banner_grid', 'product_selection', 'product_tables', 'blog_publications',
    'chat', 'applications', 'form_builder', 'used_smartphones_catalog', 'trade_in',
    'store_map', 'facebook_group_publications'
  ));

INSERT INTO tool_security_requirements (tool_id, requires_two_factor)
VALUES ('facebook_group_publications', FALSE)
ON CONFLICT (tool_id) DO NOTHING;

CREATE TABLE facebook_publication_stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(80) NOT NULL,
  normalized_code VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  city VARCHAR(120) NOT NULL,
  address VARCHAR(500) NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX facebook_publication_stores_city_idx
  ON facebook_publication_stores(city, status);

CREATE TABLE facebook_publication_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(300) NOT NULL,
  url VARCHAR(2000) NOT NULL,
  normalized_url VARCHAR(2000) NOT NULL UNIQUE,
  city VARCHAR(120) NOT NULL,
  default_store_id UUID NOT NULL REFERENCES facebook_publication_stores(id),
  notes TEXT NOT NULL DEFAULT '',
  advertising_policy VARCHAR(20) NOT NULL DEFAULT 'unknown'
    CHECK (advertising_policy IN ('allowed', 'forbidden', 'unknown')),
  moderation_required BOOLEAN NOT NULL DEFAULT FALSE,
  recommended_interval_days INTEGER NOT NULL DEFAULT 14
    CHECK (recommended_interval_days BETWEEN 0 AND 365),
  status VARCHAR(30) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'do_not_publish')),
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX facebook_publication_groups_city_idx
  ON facebook_publication_groups(city, status);
CREATE INDEX facebook_publication_groups_store_idx
  ON facebook_publication_groups(default_store_id);

CREATE TABLE facebook_publication_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 8388608),
  content BYTEA NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE facebook_publication_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(200) NOT NULL,
  promotion VARCHAR(160) NOT NULL DEFAULT '',
  planned_date DATE NOT NULL,
  text_variants JSONB NOT NULL DEFAULT '[]'::JSONB,
  asset_id UUID REFERENCES facebook_publication_assets(id),
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'completed')),
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX facebook_publication_campaigns_date_idx
  ON facebook_publication_campaigns(planned_date DESC, created_at DESC);

CREATE TABLE facebook_publication_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES facebook_publication_campaigns(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES facebook_publication_groups(id),
  store_id UUID NOT NULL REFERENCES facebook_publication_stores(id),
  group_name VARCHAR(300) NOT NULL,
  group_url VARCHAR(2000) NOT NULL,
  city VARCHAR(120) NOT NULL,
  store_name VARCHAR(200) NOT NULL,
  address VARCHAR(500) NOT NULL,
  rendered_text TEXT NOT NULL,
  text_variant_index INTEGER NOT NULL DEFAULT 0,
  asset_id UUID REFERENCES facebook_publication_assets(id),
  status VARCHAR(30) NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'published', 'pending_moderation', 'rejected', 'skipped')),
  warnings JSONB NOT NULL DEFAULT '[]'::JSONB,
  retry_of_target_id UUID REFERENCES facebook_publication_targets(id),
  post_url VARCHAR(2000) NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  opened_at TIMESTAMPTZ,
  copied_at TIMESTAMPTZ,
  image_opened_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES users(id),
  updated_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX facebook_publication_targets_campaign_idx
  ON facebook_publication_targets(campaign_id, created_at);
CREATE INDEX facebook_publication_targets_group_history_idx
  ON facebook_publication_targets(group_id, published_at DESC);
CREATE INDEX facebook_publication_targets_status_idx
  ON facebook_publication_targets(status, updated_at DESC);

CREATE TABLE facebook_publication_target_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id UUID NOT NULL REFERENCES facebook_publication_targets(id) ON DELETE CASCADE,
  event_type VARCHAR(30) NOT NULL
    CHECK (event_type IN ('created', 'status', 'text_updated', 'retry_created', 'activity')),
  previous_status VARCHAR(30),
  next_status VARCHAR(30),
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX facebook_publication_target_events_target_idx
  ON facebook_publication_target_events(target_id, created_at DESC);
CREATE INDEX facebook_publication_target_events_actor_idx
  ON facebook_publication_target_events(created_by, created_at DESC);
