# Database Provider and Version Matrix

OkCMS supports **PostgreSQL 16+** as its only database provider.

| Provider | Supported versions | Driver | Default port | TLS modes |
|---|---|---:|---|---|
| PostgreSQL | 16.x | `postgres` 3.4.x | 5432 | disabled, require, verify-ca, verify-full |

The supported application runtimes are Node.js `>=22.23.0` and Bun
`>=1.4.4`. The minimum server version is checked before schema mutation. An
older or unknown server is reported as unsupported and the command stops before
running migrations or seeds.

`DATABASE_URL` may use `postgres://` or `postgresql://`. When a URL is present,
its protocol must agree with `DB_ENGINE` and `DB_DRIVER`; contradictory values
fail with a redacted configuration error.

The release gate requires a green fresh-install, upgrade, migration/recovery,
tenant-isolation, plugin-migration, backup/restore, generated-project, and
deployment result for PostgreSQL. PostgreSQL RLS (`FORCE ROW LEVEL SECURITY`)
is the database-level backstop for tenant isolation.
