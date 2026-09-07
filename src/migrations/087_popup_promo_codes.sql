BEGIN;

CREATE TABLE horoshop_promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES search_horoshop_connections(id) ON DELETE CASCADE,
  internal_name VARCHAR(160) NOT NULL,
  code VARCHAR(120) NOT NULL,
  code_normalized VARCHAR(120) NOT NULL,
  promo_type VARCHAR(32) NOT NULL
    CHECK (promo_type IN ('percent_coupon', 'amount_certificate')),
  discount_value NUMERIC(12, 2) NOT NULL CHECK (discount_value > 0),
  currency VARCHAR(8),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  usage_limit INTEGER CHECK (usage_limit IS NULL OR usage_limit > 0),
  scope_note TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  horoshop_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (connection_id, code_normalized),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at),
  CHECK (
    (promo_type = 'percent_coupon' AND discount_value <= 100)
    OR (promo_type = 'amount_certificate' AND currency IS NOT NULL AND currency <> '')
  )
);

CREATE INDEX horoshop_promo_codes_connection_updated_idx
  ON horoshop_promo_codes (connection_id, updated_at DESC);

ALTER TABLE popup_banner_campaigns
  ADD COLUMN promo_code_id UUID REFERENCES horoshop_promo_codes(id) ON DELETE SET NULL,
  ADD COLUMN promo_code_draft_snapshot JSONB,
  ADD COLUMN promo_code_published_snapshot JSONB;

CREATE INDEX popup_banner_campaigns_promo_code_idx
  ON popup_banner_campaigns (promo_code_id)
  WHERE promo_code_id IS NOT NULL;

ALTER TABLE popup_banner_campaigns
  DROP CONSTRAINT IF EXISTS popup_banner_campaigns_type_check;

ALTER TABLE popup_banner_campaigns
  ADD CONSTRAINT popup_banner_campaigns_type_check
  CHECK (campaign_type IN ('message', 'out_of_stock_recommendations', 'product_promo', 'promo_code'));

ALTER TABLE popup_banner_events
  DROP CONSTRAINT IF EXISTS popup_banner_events_event_type_check;

-- pg-mem names the original inline check generically; PostgreSQL ignores this fallback.
ALTER TABLE popup_banner_events
  DROP CONSTRAINT IF EXISTS popup_banner_events_constraint_1;

ALTER TABLE popup_banner_events
  ADD CONSTRAINT popup_banner_events_event_type_check
  CHECK (event_type IN ('impression', 'dismiss', 'click', 'acknowledge', 'copy', 'promo_cta'));

COMMIT;
