ALTER TABLE search_horoshop_products
  ADD COLUMN horoshop_created_at TIMESTAMPTZ,
  ADD COLUMN has_photos BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE search_horoshop_modifications
  ADD COLUMN horoshop_created_at TIMESTAMPTZ,
  ADD COLUMN has_photos BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE search_horoshop_products
SET has_photos = COALESCE(primary_image_url, '') <> '';

UPDATE search_horoshop_modifications
SET has_photos = COALESCE(image_url, '') <> '';

ALTER TABLE search_horoshop_sync_runs
  ADD COLUMN export_items_received INTEGER NOT NULL DEFAULT 0
    CHECK (export_items_received >= 0),
  ADD COLUMN export_items_total INTEGER
    CHECK (export_items_total IS NULL OR export_items_total >= 0);

CREATE INDEX search_horoshop_products_created_idx
  ON search_horoshop_products (connection_id, active, horoshop_created_at DESC);

CREATE INDEX search_horoshop_modifications_created_idx
  ON search_horoshop_modifications (connection_id, active, horoshop_created_at DESC);
