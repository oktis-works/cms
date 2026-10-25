-- @okcms domain=core_schema provider=postgres conflict_policy=block max_affected_rows=100000
-- +migrate Up
-- Add unique constraint for content (tenant_id, type, slug) to support ON CONFLICT in seed
-- This is required for the demo content seed to work with ON CONFLICT specification

-- First, remove any duplicate entries that would violate the unique constraint
DELETE FROM content a
WHERE a.ctid <> (
  SELECT min(b.ctid)
  FROM content b
  WHERE b.tenant_id = a.tenant_id
    AND b.type = a.type
    AND b.slug = a.slug
);

-- Add unique constraint (safe: checks if exists first)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'uq_content_tenant_type_slug'
  ) THEN
    ALTER TABLE content
    ADD CONSTRAINT uq_content_tenant_type_slug UNIQUE (tenant_id, type, slug);
  END IF;
END $$;

-- +migrate Down
ALTER TABLE content DROP CONSTRAINT IF EXISTS uq_content_tenant_type_slug;
