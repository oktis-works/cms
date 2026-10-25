-- Historical release-boundary fixture. Applied after the canonical snapshot.
-- It models the V018 ledger boundary while retaining the legacy snapshot data.
UPDATE schema_bootstrap SET schema_version = 'V018' WHERE id = 1;
ALTER TABLE content DROP CONSTRAINT IF EXISTS uq_content_tenant_type_slug;
ALTER TABLE menus DROP CONSTRAINT IF EXISTS uq_menus_tenant_slug;
DROP TABLE IF EXISTS content_value_migration_conflicts;
