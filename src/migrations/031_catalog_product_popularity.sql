ALTER TABLE used_smartphone_products
  ADD COLUMN popularity_position INTEGER NOT NULL DEFAULT 0
  CHECK (popularity_position >= 0 AND popularity_position <= 1000000);

CREATE INDEX used_smartphone_products_popularity_idx
  ON used_smartphone_products(popularity_position, updated_at DESC);
