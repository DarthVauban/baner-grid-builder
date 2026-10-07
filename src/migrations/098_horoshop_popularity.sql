BEGIN;

ALTER TABLE user_tool_access DROP CONSTRAINT IF EXISTS user_tool_access_tool_id_check;
ALTER TABLE user_tool_access DROP CONSTRAINT IF EXISTS user_tool_access_constraint_1;
ALTER TABLE user_tool_access ADD CONSTRAINT user_tool_access_tool_id_check CHECK (tool_id IN (
  'banner_grid', 'product_selection', 'blog_publications', 'chat', 'applications', 'form_builder',
  'used_smartphones_catalog', 'trade_in', 'store_map', 'facebook_group_publications',
  'horoshop_related_products', 'horoshop_photo_parser', 'online_support', 'popup_banners',
  'horoshop_catalog_menu', 'horoshop_cart_theme', 'horoshop_title_labels', 'horoshop_checkout_telegram',
  'horoshop_stickers', 'horoshop_popularity'
));
ALTER TABLE tool_security_requirements DROP CONSTRAINT IF EXISTS tool_security_requirements_tool_id_check;
ALTER TABLE tool_security_requirements DROP CONSTRAINT IF EXISTS tool_security_requirements_constraint_1;
ALTER TABLE tool_security_requirements ADD CONSTRAINT tool_security_requirements_tool_id_check CHECK (tool_id IN (
  'banner_grid', 'product_selection', 'blog_publications', 'chat', 'applications', 'form_builder',
  'used_smartphones_catalog', 'trade_in', 'store_map', 'facebook_group_publications',
  'horoshop_related_products', 'horoshop_photo_parser', 'online_support', 'popup_banners',
  'horoshop_catalog_menu', 'horoshop_cart_theme', 'horoshop_title_labels', 'horoshop_checkout_telegram',
  'horoshop_stickers', 'horoshop_popularity'
));
INSERT INTO tool_security_requirements (tool_id, requires_two_factor)
VALUES ('horoshop_popularity', FALSE) ON CONFLICT (tool_id) DO NOTHING;

CREATE TABLE search_horoshop_popularity_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES search_horoshop_connections(id) ON DELETE CASCADE,
  generation UUID NOT NULL,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('set', 'add', 'reset')),
  action_value INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'queued', 'running', 'completed', 'partial', 'conflict', 'failed')),
  error_message TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE TABLE search_horoshop_popularity_operation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id UUID NOT NULL REFERENCES search_horoshop_popularity_operations(id) ON DELETE CASCADE,
  product_id UUID NOT NULL,
  external_id TEXT NOT NULL,
  article TEXT NOT NULL,
  title TEXT NOT NULL,
  articles JSONB NOT NULL,
  before_value INTEGER NOT NULL,
  target_value INTEGER NOT NULL,
  observed_value INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'writing', 'succeeded', 'unchanged', 'failed', 'conflict', 'cancelled')),
  message TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (operation_id, product_id)
);

CREATE INDEX search_horoshop_popularity_queue_idx
  ON search_horoshop_popularity_operations (status, created_at);
CREATE INDEX search_horoshop_popularity_history_idx
  ON search_horoshop_popularity_operations (connection_id, created_at DESC);
CREATE INDEX search_horoshop_popularity_items_operation_idx
  ON search_horoshop_popularity_operation_items (operation_id, status);

COMMIT;
