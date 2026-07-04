ALTER TABLE users
  ADD COLUMN first_name VARCHAR(80),
  ADD COLUMN last_name VARCHAR(80),
  ADD COLUMN department VARCHAR(120) NOT NULL DEFAULT '',
  ADD COLUMN position VARCHAR(120) NOT NULL DEFAULT '',
  ADD COLUMN avatar_data BYTEA,
  ADD COLUMN avatar_mime VARCHAR(30);

UPDATE users
SET first_name = name,
    last_name = ''
WHERE first_name IS NULL;
