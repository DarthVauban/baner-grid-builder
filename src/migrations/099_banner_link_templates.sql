CREATE TABLE banner_link_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  base_url VARCHAR(2000) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT banner_link_templates_name_not_empty CHECK (name <> '')
);

CREATE UNIQUE INDEX banner_link_templates_user_name_idx
  ON banner_link_templates (user_id, lower(name));
