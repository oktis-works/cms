# Migration recovery and legacy upgrade procedure

This procedure applies to databases created before the current migration metadata and `schema_bootstrap` record existed.

## Before upgrading

1. Confirm that the runtime uses PostgreSQL and that `okcms doctor` reports the expected database and Redis state.
2. Create a custom-format backup with `okcms db:backup --out pre-okcms-upgrade.dump`.
3. Copy the project migration files into the project with `okcms update --mode download` and review conflicts.
4. Inspect the deterministic plan with `okcms db:inventory --json`.
5. Run `okcms db:status`. Drift, missing files, or a blocked state must be resolved before applying new SQL.

## Adopting a legacy database

Run `okcms db:migrate --adopt-legacy --tenant <tenant>` once for each tenant that owns tenant-data migrations. The explicit flag records the legacy database as pre-baseline (`V000`) after the backup/inventory review; existing migration rows are not rewritten. The runner then validates every local checksum and applies only missing migrations in numeric order. Future runs do not need `--adopt-legacy`.

Do not delete, edit, or replace rows in `migrations` to make a checksum mismatch disappear. Preserve the database and local SQL, investigate the change, and either restore the reviewed file or perform an explicit forward repair migration.

## Forward-only migrations

Entries without a non-empty `-- +migrate Down` section are forward-only. They must not be reported as successfully rolled back. If one fails after partially changing data:

1. Keep the backup and the failed migration logs.
2. Do not rerun ad-hoc SQL against production.
3. Compare `okcms db:status` and `okcms db:inventory --json` with the release manifest.
4. Write a reviewed forward repair migration with a new version and explicit preflight checks.
5. Apply it only after the affected-row count and uniqueness/content conflicts are understood.
6. Re-run status and record the incident in the deployment history.

## Interrupted updates

An interrupted update leaves the project migration files and deployment history intact. Re-run `okcms update --dry-run`, resolve any migration conflicts, then retry the selected update target. Never use a second package version or a manually edited migration file to bypass a failed checksum check.
