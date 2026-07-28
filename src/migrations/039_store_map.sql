ALTER TABLE user_tool_access
  DROP CONSTRAINT IF EXISTS user_tool_access_tool_id_check;

ALTER TABLE user_tool_access
  DROP CONSTRAINT IF EXISTS user_tool_access_constraint_1;

ALTER TABLE user_tool_access
  ADD CONSTRAINT user_tool_access_tool_id_check CHECK (tool_id IN (
    'banner_grid', 'product_selection', 'product_tables', 'blog_publications',
    'chat', 'applications', 'form_builder', 'used_smartphones_catalog', 'trade_in',
    'store_map'
  ));

ALTER TABLE tool_security_requirements
  DROP CONSTRAINT IF EXISTS tool_security_requirements_tool_id_check;

ALTER TABLE tool_security_requirements
  DROP CONSTRAINT IF EXISTS tool_security_requirements_constraint_1;

ALTER TABLE tool_security_requirements
  ADD CONSTRAINT tool_security_requirements_tool_id_check CHECK (tool_id IN (
    'banner_grid', 'product_selection', 'product_tables', 'blog_publications',
    'chat', 'applications', 'form_builder', 'used_smartphones_catalog', 'trade_in',
    'store_map'
  ));

INSERT INTO tool_security_requirements (tool_id, requires_two_factor)
VALUES ('store_map', FALSE)
ON CONFLICT (tool_id) DO NOTHING;

CREATE TABLE store_map_settings (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE,
  public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  title VARCHAR(180) NOT NULL DEFAULT 'Мапа магазинів',
  marker_svg TEXT NOT NULL DEFAULT '',
  marker_width SMALLINT NOT NULL DEFAULT 42 CHECK (marker_width BETWEEN 16 AND 160),
  marker_height SMALLINT NOT NULL DEFAULT 52 CHECK (marker_height BETWEEN 16 AND 180),
  marker_anchor_x SMALLINT NOT NULL DEFAULT 21 CHECK (marker_anchor_x BETWEEN 0 AND 160),
  marker_anchor_y SMALLINT NOT NULL DEFAULT 52 CHECK (marker_anchor_y BETWEEN 0 AND 180),
  center_latitude NUMERIC(10, 7) NOT NULL DEFAULT 49.0000000 CHECK (center_latitude BETWEEN -90 AND 90),
  center_longitude NUMERIC(10, 7) NOT NULL DEFAULT 31.5000000 CHECK (center_longitude BETWEEN -180 AND 180),
  default_zoom SMALLINT NOT NULL DEFAULT 6 CHECK (default_zoom BETWEEN 2 AND 18),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT store_map_settings_singleton CHECK (id)
);

INSERT INTO store_map_settings (id)
VALUES (TRUE)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE store_map_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id VARCHAR(120) NOT NULL DEFAULT '',
  name VARCHAR(240) NOT NULL,
  normalized_name VARCHAR(240) NOT NULL,
  city VARCHAR(120) NOT NULL,
  normalized_city VARCHAR(120) NOT NULL,
  address VARCHAR(500) NOT NULL,
  hours_text VARCHAR(120) NOT NULL DEFAULT '',
  schedule JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(schedule) = 'object'),
  publication_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
    CHECK (publication_status IN ('ACTIVE', 'HIDDEN')),
  open_status_override VARCHAR(20) NOT NULL DEFAULT 'AUTO'
    CHECK (open_status_override IN ('AUTO', 'OPEN', 'CLOSED')),
  latitude NUMERIC(10, 7) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude NUMERIC(10, 7) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX store_map_points_external_id_unique
  ON store_map_points(external_id)
  WHERE external_id <> '' AND archived_at IS NULL;

CREATE INDEX store_map_points_city_idx
  ON store_map_points(normalized_city)
  WHERE archived_at IS NULL;

CREATE INDEX store_map_points_name_idx
  ON store_map_points(normalized_name)
  WHERE archived_at IS NULL;

CREATE INDEX store_map_points_coordinates_idx
  ON store_map_points(latitude, longitude)
  WHERE archived_at IS NULL;

CREATE TABLE store_map_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  options JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(options) = 'object'),
  summary JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(summary) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE store_map_import_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id UUID NOT NULL REFERENCES store_map_imports(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  action VARCHAR(20) NOT NULL CHECK (action IN ('create', 'update', 'error', 'conflict', 'skipped')),
  result VARCHAR(20) NOT NULL CHECK (result IN ('created', 'updated', 'error', 'conflict', 'skipped')),
  reason TEXT NOT NULL DEFAULT '',
  point_id UUID REFERENCES store_map_points(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(payload) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX store_map_import_rows_import_idx
  ON store_map_import_rows(import_id, row_number);
