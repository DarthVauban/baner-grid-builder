CREATE TABLE product_selections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES search_horoshop_connections(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  heading TEXT NOT NULL DEFAULT 'Ми рекомендуємо',
  price_mode TEXT NOT NULL DEFAULT 'none'
    CHECK (price_mode IN ('none', 'percent', 'fixed')),
  price_value NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (price_value >= 0),
  highlight_promo_price BOOLEAN NOT NULL DEFAULT TRUE,
  button_label TEXT NOT NULL DEFAULT 'Купити',
  desktop_columns INTEGER NOT NULL DEFAULT 4 CHECK (desktop_columns BETWEEN 2 AND 5),
  mobile_columns INTEGER NOT NULL DEFAULT 2 CHECK (mobile_columns BETWEEN 1 AND 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE product_selection_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  selection_id UUID NOT NULL REFERENCES product_selections(id) ON DELETE CASCADE,
  product_external_id TEXT NOT NULL,
  modification_external_id TEXT,
  position INTEGER NOT NULL CHECK (position >= 0),
  promo_token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX product_selection_items_offer_unique_idx
  ON product_selection_items (
    selection_id,
    product_external_id,
    COALESCE(modification_external_id, '')
  );

CREATE INDEX product_selections_user_updated_idx
  ON product_selections (user_id, updated_at DESC);

CREATE INDEX product_selection_items_selection_position_idx
  ON product_selection_items (selection_id, position, id);
