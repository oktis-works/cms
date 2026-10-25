-- Historical release-boundary fixture. Applied after the canonical snapshot.
-- It models the dual-source V024 boundary with V025 pending.
UPDATE schema_bootstrap SET schema_version = 'V024' WHERE id = 1;
DROP TABLE IF EXISTS content_value_migration_conflicts;
