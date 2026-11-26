ALTER TABLE thematic_campaigns
  ADD COLUMN price_mode TEXT NOT NULL DEFAULT 'none' CHECK (price_mode IN ('none', 'percent', 'fixed')),
  ADD COLUMN price_value NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (price_value >= 0),
  ADD COLUMN highlight_promo_price BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE thematic_campaign_items
  ADD COLUMN promo_token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE;
