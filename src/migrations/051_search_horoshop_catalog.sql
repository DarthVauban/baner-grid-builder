CREATE TABLE search_horoshop_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton BOOLEAN NOT NULL DEFAULT TRUE UNIQUE CHECK (singleton = TRUE),
  generation UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  store_domain TEXT NOT NULL,
  encrypted_credentials TEXT NOT NULL,
  credential_version INTEGER NOT NULL DEFAULT 1 CHECK (credential_version > 0),
  status TEXT NOT NULL DEFAULT 'connected'
    CHECK (status IN ('connected', 'syncing', 'error', 'disconnecting', 'purge_failed')),
  polling_interval_minutes INTEGER NOT NULL DEFAULT 15
    CHECK (polling_interval_minutes BETWEEN 1 AND 1440),
  last_verified_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE search_horoshop_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES search_horoshop_connections(id) ON DELETE CASCADE,
  generation UUID NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('full', 'manual', 'scheduled')),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'failed')),
  categories_received INTEGER NOT NULL DEFAULT 0 CHECK (categories_received >= 0),
  products_received INTEGER NOT NULL DEFAULT 0 CHECK (products_received >= 0),
  modifications_received INTEGER NOT NULL DEFAULT 0 CHECK (modifications_received >= 0),
  pages_received INTEGER NOT NULL DEFAULT 0 CHECK (pages_received >= 0),
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE search_horoshop_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES search_horoshop_connections(id) ON DELETE CASCADE,
  generation UUID NOT NULL,
  external_id TEXT NOT NULL,
  parent_external_id TEXT,
  titles JSONB NOT NULL DEFAULT '{}'::jsonb,
  image_url TEXT,
  canonical_url TEXT,
  source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_sync_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (connection_id, external_id)
);

CREATE TABLE search_horoshop_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES search_horoshop_connections(id) ON DELETE CASCADE,
  generation UUID NOT NULL,
  external_id TEXT NOT NULL,
  parent_external_id TEXT,
  sku TEXT NOT NULL,
  titles JSONB NOT NULL DEFAULT '{}'::jsonb,
  descriptions JSONB NOT NULL DEFAULT '{}'::jsonb,
  brand TEXT,
  category_external_id TEXT,
  price TEXT,
  old_price TEXT,
  currency TEXT,
  availability TEXT,
  visible BOOLEAN NOT NULL DEFAULT TRUE,
  primary_image_url TEXT,
  canonical_url TEXT,
  popularity TEXT,
  characteristics JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_sync_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (connection_id, external_id)
);

CREATE TABLE search_horoshop_modifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES search_horoshop_connections(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES search_horoshop_products(id) ON DELETE CASCADE,
  generation UUID NOT NULL,
  external_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  titles JSONB NOT NULL DEFAULT '{}'::jsonb,
  price TEXT,
  old_price TEXT,
  currency TEXT,
  availability TEXT,
  visible BOOLEAN NOT NULL DEFAULT TRUE,
  image_url TEXT,
  page_url TEXT,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_sync_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (connection_id, external_id)
);

CREATE TABLE search_horoshop_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('connect', 'sync', 'disconnect', 'purge_failed')),
  outcome TEXT NOT NULL CHECK (outcome IN ('started', 'succeeded', 'failed')),
  store_domain_fingerprint TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX search_horoshop_sync_runs_connection_started_idx
  ON search_horoshop_sync_runs (connection_id, started_at DESC);
CREATE INDEX search_horoshop_categories_active_idx
  ON search_horoshop_categories (connection_id, active, external_id);
CREATE INDEX search_horoshop_products_active_idx
  ON search_horoshop_products (connection_id, active, category_external_id);
CREATE INDEX search_horoshop_products_sku_idx
  ON search_horoshop_products (connection_id, sku);
CREATE INDEX search_horoshop_modifications_active_idx
  ON search_horoshop_modifications (connection_id, active, product_id);
CREATE INDEX search_horoshop_modifications_sku_idx
  ON search_horoshop_modifications (connection_id, sku);
CREATE INDEX search_horoshop_audit_created_idx
  ON search_horoshop_audit_log (created_at DESC);
