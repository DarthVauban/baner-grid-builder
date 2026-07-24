ALTER TABLE used_smartphone_photo_parser_runs
  ADD COLUMN IF NOT EXISTS error_dismissed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS used_smartphone_photo_parser_runs_visible_errors_idx
  ON used_smartphone_photo_parser_runs(status, completed_at DESC)
  WHERE status IN ('partial', 'failed') AND error_dismissed_at IS NULL;
