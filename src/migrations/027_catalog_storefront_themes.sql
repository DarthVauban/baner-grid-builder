ALTER TABLE used_smartphone_storefront_settings
  ADD COLUMN IF NOT EXISTS storefront_theme JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS product_card_theme JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE used_smartphone_storefront_settings
  DROP CONSTRAINT IF EXISTS used_smartphone_storefront_settings_storefront_theme_object;

ALTER TABLE used_smartphone_storefront_settings
  ADD CONSTRAINT used_smartphone_storefront_settings_storefront_theme_object
  CHECK (jsonb_typeof(storefront_theme) = 'object');

ALTER TABLE used_smartphone_storefront_settings
  DROP CONSTRAINT IF EXISTS used_smartphone_storefront_settings_product_card_theme_object;

ALTER TABLE used_smartphone_storefront_settings
  ADD CONSTRAINT used_smartphone_storefront_settings_product_card_theme_object
  CHECK (jsonb_typeof(product_card_theme) = 'object');
