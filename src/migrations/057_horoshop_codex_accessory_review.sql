ALTER TABLE search_horoshop_accessory_links
  DROP CONSTRAINT IF EXISTS search_horoshop_accessory_links_source_check;

UPDATE search_horoshop_accessory_links
SET source = 'manual', algorithm_version = NULL, updated_at = NOW()
WHERE source = 'algorithm' AND (selected = TRUE OR published = TRUE);

DELETE FROM search_horoshop_accessory_links
WHERE source = 'algorithm';

DROP INDEX IF EXISTS search_horoshop_accessory_links_algorithm_version_idx;

ALTER TABLE search_horoshop_accessory_links
  DROP COLUMN algorithm_version,
  DROP COLUMN compatibility_score,
  DROP COLUMN utility_score,
  DROP COLUMN availability_score,
  DROP COLUMN popularity_score,
  DROP COLUMN total_score,
  ADD COLUMN codex_proposed BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE search_horoshop_accessory_links
  ADD CONSTRAINT search_horoshop_accessory_links_source_check
  CHECK (source IN ('manual', 'imported'));
