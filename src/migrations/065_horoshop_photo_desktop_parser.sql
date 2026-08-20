CREATE TABLE search_horoshop_photo_parser_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  installation_id UUID,
  access_token_hash CHAR(64) NOT NULL UNIQUE,
  app_version VARCHAR(40) NOT NULL DEFAULT '',
  capabilities JSONB NOT NULL DEFAULT '{}'::JSONB,
  paired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE search_horoshop_photo_parser_pairings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  manual_code_hash CHAR(64) NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'claimed', 'expired', 'cancelled'
  )),
  expires_at TIMESTAMPTZ NOT NULL,
  claimed_device_id UUID REFERENCES search_horoshop_photo_parser_devices(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
);

ALTER TABLE search_horoshop_photo_runs
  ADD COLUMN executor VARCHAR(20) NOT NULL DEFAULT 'server' CHECK (executor IN ('server', 'desktop')),
  ADD COLUMN device_id UUID REFERENCES search_horoshop_photo_parser_devices(id) ON DELETE SET NULL,
  ADD COLUMN lease_expires_at TIMESTAMPTZ,
  ADD COLUMN heartbeat_at TIMESTAMPTZ,
  ADD COLUMN progress JSONB NOT NULL DEFAULT '{}'::JSONB;

CREATE TABLE search_horoshop_photo_run_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES search_horoshop_photo_runs(id) ON DELETE CASCADE,
  media_asset_id UUID NOT NULL REFERENCES media_library_assets(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  content_sha256 CHAR(64) NOT NULL,
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0 AND sort_order < 40),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (run_id, source_url),
  UNIQUE (run_id, content_sha256),
  UNIQUE (run_id, sort_order)
);

CREATE INDEX search_horoshop_photo_parser_devices_user_idx
  ON search_horoshop_photo_parser_devices (user_id, revoked_at, last_seen_at DESC);

CREATE UNIQUE INDEX search_horoshop_photo_parser_devices_installation_idx
  ON search_horoshop_photo_parser_devices (user_id, installation_id)
  WHERE installation_id IS NOT NULL;

CREATE INDEX search_horoshop_photo_parser_pairings_user_idx
  ON search_horoshop_photo_parser_pairings (user_id, created_at DESC);

CREATE INDEX search_horoshop_photo_runs_desktop_queue_idx
  ON search_horoshop_photo_runs (executor, status, created_at);

CREATE INDEX search_horoshop_photo_run_uploads_run_idx
  ON search_horoshop_photo_run_uploads (run_id, sort_order);
