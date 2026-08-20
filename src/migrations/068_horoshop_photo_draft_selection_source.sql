ALTER TABLE search_horoshop_photo_drafts
  ADD COLUMN source_selection_id UUID
    REFERENCES search_horoshop_photo_selections(id) ON DELETE SET NULL;

CREATE INDEX search_horoshop_photo_drafts_source_selection_idx
  ON search_horoshop_photo_drafts (source_selection_id, publish_status);
