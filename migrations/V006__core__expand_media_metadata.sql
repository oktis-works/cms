-- +migrate Up
-- WordPress-style attachment metadata: display title and long description.
ALTER TABLE media ADD COLUMN IF NOT EXISTS title VARCHAR(500);
ALTER TABLE media ADD COLUMN IF NOT EXISTS description TEXT;

-- Existing uploads keep their filename as a useful initial attachment title.
UPDATE media SET title = filename WHERE title IS NULL;

-- +migrate Down
ALTER TABLE media DROP COLUMN IF EXISTS description;
ALTER TABLE media DROP COLUMN IF EXISTS title;
