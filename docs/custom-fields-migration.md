# Canonical Custom-Field Migration

`content.body` is the canonical logical value document. Native content
columns, `content.data`, and `field_values` are compatibility sources during
the migration and are not independently writable by the content service.

Precedence is deterministic: canonical `body`, legacy `data`, relational
`field_values`, then native columns. Conflicting `body`/`data` values are
recorded in `content_value_migration_conflicts` before the canonical document
is written.

Before applying migration `V025`, take a database backup. To recover, restore
the affected `content` and `content_versions` rows from that backup, remove
the conflict report rows for those content IDs, and rerun the migration only
after reviewing the source values. The migration is intentionally one-way;
its SQL down section removes only the report table and does not pretend to
reconstruct discarded legacy columns.

New code must use the shared logical-value normalizer and must not write
`content.data` or `field_values` as a second content-value store.
