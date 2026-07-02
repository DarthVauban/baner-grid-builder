CREATE TABLE product_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  file_name VARCHAR(255) NOT NULL DEFAULT '',
  data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  sheet_count INTEGER NOT NULL DEFAULT 0 CHECK (sheet_count >= 0),
  row_count INTEGER NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX product_tables_user_updated_idx ON product_tables(user_id, updated_at DESC);
CREATE INDEX product_tables_user_name_idx ON product_tables(user_id, lower(name));
