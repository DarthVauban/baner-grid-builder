-- Publication history deliberately has no cascading references to selections,
-- drafts, catalog generations or media: removing temporary data must keep it.
CREATE TABLE search_horoshop_photo_publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL,
  generation UUID NOT NULL,
  draft_id UUID NOT NULL,
  store_domain TEXT NOT NULL,
  article TEXT NOT NULL,
  parent_article TEXT NOT NULL,
  public_origin TEXT NOT NULL,
  target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('images', 'gallery_common')),
  mode VARCHAR(10) NOT NULL CHECK (mode IN ('append', 'replace')),
  outcome VARCHAR(20) NOT NULL DEFAULT 'publishing' CHECK (outcome IN ('publishing', 'published', 'failed')),
  assets JSONB NOT NULL,
  before_images JSONB,
  remote_images JSONB NOT NULL DEFAULT '[]'::JSONB,
  verification_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'unconfirmed')),
  verification_attempts INTEGER NOT NULL DEFAULT 0,
  next_check_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cleanup_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (cleanup_status IN ('pending', 'completed', 'retained')),
  retained_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  cleaned_at TIMESTAMPTZ
);

CREATE INDEX search_horoshop_photo_publications_history_idx
  ON search_horoshop_photo_publications (store_domain, created_at DESC);
CREATE INDEX search_horoshop_photo_publications_pending_idx
  ON search_horoshop_photo_publications (outcome, verification_status, next_check_at);

-- Durable unlink queue: a restart or a filesystem error must not lose the
-- storage keys after the corresponding media rows have been removed.
CREATE TABLE search_horoshop_photo_cleanup_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id UUID NOT NULL REFERENCES search_horoshop_photo_publications(id),
  media_asset_id UUID NOT NULL,
  storage_key TEXT NOT NULL,
  removed_at TIMESTAMPTZ,
  UNIQUE (publication_id, media_asset_id)
);
