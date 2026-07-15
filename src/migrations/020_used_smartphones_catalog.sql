ALTER TABLE user_tool_access
  DROP CONSTRAINT IF EXISTS user_tool_access_tool_id_check;

ALTER TABLE user_tool_access
  DROP CONSTRAINT IF EXISTS user_tool_access_constraint_1;

ALTER TABLE user_tool_access
  ADD CONSTRAINT user_tool_access_tool_id_check CHECK (tool_id IN (
    'banner_grid', 'product_selection', 'product_tables', 'blog_publications',
    'chat', 'applications', 'form_builder', 'used_smartphones_catalog'
  ));

ALTER TABLE tool_security_requirements
  DROP CONSTRAINT IF EXISTS tool_security_requirements_tool_id_check;

ALTER TABLE tool_security_requirements
  DROP CONSTRAINT IF EXISTS tool_security_requirements_constraint_1;

ALTER TABLE tool_security_requirements
  ADD CONSTRAINT tool_security_requirements_tool_id_check CHECK (tool_id IN (
    'banner_grid', 'product_selection', 'product_tables', 'blog_publications',
    'chat', 'applications', 'form_builder', 'used_smartphones_catalog'
  ));

INSERT INTO tool_security_requirements (tool_id, requires_two_factor)
VALUES ('used_smartphones_catalog', FALSE)
ON CONFLICT (tool_id) DO NOTHING;

CREATE TABLE used_smartphone_product_code_sequence (
  scope VARCHAR(30) PRIMARY KEY,
  next_number INTEGER NOT NULL CHECK (next_number BETWEEN 1 AND 1000000)
);

INSERT INTO used_smartphone_product_code_sequence (scope, next_number)
VALUES ('default', 1)
ON CONFLICT (scope) DO NOTHING;

CREATE TABLE used_smartphone_brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label VARCHAR(160) NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX used_smartphone_brands_order_idx
  ON used_smartphone_brands(active, sort_order, lower(label));

CREATE TABLE used_smartphone_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(240) NOT NULL,
  normalized_name VARCHAR(240) NOT NULL,
  condition VARCHAR(20) NOT NULL CHECK (condition IN ('USED', 'REFURBISHED')),
  stock_count INTEGER NOT NULL DEFAULT 0 CHECK (stock_count >= 0),
  incoming_count INTEGER NOT NULL DEFAULT 0 CHECK (incoming_count >= 0),
  price_uah NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (price_uah >= 0),
  publication_status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (publication_status IN (
    'DRAFT', 'PUBLISHED', 'HIDDEN', 'ARCHIVED'
  )),
  slug VARCHAR(260) NOT NULL UNIQUE,
  brand_id UUID REFERENCES used_smartphone_brands(id) ON DELETE SET NULL,
  main_image_url VARCHAR(4000) NOT NULL DEFAULT '',
  gallery JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(gallery) = 'array'),
  short_description TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  seo_title VARCHAR(240) NOT NULL DEFAULT '',
  seo_description VARCHAR(500) NOT NULL DEFAULT '',
  social_description VARCHAR(500) NOT NULL DEFAULT '',
  body_condition VARCHAR(120) NOT NULL DEFAULT '',
  display_condition VARCHAR(120) NOT NULL DEFAULT '',
  battery_health VARCHAR(120) NOT NULL DEFAULT '',
  warranty VARCHAR(160) NOT NULL DEFAULT '',
  included_accessories TEXT NOT NULL DEFAULT '',
  diagnostics JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(diagnostics) = 'object'),
  internal_notes TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (normalized_name, condition)
);

CREATE INDEX used_smartphone_products_updated_idx
  ON used_smartphone_products(updated_at DESC);

CREATE INDEX used_smartphone_products_publication_idx
  ON used_smartphone_products(publication_status, updated_at DESC);

CREATE INDEX used_smartphone_products_condition_idx
  ON used_smartphone_products(condition, publication_status);

CREATE INDEX used_smartphone_products_brand_idx
  ON used_smartphone_products(brand_id);

CREATE INDEX used_smartphone_products_name_idx
  ON used_smartphone_products(lower(name));

CREATE TABLE used_smartphone_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  options JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(options) = 'object'),
  summary JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(summary) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX used_smartphone_imports_created_idx
  ON used_smartphone_imports(created_at DESC);

CREATE TABLE used_smartphone_import_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id UUID NOT NULL REFERENCES used_smartphone_imports(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  action VARCHAR(30) NOT NULL,
  result VARCHAR(30) NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  product_id UUID REFERENCES used_smartphone_products(id) ON DELETE SET NULL,
  name VARCHAR(240) NOT NULL DEFAULT '',
  condition VARCHAR(20) NOT NULL DEFAULT '',
  stock_count INTEGER,
  incoming_count INTEGER,
  price_uah NUMERIC(12,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX used_smartphone_import_rows_import_idx
  ON used_smartphone_import_rows(import_id, row_number);

CREATE TABLE used_smartphone_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES used_smartphone_products(id) ON DELETE SET NULL,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(40) NOT NULL,
  changes JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(changes) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX used_smartphone_audit_product_idx
  ON used_smartphone_audit_log(product_id, created_at DESC);

CREATE TABLE used_smartphone_storefront_settings (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE,
  selected_form_public_id UUID,
  public_origin VARCHAR(500) NOT NULL DEFAULT '',
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT used_smartphone_storefront_settings_singleton CHECK (id)
);

INSERT INTO used_smartphone_storefront_settings (id)
VALUES (TRUE)
ON CONFLICT (id) DO NOTHING;
