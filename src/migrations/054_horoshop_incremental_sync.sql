ALTER TABLE search_horoshop_categories
  ADD COLUMN sync_signature TEXT;

ALTER TABLE search_horoshop_products
  ADD COLUMN sync_signature TEXT;

ALTER TABLE search_horoshop_modifications
  ADD COLUMN sync_signature TEXT;
