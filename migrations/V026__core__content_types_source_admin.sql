-- @okcms domain=core_schema provider=postgres
-- Allow 'ADMIN' as a valid source value for content_types created via the admin UI.
-- The existing CHECK constraint only accepts 'CORE' and 'PLUGIN', which breaks
-- POST /api/v1/content-types when the API sends source='ADMIN'.
ALTER TABLE content_types DROP CONSTRAINT IF EXISTS content_types_source_check;
ALTER TABLE content_types ADD CONSTRAINT content_types_source_check CHECK (source IN ('CORE', 'PLUGIN', 'ADMIN'));
