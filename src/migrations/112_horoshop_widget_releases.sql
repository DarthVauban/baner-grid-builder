CREATE TABLE horoshop_widget_assets (
  sha384 TEXT PRIMARY KEY,
  extension TEXT NOT NULL CHECK (extension IN ('js', 'css')),
  body TEXT NOT NULL
);

CREATE TABLE horoshop_widget_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loader_sha384 TEXT NOT NULL REFERENCES horoshop_widget_assets(sha384),
  workspace_origin TEXT NOT NULL,
  store_domain TEXT NOT NULL,
  build_sha TEXT NOT NULL,
  published_by UUID REFERENCES users(id) ON DELETE SET NULL,
  publisher_name TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX horoshop_widget_releases_history_idx
  ON horoshop_widget_releases (published_at DESC, id DESC);
