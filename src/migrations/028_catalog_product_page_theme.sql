ALTER TABLE used_smartphone_storefront_settings
  ADD COLUMN IF NOT EXISTS product_page_theme JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE used_smartphone_storefront_settings
  DROP CONSTRAINT IF EXISTS used_smartphone_storefront_settings_product_page_theme_object;

ALTER TABLE used_smartphone_storefront_settings
  ADD CONSTRAINT used_smartphone_storefront_settings_product_page_theme_object
  CHECK (jsonb_typeof(product_page_theme) = 'object');
