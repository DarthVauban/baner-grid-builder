-- Previous binaries intentionally ignore the block family. Keep that rollback boundary.
ALTER TABLE popup_banner_campaigns
  ADD COLUMN zero_block BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN zero_document JSONB,
  ADD COLUMN zero_draft_revision INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN zero_campaign_revision INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN zero_publication_id UUID REFERENCES popup_banner_versions(id),
  ADD COLUMN zero_deleted_at TIMESTAMPTZ,
  ADD CONSTRAINT popup_zero_block_family_check CHECK (NOT zero_block OR campaign_type = 'block');

ALTER TABLE popup_banner_versions
  ADD COLUMN zero_draft_revision INTEGER,
  ADD COLUMN zero_store_generation UUID;

CREATE UNIQUE INDEX popup_zero_publication_revision_idx
  ON popup_banner_versions (campaign_id, zero_draft_revision, zero_store_generation);

CREATE TABLE popup_zero_media_snapshots (
  media_id UUID PRIMARY KEY,
  mime TEXT NOT NULL,
  bytes BYTEA NOT NULL
);

CREATE TABLE popup_zero_publish_operations (
  campaign_id UUID NOT NULL REFERENCES popup_banner_campaigns(id),
  operation_id UUID NOT NULL,
  publication_id UUID NOT NULL REFERENCES popup_banner_versions(id),
  PRIMARY KEY (campaign_id, operation_id)
);

CREATE TABLE popup_zero_reward_files (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  bytes BYTEA NOT NULL,
  byte_length INTEGER NOT NULL,
  sha256 CHAR(64) NOT NULL,
  UNIQUE (name, sha256)
);

CREATE TABLE popup_zero_submissions (
  contact_id UUID PRIMARY KEY REFERENCES popup_banner_contacts(id),
  publication_id UUID NOT NULL REFERENCES popup_banner_versions(id),
  payload_hash CHAR(64) NOT NULL,
  reward JSONB,
  reward_file_id UUID REFERENCES popup_zero_reward_files(id),
  reward_token CHAR(64) UNIQUE,
  reward_expires_at TIMESTAMPTZ
);

CREATE TABLE popup_zero_submit_limits (
  connection_id UUID NOT NULL,
  form_id VARCHAR(80) NOT NULL,
  client_hash CHAR(64) NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL,
  PRIMARY KEY (connection_id, form_id, client_hash, window_start)
);

CREATE TABLE popup_zero_paint_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  paint TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, paint)
);
