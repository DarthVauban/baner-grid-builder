BEGIN;

CREATE TABLE search_horoshop_stickers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES search_horoshop_connections(id) ON DELETE CASCADE,
  generation UUID NOT NULL,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  sync_signature TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_sync_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (connection_id, external_id)
);

CREATE INDEX search_horoshop_stickers_active_idx
  ON search_horoshop_stickers (connection_id, active, enabled, title);

ALTER TABLE search_horoshop_sync_runs
  ADD COLUMN stickers_received INTEGER NOT NULL DEFAULT 0 CHECK (stickers_received >= 0);

COMMIT;
