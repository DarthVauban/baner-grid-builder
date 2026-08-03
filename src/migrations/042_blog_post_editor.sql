ALTER TABLE blog_publications
  ADD COLUMN IF NOT EXISTS editor_document JSONB;
