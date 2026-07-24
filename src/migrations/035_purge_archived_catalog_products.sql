DELETE FROM used_smartphone_products
WHERE publication_status = 'ARCHIVED';

DELETE FROM used_smartphone_photo_parser_batches
WHERE id NOT IN (
  SELECT DISTINCT batch_id
  FROM used_smartphone_photo_parser_runs
);
