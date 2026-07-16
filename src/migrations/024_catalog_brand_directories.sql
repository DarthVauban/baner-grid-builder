CREATE TABLE used_smartphone_brand_directories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label VARCHAR(180) NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX used_smartphone_brand_directories_order_idx
  ON used_smartphone_brand_directories(active, sort_order, lower(label));

INSERT INTO used_smartphone_brand_directories (label, description, sort_order)
VALUES ('Бренди смартфонів', 'Основний довідник брендів смартфонів', 0);

ALTER TABLE used_smartphone_brands
  ADD COLUMN directory_id UUID REFERENCES used_smartphone_brand_directories(id) ON DELETE CASCADE;

UPDATE used_smartphone_brands
SET directory_id = (SELECT id FROM used_smartphone_brand_directories WHERE label = 'Бренди смартфонів' LIMIT 1)
WHERE directory_id IS NULL;

ALTER TABLE used_smartphone_brands
  ALTER COLUMN directory_id SET NOT NULL;

ALTER TABLE used_smartphone_brands
  DROP CONSTRAINT IF EXISTS used_smartphone_brands_label_key;

DROP INDEX IF EXISTS used_smartphone_brands_order_idx;

CREATE UNIQUE INDEX used_smartphone_brands_directory_label_unique_idx
  ON used_smartphone_brands(directory_id, lower(label));

CREATE INDEX used_smartphone_brands_order_idx
  ON used_smartphone_brands(directory_id, active, lower(label));
