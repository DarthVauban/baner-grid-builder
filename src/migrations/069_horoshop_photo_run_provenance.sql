ALTER TABLE search_horoshop_photo_drafts
  ADD COLUMN source_run_id UUID
    REFERENCES search_horoshop_photo_runs(id) ON DELETE SET NULL;

CREATE INDEX search_horoshop_photo_drafts_source_run_idx
  ON search_horoshop_photo_drafts (source_run_id);
