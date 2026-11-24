ALTER TABLE site_themes
  ADD COLUMN draft_storefront_effects JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN published_storefront_effects JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN storefront_effect_visibility JSONB NOT NULL DEFAULT '{}'::JSONB;
