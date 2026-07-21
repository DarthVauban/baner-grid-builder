CREATE TABLE used_smartphone_product_import_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source VARCHAR(80) NOT NULL DEFAULT 'xlsx_catalog',
  identity_key VARCHAR(500) NOT NULL,
  product_id UUID NOT NULL REFERENCES used_smartphone_products(id) ON DELETE CASCADE,
  identity_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(identity_snapshot) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source, identity_key)
);

CREATE INDEX used_smartphone_product_import_keys_product_idx
  ON used_smartphone_product_import_keys(product_id, updated_at DESC);

ALTER TABLE used_smartphone_import_rows
  ADD COLUMN identity_key VARCHAR(500) NOT NULL DEFAULT '',
  ADD COLUMN brand_id UUID REFERENCES used_smartphone_brands(id) ON DELETE SET NULL,
  ADD COLUMN template_id UUID REFERENCES used_smartphone_characteristic_templates(id) ON DELETE SET NULL,
  ADD COLUMN payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(payload) = 'object');
