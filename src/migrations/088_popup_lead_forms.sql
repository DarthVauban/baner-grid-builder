BEGIN;

ALTER TABLE popup_banner_campaigns
  ADD COLUMN form_config JSONB NOT NULL DEFAULT '{"fields":[],"submitLabel":"Отримати промокод","successTitle":"Ваш промокод готовий","successBody":"Скопіюйте код і використайте його під час оформлення замовлення."}'::JSONB,
  ADD COLUMN form_published_snapshot JSONB;

ALTER TABLE popup_banner_campaigns
  DROP CONSTRAINT IF EXISTS popup_banner_campaigns_type_check;

ALTER TABLE popup_banner_campaigns
  ADD CONSTRAINT popup_banner_campaigns_type_check
  CHECK (campaign_type IN ('message', 'out_of_stock_recommendations', 'product_promo', 'promo_code', 'lead_form'));

CREATE TABLE popup_banner_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES popup_banner_campaigns(id) ON DELETE CASCADE,
  product_id UUID REFERENCES search_horoshop_products(id) ON DELETE SET NULL,
  modification_id UUID REFERENCES search_horoshop_modifications(id) ON DELETE SET NULL,
  values JSONB NOT NULL,
  visitor_key_hash VARCHAR(64),
  dedupe_key VARCHAR(64) NOT NULL,
  page_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, dedupe_key)
);

CREATE INDEX popup_banner_contacts_campaign_created_idx
  ON popup_banner_contacts (campaign_id, created_at DESC);

COMMIT;
