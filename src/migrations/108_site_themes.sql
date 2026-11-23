ALTER TABLE user_tool_access DROP CONSTRAINT IF EXISTS user_tool_access_tool_id_check;
ALTER TABLE user_tool_access DROP CONSTRAINT IF EXISTS user_tool_access_constraint_1;
ALTER TABLE user_tool_access ADD CONSTRAINT user_tool_access_tool_id_check CHECK (tool_id IN (
  'banner_grid', 'product_selection', 'blog_publications', 'chat', 'applications', 'form_builder',
  'used_smartphones_catalog', 'trade_in', 'store_map', 'facebook_group_publications',
  'horoshop_related_products', 'horoshop_photo_parser', 'online_support', 'popup_banners',
  'horoshop_catalog_menu', 'horoshop_cart_theme', 'horoshop_title_labels', 'horoshop_checkout_telegram',
  'horoshop_stickers', 'horoshop_popularity', 'horoshop_feeds', 'site_themes'
));

ALTER TABLE tool_security_requirements DROP CONSTRAINT IF EXISTS tool_security_requirements_tool_id_check;
ALTER TABLE tool_security_requirements DROP CONSTRAINT IF EXISTS tool_security_requirements_constraint_1;
ALTER TABLE tool_security_requirements ADD CONSTRAINT tool_security_requirements_tool_id_check CHECK (tool_id IN (
  'banner_grid', 'product_selection', 'blog_publications', 'chat', 'applications', 'form_builder',
  'used_smartphones_catalog', 'trade_in', 'store_map', 'facebook_group_publications',
  'horoshop_related_products', 'horoshop_photo_parser', 'online_support', 'popup_banners',
  'horoshop_catalog_menu', 'horoshop_cart_theme', 'horoshop_title_labels', 'horoshop_checkout_telegram',
  'horoshop_stickers', 'horoshop_popularity', 'horoshop_feeds', 'site_themes'
));

INSERT INTO tool_security_requirements (tool_id, requires_two_factor)
VALUES ('site_themes', FALSE) ON CONFLICT (tool_id) DO NOTHING;

CREATE TABLE site_themes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES search_horoshop_connections(id) ON DELETE CASCADE,
  connection_generation UUID NOT NULL,
  name TEXT NOT NULL,
  draft_promo_bar JSONB NOT NULL,
  published_name TEXT,
  published_promo_bar JSONB,
  promo_bar_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  active BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  published_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  CONSTRAINT site_themes_active_requires_publication CHECK (NOT active OR published_at IS NOT NULL)
);

CREATE INDEX site_themes_connection_idx ON site_themes (connection_id, connection_generation, updated_at DESC);
CREATE UNIQUE INDEX site_themes_one_active_idx ON site_themes (connection_id, connection_generation) WHERE active = TRUE;
