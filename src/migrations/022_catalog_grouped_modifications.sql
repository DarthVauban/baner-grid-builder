ALTER TABLE used_smartphone_characteristic_template_fields
  ADD COLUMN is_modifier BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE used_smartphone_product_groups
  ADD COLUMN main_product_id UUID REFERENCES used_smartphone_products(id) ON DELETE SET NULL;

CREATE INDEX used_smartphone_product_groups_main_product_idx
  ON used_smartphone_product_groups(main_product_id);
