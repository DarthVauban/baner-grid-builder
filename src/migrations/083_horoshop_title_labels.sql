ALTER TABLE user_tool_access
  DROP CONSTRAINT IF EXISTS user_tool_access_tool_id_check;

ALTER TABLE user_tool_access
  DROP CONSTRAINT IF EXISTS user_tool_access_constraint_1;

ALTER TABLE user_tool_access
  ADD CONSTRAINT user_tool_access_tool_id_check CHECK (tool_id IN (
    'banner_grid', 'product_selection', 'blog_publications', 'chat',
    'applications', 'form_builder', 'used_smartphones_catalog', 'trade_in',
    'store_map', 'facebook_group_publications', 'horoshop_related_products',
    'horoshop_photo_parser', 'online_support', 'popup_banners',
    'horoshop_catalog_menu', 'horoshop_cart_theme', 'horoshop_title_labels'
  ));

ALTER TABLE tool_security_requirements
  DROP CONSTRAINT IF EXISTS tool_security_requirements_tool_id_check;

ALTER TABLE tool_security_requirements
  DROP CONSTRAINT IF EXISTS tool_security_requirements_constraint_1;

ALTER TABLE tool_security_requirements
  ADD CONSTRAINT tool_security_requirements_tool_id_check CHECK (tool_id IN (
    'banner_grid', 'product_selection', 'blog_publications', 'chat',
    'applications', 'form_builder', 'used_smartphones_catalog', 'trade_in',
    'store_map', 'facebook_group_publications', 'horoshop_related_products',
    'horoshop_photo_parser', 'online_support', 'popup_banners',
    'horoshop_catalog_menu', 'horoshop_cart_theme', 'horoshop_title_labels'
  ));

INSERT INTO tool_security_requirements (tool_id, requires_two_factor)
VALUES ('horoshop_title_labels', FALSE)
ON CONFLICT (tool_id) DO NOTHING;

CREATE TABLE horoshop_title_label_settings (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE,
  public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  draft_rules JSONB NOT NULL DEFAULT '[]'::JSONB,
  published_rules JSONB NOT NULL DEFAULT '[]'::JSONB,
  published_version INTEGER NOT NULL DEFAULT 0 CHECK (published_version >= 0),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  published_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  CONSTRAINT horoshop_title_label_settings_singleton CHECK (id)
);

INSERT INTO horoshop_title_label_settings (id)
VALUES (TRUE)
ON CONFLICT (id) DO NOTHING;
