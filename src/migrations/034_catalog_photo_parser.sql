ALTER TABLE used_smartphone_products
  ADD COLUMN photo_parser_url VARCHAR(4000) NOT NULL DEFAULT '';

ALTER TABLE used_smartphone_product_media
  ADD COLUMN source_url VARCHAR(4000) NOT NULL DEFAULT '',
  ADD COLUMN content_sha256 VARCHAR(64) NOT NULL DEFAULT '';

CREATE INDEX used_smartphone_product_media_source_idx
  ON used_smartphone_product_media(product_id, source_url);

CREATE INDEX used_smartphone_product_media_hash_idx
  ON used_smartphone_product_media(product_id, content_sha256);

CREATE TABLE used_smartphone_photo_parser_adapters (
  id VARCHAR(80) PRIMARY KEY,
  source VARCHAR(20) NOT NULL CHECK (source IN ('builtin', 'custom')),
  name VARCHAR(80) NOT NULL,
  host VARCHAR(255) NOT NULL,
  store_url VARCHAR(500) NOT NULL,
  gallery_selector VARCHAR(1000) NOT NULL,
  strict BOOLEAN NOT NULL DEFAULT TRUE,
  fallback BOOLEAN NOT NULL DEFAULT FALSE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX used_smartphone_photo_parser_adapters_source_host_idx
  ON used_smartphone_photo_parser_adapters(source, lower(host));

CREATE TABLE used_smartphone_photo_parser_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status VARCHAR(20) NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed')),
  requested_count INTEGER NOT NULL DEFAULT 0 CHECK (requested_count >= 0),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX used_smartphone_photo_parser_batches_created_idx
  ON used_smartphone_photo_parser_batches(created_at DESC);

CREATE TABLE used_smartphone_photo_parser_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES used_smartphone_photo_parser_batches(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES used_smartphone_products(id) ON DELETE CASCADE,
  source_url VARCHAR(4000) NOT NULL,
  adapter_id VARCHAR(80) NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'success', 'partial', 'failed')),
  found_count INTEGER NOT NULL DEFAULT 0 CHECK (found_count >= 0),
  saved_count INTEGER NOT NULL DEFAULT 0 CHECK (saved_count >= 0),
  skipped_count INTEGER NOT NULL DEFAULT 0 CHECK (skipped_count >= 0),
  error_message TEXT NOT NULL DEFAULT '',
  error_details JSONB NOT NULL DEFAULT '[]'::JSONB
    CHECK (jsonb_typeof(error_details) = 'array'),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE (batch_id, product_id)
);

CREATE INDEX used_smartphone_photo_parser_runs_queue_idx
  ON used_smartphone_photo_parser_runs(status, created_at);

CREATE INDEX used_smartphone_photo_parser_runs_product_idx
  ON used_smartphone_photo_parser_runs(product_id, created_at DESC);

CREATE UNIQUE INDEX used_smartphone_photo_parser_runs_active_product_idx
  ON used_smartphone_photo_parser_runs(product_id)
  WHERE status IN ('queued', 'running');

CREATE INDEX used_smartphone_photo_parser_runs_errors_idx
  ON used_smartphone_photo_parser_runs(status, completed_at DESC);
