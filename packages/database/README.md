# @oktis-works/database

Database layer — migrations, schema, connections, RLS, multi-provider (Postgres/MySQL/MariaDB).

## Migration System

### Structure

```
packages/database/
├── migrations/                    # Source migrations (authored)
│   ├── V001__core__*.sql
│   ├── ...
│   ├── V027__core__content_parent_and_hub.sql    # Phase 1
│   ├── mysql/
│   │   └── V027__core__content_parent_and_hub.sql
│   └── mariadb/
│       └── V027__core__content_parent_and_hub.sql
├── src/schema/
│   ├── schema.sql                # Postgres (source of truth)
│   ├── schema.mysql.sql
│   └── schema.mariadb.sql
└── dist/schema/                  # Copied by build
    ├── schema.sql
    ├── schema.mysql.sql
    └── schema.mariadb.sql
```

### Migration Format

```
V{NUM}__core__{description}.sql
V{NUM}__plugin_{name}__{description}.sql
```

- **Version** — zero-padded (V001, V027, etc.)
- **Owner** — `core` or `plugin_{name}`
- **Description** — snake_case, no spaces

### Provider Abstraction (AGENTS.md §12)

- **Write in Postgres dialect** — `schema.sql`
- **Translator** — `translateProviderSql()` strips `::cast`, `jsonb`, `ILIKE`, `ON CONFLICT`, advisory locks
- **MySQL/MariaDB** — manual sync in `migrations/mysql/`, `migrations/mariadb/` (25 migrations each)

### Schema (Phase 1 additions)

**`content` table:**
```sql
ALTER TABLE content ADD COLUMN IF NOT EXISTS parent_id UUID
  REFERENCES content(id) ON DELETE SET NULL;

CREATE INDEX idx_content_parent ON content(parent_id);
CREATE INDEX idx_content_tenant_type_parent ON content(tenant_id, type, parent_id);
```

**`url_redirects` table:**
```sql
CREATE TABLE url_redirects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_path TEXT NOT NULL,          -- 'blog/*' or 'projects/cliente-a/projeto-1'
  target_path TEXT NOT NULL,          -- 'noticias/*'
  redirect_type SMALLINT NOT NULL DEFAULT 301,
  is_prefix BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT                         -- 'slug_change', 'parent_change', 'base_rename'
);

CREATE INDEX idx_url_redirects_tenant_source ON url_redirects(tenant_id, source_path);
CREATE INDEX idx_url_redirects_tenant_prefix ON url_redirects(tenant_id) WHERE is_prefix = true;
```

### Migration Commands

```bash
# Run migrations (current tenant + core)
bun run db:migrate

# Rollback last migration
bun run db:rollback

# Fresh checkout test
rm -rf node_modules dist && bun install && bun run db:migrate
```

### Upgrade Acceptance Test

Tests upgrade from historical fixtures (V018 → current):

```bash
OKCMS_ACCEPTANCE_DATABASE_URL=postgresql://... \
  node packages/database/scripts/postgres-upgrade-acceptance.mjs
```

- Runs in Node (not Bun) — pool behavior differs
- Creates temp databases per boundary
- Verifies `schema_bootstrap.schema_version` updated
- Timeout: 5 min

### RLS (Row Level Security)

All tenant-scoped tables have RLS policies:

```sql
ALTER TABLE content ENABLE ROW LEVEL SECURITY;
CREATE POLICY content_tenant_isolation ON content
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

Set per-request: `SELECT set_config('app.current_tenant_id', $tenantId, true)`.

### Pool Configuration

```typescript
// Postgres
max: config.maxConnections ?? 10

// MySQL/MariaDB
connectionLimit: config.maxConnections ?? 20
```

**Never pass `undefined`** — creates single-connection pool → deadlocks.

### Phase 1 Migration (V027)

| File | Purpose |
|------|---------|
| `V027__core__content_parent_and_hub.sql` | `parent_id` + `url_redirects` (Postgres) |
| `mysql/V027__core__content_parent_and_hub.sql` | MySQL translation |
| `mariadb/V027__core__content_parent_and_hub.sql` | MariaDB translation |
| `schema.sql` / `.mysql.sql` / `.mariadb.sql` | Updated baseline |

### Reserved Connection

Migrations use reserved pool connection for advisory lock:

```typescript
const reserved = await pool.reserve();
await wrapReservedConnection(reserved).begin(); // shim for .begin()
```

### Connection Helper

```typescript
import { getConnection, runWithTenantTransaction } from '@oktis-works/database';

// Auto-scoped to current tenant
const sql = getConnection();

// Explicit tenant transaction
await runWithTenantTransaction(tenantId, async (sql) => {
  await sql`UPDATE content SET ...`;
});
```