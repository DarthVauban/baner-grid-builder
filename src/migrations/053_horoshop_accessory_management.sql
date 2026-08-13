CREATE TABLE search_horoshop_accessory_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES search_horoshop_connections(id) ON DELETE CASCADE,
  generation UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES search_horoshop_products(id) ON DELETE CASCADE,
  catalog_state_known BOOLEAN NOT NULL DEFAULT FALSE,
  initialized_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  published_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (connection_id, product_id)
);

CREATE TABLE search_horoshop_accessory_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id UUID NOT NULL REFERENCES search_horoshop_accessory_sets(id) ON DELETE CASCADE,
  target_key TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('product', 'category')),
  accessory_product_id UUID REFERENCES search_horoshop_products(id) ON DELETE CASCADE,
  accessory_category_id UUID REFERENCES search_horoshop_categories(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('algorithm', 'manual', 'imported')),
  selected BOOLEAN NOT NULL DEFAULT FALSE,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  compatibility_score NUMERIC(5,4) CHECK (compatibility_score BETWEEN 0 AND 1),
  utility_score NUMERIC(5,4) CHECK (utility_score BETWEEN 0 AND 1),
  availability_score NUMERIC(5,4) CHECK (availability_score BETWEEN 0 AND 1),
  popularity_score NUMERIC(5,4) CHECK (popularity_score BETWEEN 0 AND 1),
  total_score NUMERIC(5,4) CHECK (total_score BETWEEN 0 AND 1),
  reason TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (set_id, target_key),
  CHECK (
    (target_type = 'product' AND accessory_product_id IS NOT NULL AND accessory_category_id IS NULL)
    OR
    (target_type = 'category' AND accessory_category_id IS NOT NULL AND accessory_product_id IS NULL)
  )
);

CREATE TABLE search_horoshop_accessory_publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES search_horoshop_connections(id) ON DELETE CASCADE,
  generation UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES search_horoshop_products(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'failed')),
  product_sku TEXT NOT NULL,
  product_accessory_count INTEGER NOT NULL DEFAULT 0 CHECK (product_accessory_count >= 0),
  category_accessory_count INTEGER NOT NULL DEFAULT 0 CHECK (category_accessory_count >= 0),
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX search_horoshop_accessory_sets_product_idx
  ON search_horoshop_accessory_sets (connection_id, product_id);
CREATE INDEX search_horoshop_accessory_links_selected_idx
  ON search_horoshop_accessory_links (set_id, selected, position);
CREATE INDEX search_horoshop_accessory_publications_product_idx
  ON search_horoshop_accessory_publications (connection_id, product_id, started_at DESC);
