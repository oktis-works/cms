# Database Provider and Version Matrix

OkCMS supports three database providers. MySQL and MariaDB are separate
compatibility targets; passing one provider's tests does not establish support
for the other.

| Provider | Supported versions | Driver | Default port | TLS modes |
|---|---|---|---:|---|
| PostgreSQL | 16.x | `postgres` 3.4.x | 5432 | disabled, require, verify-ca, verify-full |
| MySQL | 8.0.36 and 8.4 LTS | `mysql2` 3.24.x | 3306 | disabled, CA, certificate verification |
| MariaDB | 11.4 LTS | `mariadb` 3.5.x | 3306 | disabled, CA, certificate verification |

The supported application runtimes are Node.js `>=22.17.0` and Bun
`>=1.4.4`. The minimum server version is checked before schema mutation. An
older or unknown server is reported as unsupported and the command stops before
running migrations or seeds.

`DATABASE_URL` may use `postgres://`, `postgresql://`, `mysql://`, or
`mariadb://`. When a URL is present, its protocol must agree with `DB_ENGINE`
and `DB_DRIVER`; contradictory values fail with a redacted configuration error.
Provider-specific schemas and migration directories are used. PostgreSQL RLS
is not claimed for MySQL or MariaDB: those providers rely on explicit tenant
predicates and authorization at the application/data-access boundary.

The release gate requires a green fresh-install, upgrade, migration/recovery,
tenant-isolation, plugin-migration, backup/restore, generated-project, and
deployment result for every provider/version entry declared here. Support is
removed from this table before release if its matrix is not green.
