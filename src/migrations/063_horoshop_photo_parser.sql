ALTER TABLE user_tool_access
  DROP CONSTRAINT IF EXISTS user_tool_access_tool_id_check;

ALTER TABLE user_tool_access
  DROP CONSTRAINT IF EXISTS user_tool_access_constraint_1;

ALTER TABLE user_tool_access
  ADD CONSTRAINT user_tool_access_tool_id_check CHECK (tool_id IN (
    'banner_grid', 'product_selection', 'product_tables', 'blog_publications',
    'chat', 'applications', 'form_builder', 'used_smartphones_catalog', 'trade_in',
    'store_map', 'facebook_group_publications', 'horoshop_related_products',
    'horoshop_photo_parser', 'online_support'
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
    'horoshop_photo_parser', 'online_support'
  ));

INSERT INTO tool_security_requirements (tool_id, requires_two_factor)
VALUES ('horoshop_photo_parser', FALSE)
ON CONFLICT (tool_id) DO NOTHING;

CREATE TABLE search_horoshop_photo_selections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES search_horoshop_connections(id) ON DELETE CASCADE,
  generation UUID NOT NULL,
  name VARCHAR(160) NOT NULL,
  input_lines JSONB NOT NULL DEFAULT '[]'::JSONB,
  resolution JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE search_horoshop_photo_selection_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  selection_id UUID NOT NULL REFERENCES search_horoshop_photo_selections(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES search_horoshop_products(id) ON DELETE CASCADE,
  modification_id UUID REFERENCES search_horoshop_modifications(id) ON DELETE CASCADE,
  target_key VARCHAR(80) NOT NULL,
  input_value VARCHAR(500) NOT NULL DEFAULT '',
  matched_by VARCHAR(30) NOT NULL DEFAULT 'manual' CHECK (matched_by IN (
    'product_sku', 'modification_sku', 'product_title', 'modification_title', 'manual'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (selection_id, target_key)
);

CREATE TABLE search_horoshop_photo_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES search_horoshop_connections(id) ON DELETE CASCADE,
  generation UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES search_horoshop_products(id) ON DELETE CASCADE,
  modification_id UUID REFERENCES search_horoshop_modifications(id) ON DELETE CASCADE,
  media_folder_id UUID REFERENCES media_library_folders(id) ON DELETE SET NULL,
  target_key VARCHAR(80) NOT NULL,
  target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('gallery_common', 'images')),
  source_url TEXT NOT NULL DEFAULT '',
  adapter_id VARCHAR(120) NOT NULL DEFAULT '',
  parse_status VARCHAR(20) NOT NULL DEFAULT 'idle' CHECK (parse_status IN (
    'idle', 'queued', 'running', 'ready', 'partial', 'failed'
  )),
  publish_status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (publish_status IN (
    'draft', 'publishing', 'published', 'failed'
  )),
  found_count INTEGER NOT NULL DEFAULT 0 CHECK (found_count >= 0),
  error_message TEXT NOT NULL DEFAULT '',
  error_details JSONB NOT NULL DEFAULT '[]'::JSONB,
  published_at TIMESTAMPTZ,
  published_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (connection_id, target_key),
  CHECK (
    (target_type = 'gallery_common' AND modification_id IS NULL)
    OR (target_type = 'images' AND modification_id IS NOT NULL)
  )
);

CREATE TABLE search_horoshop_photo_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID NOT NULL REFERENCES search_horoshop_photo_drafts(id) ON DELETE CASCADE,
  media_asset_id UUID NOT NULL REFERENCES media_library_assets(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  content_sha256 CHAR(64) NOT NULL,
  selected BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (draft_id, source_url),
  UNIQUE (draft_id, content_sha256)
);

CREATE TABLE search_horoshop_photo_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES search_horoshop_connections(id) ON DELETE CASCADE,
  generation UUID NOT NULL,
  selection_id UUID REFERENCES search_horoshop_photo_selections(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed')),
  requested_count INTEGER NOT NULL DEFAULT 0 CHECK (requested_count >= 0),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE TABLE search_horoshop_photo_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES search_horoshop_photo_batches(id) ON DELETE CASCADE,
  draft_id UUID NOT NULL REFERENCES search_horoshop_photo_drafts(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued', 'running', 'success', 'partial', 'failed'
  )),
  adapter_id VARCHAR(120) NOT NULL DEFAULT '',
  found_count INTEGER NOT NULL DEFAULT 0 CHECK (found_count >= 0),
  saved_count INTEGER NOT NULL DEFAULT 0 CHECK (saved_count >= 0),
  skipped_count INTEGER NOT NULL DEFAULT 0 CHECK (skipped_count >= 0),
  error_message TEXT NOT NULL DEFAULT '',
  error_details JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE (batch_id, draft_id)
);

CREATE INDEX search_horoshop_photo_selections_connection_idx
  ON search_horoshop_photo_selections (connection_id, updated_at DESC);

CREATE INDEX search_horoshop_photo_selection_items_selection_idx
  ON search_horoshop_photo_selection_items (selection_id, created_at);

CREATE INDEX search_horoshop_photo_drafts_connection_idx
  ON search_horoshop_photo_drafts (connection_id, parse_status, publish_status);

CREATE INDEX search_horoshop_photo_assets_draft_idx
  ON search_horoshop_photo_assets (draft_id, selected, sort_order);

CREATE INDEX search_horoshop_photo_runs_queue_idx
  ON search_horoshop_photo_runs (status, created_at);
