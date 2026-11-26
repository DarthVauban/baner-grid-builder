BEGIN;

ALTER TABLE popup_banner_campaigns
  ADD COLUMN product_popup JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE popup_banner_campaigns DROP CONSTRAINT IF EXISTS popup_banner_campaigns_type_check;
ALTER TABLE popup_banner_campaigns ADD CONSTRAINT popup_banner_campaigns_type_check
  CHECK (campaign_type IN ('message', 'out_of_stock_recommendations', 'product_promo', 'promo_code', 'lead_form', 'countdown', 'block', 'product_popup'));

COMMIT;
