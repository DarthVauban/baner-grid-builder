ALTER TABLE popup_banner_campaigns
  ADD COLUMN campaign_type VARCHAR(40) NOT NULL DEFAULT 'message';

UPDATE popup_banner_campaigns
SET campaign_type = 'out_of_stock_recommendations'
WHERE targeting->>'mode' = 'out_of_stock';

ALTER TABLE popup_banner_campaigns
  ADD CONSTRAINT popup_banner_campaigns_type_check CHECK (campaign_type IN (
    'message', 'out_of_stock_recommendations', 'product_promo'
  ));

CREATE TABLE popup_banner_promo_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES popup_banner_campaigns(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES search_horoshop_products(id) ON DELETE CASCADE,
  modification_id UUID REFERENCES search_horoshop_modifications(id) ON DELETE CASCADE,
  item_key VARCHAR(700) NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, item_key),
  UNIQUE (campaign_id, position)
);

CREATE INDEX popup_banner_promo_products_campaign_idx
  ON popup_banner_promo_products (campaign_id, position);
