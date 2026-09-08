BEGIN;

ALTER TABLE popup_banner_campaigns
  ADD COLUMN block_document JSONB,
  ADD COLUMN block_published_snapshot JSONB;

ALTER TABLE popup_banner_campaigns DROP CONSTRAINT IF EXISTS popup_banner_campaigns_type_check;
ALTER TABLE popup_banner_campaigns ADD CONSTRAINT popup_banner_campaigns_type_check
  CHECK (campaign_type IN ('message', 'out_of_stock_recommendations', 'product_promo', 'promo_code', 'lead_form', 'countdown', 'block'));

ALTER TABLE popup_banner_contacts
  ADD COLUMN form_id VARCHAR(80),
  ADD COLUMN form_revision VARCHAR(80),
  ADD COLUMN field_snapshot JSONB;

COMMIT;
