ALTER TABLE search_horoshop_photo_selection_items
  ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0
    CHECK (sort_order >= 0);

CREATE INDEX search_horoshop_photo_selection_items_order_idx
  ON search_horoshop_photo_selection_items (selection_id, sort_order, created_at, id);

ALTER TABLE search_horoshop_photo_runs
  ADD COLUMN queue_position INTEGER NOT NULL DEFAULT 0
    CHECK (queue_position >= 0);

CREATE INDEX search_horoshop_photo_runs_batch_order_idx
  ON search_horoshop_photo_runs (batch_id, queue_position, id);
