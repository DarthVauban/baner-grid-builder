ALTER TABLE support_chat_messages
  ADD COLUMN IF NOT EXISTS product_references JSONB NOT NULL DEFAULT '[]'::JSONB;

CREATE INDEX IF NOT EXISTS search_horoshop_products_connection_url_idx
  ON search_horoshop_products(connection_id, canonical_url);

CREATE INDEX IF NOT EXISTS search_horoshop_modifications_connection_url_idx
  ON search_horoshop_modifications(connection_id, page_url);
