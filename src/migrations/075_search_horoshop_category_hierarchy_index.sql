CREATE INDEX IF NOT EXISTS search_horoshop_categories_hierarchy_idx
  ON search_horoshop_categories (connection_id, generation, active, parent_external_id);
