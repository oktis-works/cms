-- Historical dual-source adoption fixture. The runner must require
-- --adopt-legacy before treating this database as a migration baseline.
DELETE FROM core_schema_migrations;
DELETE FROM tenant_data_migrations;
DELETE FROM plugin_schema_migrations;
UPDATE schema_bootstrap SET schema_version = 'legacy-pending' WHERE id = 1;
