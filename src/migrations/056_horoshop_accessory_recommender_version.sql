ALTER TABLE search_horoshop_accessory_links
  ADD COLUMN algorithm_version INTEGER;

CREATE INDEX search_horoshop_accessory_links_algorithm_version_idx
  ON search_horoshop_accessory_links (set_id, algorithm_version)
  WHERE source = 'algorithm' AND selected = FALSE AND published = FALSE;
