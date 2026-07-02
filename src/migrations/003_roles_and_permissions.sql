ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
UPDATE users SET role = 'editor' WHERE role = 'user';
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'content_manager';
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'editor', 'content_manager'));

CREATE TABLE role_permissions (
  role VARCHAR(30) NOT NULL CHECK (role IN ('editor', 'content_manager')),
  resource VARCHAR(40) NOT NULL CHECK (resource IN ('banner_grids', 'saved_banners', 'product_tables')),
  can_view_all BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (role, resource)
);

INSERT INTO role_permissions (role, resource, can_view_all) VALUES
  ('editor', 'banner_grids', TRUE),
  ('editor', 'saved_banners', TRUE),
  ('editor', 'product_tables', TRUE),
  ('content_manager', 'banner_grids', FALSE),
  ('content_manager', 'saved_banners', FALSE),
  ('content_manager', 'product_tables', FALSE);
