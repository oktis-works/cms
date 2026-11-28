# @oktis-works/database

Database layer — migrations, schema, connections, RLS, PostgreSQL.

## Migration System

### Structure

```
packages/database/
├── migrations/                    # Source migrations (authored)
│   ├── V001__core__*.sql
│   ├── ...
│   └── V027__core__content_parent_and_hub.sql
├── src/schema/
│   ├── schema.sql                # Postgres (source of truth)
└── src/
    ├── connection.ts             # PostgreSQL connection adapter
    └── rls/                      # Row Level Security helpers
```

### Providers

PostgreSQL 16+ is the only supported database provider. Row Level Security
(RLS) is enforced natively by the database via `FORCE ROW LEVEL SECURITY`
policies, providing the database-level backstop for tenant isolation.
