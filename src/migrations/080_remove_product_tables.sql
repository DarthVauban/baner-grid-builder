DELETE FROM user_tool_access
WHERE tool_id = 'product_tables';

DELETE FROM tool_security_requirements
WHERE tool_id = 'product_tables';

DELETE FROM role_permissions
WHERE resource = 'product_tables';

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
    'horoshop_catalog_menu', 'horoshop_cart_theme'
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
    'horoshop_catalog_menu', 'horoshop_cart_theme'
  ));

ALTER TABLE role_permissions
  DROP CONSTRAINT IF EXISTS role_permissions_resource_check;

ALTER TABLE role_permissions
  ADD CONSTRAINT role_permissions_resource_check CHECK (resource IN (
    'banner_grids', 'saved_banners'
  ));

DROP TABLE IF EXISTS product_tables;
