ALTER TABLE used_smartphone_photo_parser_batches
  ADD COLUMN IF NOT EXISTS target_folder_id UUID
    REFERENCES media_library_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_used_smartphone_photo_parser_batches_target_folder
  ON used_smartphone_photo_parser_batches(target_folder_id, created_at DESC);
