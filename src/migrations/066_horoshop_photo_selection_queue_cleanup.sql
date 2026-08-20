ALTER TABLE search_horoshop_photo_batches
  ADD COLUMN selection_based BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE search_horoshop_photo_batches
SET selection_based = TRUE
WHERE selection_id IS NOT NULL;

ALTER TABLE search_horoshop_photo_batches
  DROP CONSTRAINT IF EXISTS search_horoshop_photo_batches_selection_id_fkey;

ALTER TABLE search_horoshop_photo_batches
  ADD CONSTRAINT search_horoshop_photo_batches_selection_id_fkey
  FOREIGN KEY (selection_id)
  REFERENCES search_horoshop_photo_selections(id)
  ON DELETE CASCADE;
