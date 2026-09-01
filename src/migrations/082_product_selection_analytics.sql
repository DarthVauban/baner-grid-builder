BEGIN;

CREATE TABLE product_selection_events (
  id BIGSERIAL PRIMARY KEY,
  selection_id UUID NOT NULL REFERENCES product_selections(id) ON DELETE CASCADE,
  product_external_id TEXT,
  modification_external_id TEXT,
  event_type VARCHAR(32) NOT NULL
    CHECK (event_type IN (
      'impression',
      'product_impression',
      'product_click',
      'buy_click',
      'add_to_cart',
      'already_in_cart',
      'add_to_cart_error'
    )),
  visitor_key_hash VARCHAR(64),
  page_url TEXT,
  surface VARCHAR(16) NOT NULL DEFAULT 'desktop' CHECK (surface IN ('desktop', 'mobile')),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX product_selection_events_selection_created_idx
  ON product_selection_events (selection_id, created_at DESC);

CREATE INDEX product_selection_events_type_created_idx
  ON product_selection_events (event_type, created_at DESC);

CREATE INDEX product_selection_events_product_created_idx
  ON product_selection_events (selection_id, product_external_id, modification_external_id, created_at DESC);

COMMIT;
