CREATE TABLE IF NOT EXISTS media_library_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  parent_id UUID REFERENCES media_library_folders(id) ON DELETE RESTRICT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_library_folders_parent
  ON media_library_folders(parent_id, name);

CREATE INDEX IF NOT EXISTS idx_media_library_folders_created_by
  ON media_library_folders(created_by, created_at DESC);

ALTER TABLE media_library_assets
  ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES media_library_folders(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_media_library_assets_folder
  ON media_library_assets(folder_id, created_at DESC);
