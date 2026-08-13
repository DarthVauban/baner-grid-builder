ALTER TABLE search_horoshop_accessory_links
  ADD COLUMN compatibility_score NUMERIC(5,4),
  ADD COLUMN utility_score NUMERIC(5,4),
  ADD COLUMN availability_score NUMERIC(5,4),
  ADD COLUMN popularity_score NUMERIC(5,4),
  ADD COLUMN total_score NUMERIC(5,4);

ALTER TABLE search_horoshop_accessory_links
  ADD CONSTRAINT search_horoshop_accessory_links_codex_scores_check CHECK (
    (compatibility_score IS NULL OR compatibility_score BETWEEN 0 AND 1)
    AND (utility_score IS NULL OR utility_score BETWEEN 0 AND 1)
    AND (availability_score IS NULL OR availability_score BETWEEN 0 AND 1)
    AND (popularity_score IS NULL OR popularity_score BETWEEN 0 AND 1)
    AND (total_score IS NULL OR total_score BETWEEN 0 AND 1)
  );
