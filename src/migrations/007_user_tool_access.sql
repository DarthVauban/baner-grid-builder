ALTER TABLE users
  ADD COLUMN IF NOT EXISTS can_manage_tool_access BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE user_tool_access (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tool_id VARCHAR(50) NOT NULL CHECK (tool_id IN (
    'banner_grid', 'product_selection', 'product_tables', 'blog_publications', 'chat'
  )),
  granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, tool_id)
);

CREATE INDEX user_tool_access_tool_idx ON user_tool_access(tool_id);

INSERT INTO user_tool_access (user_id, tool_id)
SELECT id, 'banner_grid' FROM users
ON CONFLICT (user_id, tool_id) DO NOTHING;

INSERT INTO user_tool_access (user_id, tool_id)
SELECT id, 'product_selection' FROM users
ON CONFLICT (user_id, tool_id) DO NOTHING;

INSERT INTO user_tool_access (user_id, tool_id)
SELECT id, 'product_tables' FROM users
ON CONFLICT (user_id, tool_id) DO NOTHING;

INSERT INTO user_tool_access (user_id, tool_id)
SELECT id, 'blog_publications' FROM users
ON CONFLICT (user_id, tool_id) DO NOTHING;
