BEGIN;

CREATE TABLE popup_banner_product_exclusions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES popup_banner_campaigns(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES search_horoshop_products(id) ON DELETE CASCADE,
  modification_id UUID REFERENCES search_horoshop_modifications(id) ON DELETE CASCADE,
  target_key VARCHAR(96) NOT NULL,
  input_value VARCHAR(500) NOT NULL DEFAULT '',
  matched_by VARCHAR(30) NOT NULL DEFAULT 'manual'
    CHECK (matched_by IN ('product_sku', 'modification_sku', 'product_title', 'modification_title', 'manual')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, target_key)
);

CREATE INDEX popup_banner_exclusions_campaign_idx
  ON popup_banner_product_exclusions (campaign_id, product_id, modification_id);

COMMIT;
