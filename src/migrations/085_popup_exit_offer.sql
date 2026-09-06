ALTER TABLE popup_banner_campaigns
  DROP CONSTRAINT popup_banner_campaigns_type_check;

ALTER TABLE popup_banner_campaigns
  ADD CONSTRAINT popup_banner_campaigns_type_check CHECK (campaign_type IN (
    'message', 'out_of_stock_recommendations', 'product_promo', 'exit_offer'
  ));
