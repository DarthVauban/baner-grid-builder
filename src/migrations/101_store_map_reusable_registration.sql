ALTER TABLE store_map_registration_requests DROP CONSTRAINT store_map_registration_requests_link_id_key;
ALTER TABLE store_map_registration_requests ALTER COLUMN link_id DROP NOT NULL;
CREATE UNIQUE INDEX store_map_registration_requests_legacy_link_unique
  ON store_map_registration_requests(link_id) WHERE link_id IS NOT NULL;
ALTER TABLE store_map_registration_requests ADD COLUMN submission_id UUID UNIQUE;
ALTER TABLE store_map_registration_requests ADD COLUMN submission_hash VARCHAR(64);
ALTER TABLE store_map_registration_requests ADD CONSTRAINT store_map_registration_submission_required
  CHECK (link_id IS NOT NULL OR (submission_id IS NOT NULL AND submission_hash IS NOT NULL));
