ALTER TABLE used_smartphone_products
  ADD COLUMN description_safe_html TEXT NOT NULL DEFAULT '',
  ADD COLUMN description_css TEXT NOT NULL DEFAULT '',
  ADD COLUMN description_js TEXT NOT NULL DEFAULT '',
  ADD COLUMN description_has_js BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN description_source_updated_at TIMESTAMPTZ,
  ADD COLUMN description_source_updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN condition_grade VARCHAR(40) NOT NULL DEFAULT '',
  ADD COLUMN technician_name VARCHAR(160) NOT NULL DEFAULT '',
  ADD COLUMN inspection_date DATE,
  ADD COLUMN purchase_price_uah NUMERIC(12,2),
  ADD COLUMN accounting_status VARCHAR(80) NOT NULL DEFAULT '',
  ADD COLUMN imei_serial VARCHAR(160) NOT NULL DEFAULT '';

CREATE TABLE used_smartphone_product_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES used_smartphone_products(id) ON DELETE CASCADE,
  url VARCHAR(4000) NOT NULL,
  original_url VARCHAR(4000) NOT NULL DEFAULT '',
  storage_key VARCHAR(260) NOT NULL DEFAULT '',
  original_storage_key VARCHAR(260) NOT NULL DEFAULT '',
  mime_type VARCHAR(80) NOT NULL DEFAULT 'image/webp',
  original_mime_type VARCHAR(120) NOT NULL DEFAULT '',
  size_bytes INTEGER NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
  original_size_bytes INTEGER NOT NULL DEFAULT 0 CHECK (original_size_bytes >= 0),
  width INTEGER,
  height INTEGER,
  alt VARCHAR(240) NOT NULL DEFAULT '',
  role VARCHAR(20) NOT NULL DEFAULT 'gallery' CHECK (role IN ('main', 'gallery')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX used_smartphone_product_media_product_idx
  ON used_smartphone_product_media(product_id, role, sort_order, created_at);

CREATE INDEX used_smartphone_product_media_url_idx
  ON used_smartphone_product_media(url);

CREATE TABLE used_smartphone_characteristic_templates (
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

CREATE TABLE used_smartphone_characteristic_template_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES used_smartphone_characteristic_templates(id) ON DELETE CASCADE,
  key VARCHAR(120) NOT NULL,
  label VARCHAR(180) NOT NULL,
  type VARCHAR(30) NOT NULL CHECK (type IN ('text', 'number', 'select', 'multiselect', 'boolean')),
  unit VARCHAR(40) NOT NULL DEFAULT '',
  options JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(options) = 'array'),
  required BOOLEAN NOT NULL DEFAULT FALSE,
  filterable BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (template_id, key)
);

CREATE INDEX used_smartphone_template_fields_template_idx
  ON used_smartphone_characteristic_template_fields(template_id, sort_order);

CREATE TABLE used_smartphone_product_characteristics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES used_smartphone_products(id) ON DELETE CASCADE,
  template_id UUID REFERENCES used_smartphone_characteristic_templates(id) ON DELETE SET NULL,
  field_id UUID REFERENCES used_smartphone_characteristic_template_fields(id) ON DELETE SET NULL,
  key VARCHAR(120) NOT NULL,
  label VARCHAR(180) NOT NULL,
  value_text TEXT NOT NULL DEFAULT '',
  value_number NUMERIC(14,4),
  value_boolean BOOLEAN,
  value_json JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(value_json) = 'object'),
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, key)
);

CREATE INDEX used_smartphone_product_characteristics_product_idx
  ON used_smartphone_product_characteristics(product_id, sort_order);

CREATE TABLE used_smartphone_catalog_filters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label VARCHAR(180) NOT NULL,
  source VARCHAR(40) NOT NULL CHECK (source IN (
    'brand', 'condition', 'price', 'availability', 'characteristic', 'modification'
  )),
  source_key VARCHAR(160) NOT NULL DEFAULT '',
  type VARCHAR(30) NOT NULL CHECK (type IN ('checkbox', 'radio', 'range', 'select')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  storefront_visible BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  config JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(config) = 'object'),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX used_smartphone_catalog_filters_active_idx
  ON used_smartphone_catalog_filters(active, storefront_visible, sort_order);

CREATE TABLE used_smartphone_modification_parameters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(120) NOT NULL UNIQUE,
  label VARCHAR(180) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE used_smartphone_modification_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parameter_id UUID NOT NULL REFERENCES used_smartphone_modification_parameters(id) ON DELETE CASCADE,
  value VARCHAR(160) NOT NULL,
  label VARCHAR(180) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (parameter_id, value)
);

CREATE INDEX used_smartphone_modification_values_parameter_idx
  ON used_smartphone_modification_values(parameter_id, sort_order);

CREATE TABLE used_smartphone_product_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label VARCHAR(240) NOT NULL,
  slug VARCHAR(260) NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE used_smartphone_product_group_items (
  group_id UUID NOT NULL REFERENCES used_smartphone_product_groups(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES used_smartphone_products(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, product_id)
);

CREATE INDEX used_smartphone_product_group_items_product_idx
  ON used_smartphone_product_group_items(product_id);

CREATE TABLE used_smartphone_product_group_parameters (
  group_id UUID NOT NULL REFERENCES used_smartphone_product_groups(id) ON DELETE CASCADE,
  parameter_id UUID NOT NULL REFERENCES used_smartphone_modification_parameters(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (group_id, parameter_id)
);

CREATE TABLE used_smartphone_product_modification_values (
  product_id UUID NOT NULL REFERENCES used_smartphone_products(id) ON DELETE CASCADE,
  parameter_id UUID NOT NULL REFERENCES used_smartphone_modification_parameters(id) ON DELETE CASCADE,
  value_id UUID NOT NULL REFERENCES used_smartphone_modification_values(id) ON DELETE CASCADE,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (product_id, parameter_id)
);

CREATE INDEX used_smartphone_product_mod_values_value_idx
  ON used_smartphone_product_modification_values(value_id);
