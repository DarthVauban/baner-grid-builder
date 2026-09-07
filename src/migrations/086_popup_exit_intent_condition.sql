BEGIN;

UPDATE popup_banner_campaigns
SET campaign_type = 'message',
    updated_at = NOW()
WHERE campaign_type = 'exit_offer';

ALTER TABLE popup_banner_campaigns
  DROP CONSTRAINT IF EXISTS popup_banner_campaigns_type_check;

ALTER TABLE popup_banner_campaigns
  ADD CONSTRAINT popup_banner_campaigns_type_check
  CHECK (campaign_type IN ('message', 'out_of_stock_recommendations', 'product_promo'));

COMMIT;
