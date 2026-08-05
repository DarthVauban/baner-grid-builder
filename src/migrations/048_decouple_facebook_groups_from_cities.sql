ALTER TABLE facebook_publication_groups
  ALTER COLUMN default_store_id DROP NOT NULL;

UPDATE facebook_publication_groups
SET default_store_id = NULL,
    city = '';

UPDATE facebook_publication_stores
SET name = city,
    notes = '',
    status = 'active';
