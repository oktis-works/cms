-- +migrate Up
-- Add unique constraint for menus (tenant_id, slug) to support ON CONFLICT in seed
-- This is required for the demo content seed to work with ON CONFLICT specification

-- First, remove any duplicate entries that would violate the unique constraint
DELETE FROM menus a
WHERE a.ctid <> (
  SELECT min(b.ctid)
  FROM menus b
  WHERE b.tenant_id = a.tenant_id
    AND b.slug = a.slug
);

-- Add unique constraint
ALTER TABLE menus
ADD CONSTRAINT uq_menus_tenant_slug UNIQUE (tenant_id, slug);

-- +migrate Down
ALTER TABLE menus DROP CONSTRAINT IF EXISTS uq_menus_tenant_slug;