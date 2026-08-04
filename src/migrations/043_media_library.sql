CREATE TABLE IF NOT EXISTS media_library_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_name VARCHAR(255) NOT NULL,
  storage_key VARCHAR(255) NOT NULL UNIQUE,
  url TEXT NOT NULL UNIQUE,
  mime_type VARCHAR(100) NOT NULL DEFAULT 'image/webp',
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  original_size_bytes INTEGER NOT NULL CHECK (original_size_bytes >= 0),
  width INTEGER NOT NULL CHECK (width > 0),
  height INTEGER NOT NULL CHECK (height > 0),
  content_sha256 CHAR(64) NOT NULL,
  alt_text VARCHAR(500) NOT NULL DEFAULT '',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_library_assets_created_at
  ON media_library_assets(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_media_library_assets_created_by
  ON media_library_assets(created_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_media_library_assets_content_sha256
  ON media_library_assets(content_sha256);
