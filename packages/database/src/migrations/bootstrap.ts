// @oktis-works/database - Bootstrap de banco fresco
//
// Um banco novo não tem NADA: nem o schema core (a tabela `migrations` sequer
// existe — e tem FK para `tenants`), nem o tenant usado pelo CLI. Sem isto,
// `okcms db:migrate` morria com `relation "migrations" does not exist`.
//
// - schema.sql is the canonical baseline snapshot for fresh databases.
//   Existing databases receive migration infrastructure only; explicit
//   numbered migrations own historical schema upgrades and the full snapshot
//   is never replayed as an implicit delta.
// - resolveTenantId traduz o `--tenant` (default: "default") para o UUID real
//   de tenants.slug, criando o tenant default na primeira vez (bootstrap).

import { createHash } from 'node:crypto';
import { getConnection } from '../connection.js';
import { getSchema } from '../schema/index.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ledger-only DDL used when adopting a database that predates the snapshot. */
const MIGRATION_INFRASTRUCTURE = `
CREATE TABLE IF NOT EXISTS migrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  owner VARCHAR(255) NOT NULL,
  owner_type VARCHAR(20) NOT NULL CHECK (owner_type IN ('CORE', 'PLUGIN')),
  version VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  checksum VARCHAR(255) NOT NULL,
  UNIQUE(tenant_id, owner, version)
);
ALTER TABLE migrations ADD COLUMN IF NOT EXISTS domain VARCHAR(30) NOT NULL DEFAULT 'tenant_data';
ALTER TABLE migrations ADD COLUMN IF NOT EXISTS provider VARCHAR(20) NOT NULL DEFAULT 'postgres';
ALTER TABLE migrations ADD COLUMN IF NOT EXISTS reversible BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE migrations ADD COLUMN IF NOT EXISTS forward_only BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE migrations ADD COLUMN IF NOT EXISTS destructive BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE migrations ADD COLUMN IF NOT EXISTS requires_backup BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE migrations ADD COLUMN IF NOT EXISTS dependencies JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS core_schema_migrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), owner VARCHAR(255) NOT NULL,
  owner_type VARCHAR(20) NOT NULL, version VARCHAR(50) NOT NULL, name VARCHAR(255) NOT NULL,
  applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(), checksum VARCHAR(255) NOT NULL,
  domain VARCHAR(30) NOT NULL DEFAULT 'core_schema', provider VARCHAR(20) NOT NULL DEFAULT 'postgres',
  reversible BOOLEAN NOT NULL DEFAULT FALSE, forward_only BOOLEAN NOT NULL DEFAULT TRUE,
  destructive BOOLEAN NOT NULL DEFAULT FALSE, requires_backup BOOLEAN NOT NULL DEFAULT FALSE,
  dependencies JSONB NOT NULL DEFAULT '[]'::jsonb, UNIQUE(owner, version)
);
CREATE TABLE IF NOT EXISTS tenant_data_migrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  owner VARCHAR(255) NOT NULL, owner_type VARCHAR(20) NOT NULL, version VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL, applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(), checksum VARCHAR(255) NOT NULL,
  domain VARCHAR(30) NOT NULL DEFAULT 'tenant_data', provider VARCHAR(20) NOT NULL DEFAULT 'postgres',
  reversible BOOLEAN NOT NULL DEFAULT FALSE, forward_only BOOLEAN NOT NULL DEFAULT TRUE,
  destructive BOOLEAN NOT NULL DEFAULT FALSE, requires_backup BOOLEAN NOT NULL DEFAULT FALSE,
  dependencies JSONB NOT NULL DEFAULT '[]'::jsonb, UNIQUE(tenant_id, owner, version)
);
CREATE TABLE IF NOT EXISTS plugin_schema_migrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  owner VARCHAR(255) NOT NULL, owner_type VARCHAR(20) NOT NULL, version VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL, applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(), checksum VARCHAR(255) NOT NULL,
  domain VARCHAR(30) NOT NULL DEFAULT 'plugin_schema', provider VARCHAR(20) NOT NULL DEFAULT 'postgres',
  reversible BOOLEAN NOT NULL DEFAULT FALSE, forward_only BOOLEAN NOT NULL DEFAULT TRUE,
  destructive BOOLEAN NOT NULL DEFAULT FALSE, requires_backup BOOLEAN NOT NULL DEFAULT FALSE,
  dependencies JSONB NOT NULL DEFAULT '[]'::jsonb, UNIQUE(tenant_id, owner, version)
);
CREATE TABLE IF NOT EXISTS schema_bootstrap (
  id SMALLINT PRIMARY KEY CHECK (id = 1), schema_version VARCHAR(50) NOT NULL,
  schema_checksum VARCHAR(64) NOT NULL, applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
`;

/**
 * Applies the canonical schema snapshot only to a fresh database and returns
 * `true` for that bootstrap. Existing databases receive ledger/lock
 * infrastructure only; schema changes must arrive through numbered files.
 */
export interface EnsureCoreSchemaOptions {
  /** Explicitly adopts an existing legacy database as pre-V001. */
  adoptLegacy?: boolean;
}

async function applyInfrastructure(sql: ReturnType<typeof getConnection>, provider: string, infrastructureSql: string): Promise<void> {
  if (provider === 'postgres') {
    await sql.unsafe(infrastructureSql);
    return;
  }

  // MySQL and MariaDB do not share PostgreSQL's ADD COLUMN IF NOT EXISTS
  // behavior across supported versions. Execute the additive statements one
  // at a time and tolerate a column that was already provisioned by a schema
  // snapshot or a previous bootstrap attempt.
  for (const statement of infrastructureSql.split(';').map((part) => part.trim()).filter(Boolean)) {
    try {
      await sql.unsafe(statement);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/duplicate column|duplicate field name|ER_DUP_FIELDNAME/i.test(message)) throw error;
    }
  }
}

export async function ensureCoreSchema(options: EnsureCoreSchemaOptions = {}): Promise<boolean> {
  const sql = getConnection();
  if ((sql as { driver?: string }).driver) {
    await (await import('../connection.js')).assertSupportedServerVersion();
  }
  const provider = (sql as { driver?: 'postgres' | 'mysql' | 'mariadb' }).driver ?? 'postgres';
  const schemaSql = getSchema(provider);
  const schemaChecksum = createHash('sha256').update(schemaSql).digest('hex');

  const probe = await sql<{ exists: string | null }[]>`
    SELECT to_regclass('public.tenants')::text AS exists
  `;
  const fresh = !probe[0]?.exists;
  let previous: Array<{ schema_version: string }> = [];
  if (!fresh) {
    try {
      previous = await sql<{ schema_version: string }[]>`
        SELECT schema_version FROM schema_bootstrap WHERE id = 1
      `;
    } catch (error) {
      if (!/relation .* does not exist/i.test(error instanceof Error ? error.message : String(error))) throw error;
    }
  }
  const previousVersion = previous[0]?.schema_version;
  const schemaVersion = fresh
    ? 'V025'
    : options.adoptLegacy
      ? 'V000'
      : previousVersion ?? 'legacy-pending';

  await sql.begin(async (tx) => {
    // Serialize bootstrap operations across all supported providers.
    await tx`SELECT pg_advisory_xact_lock(hashtext('okcms.core.schema'))`;
    // Só warnings/erros: o schema tem ALTER ... ADD COLUMN IF NOT EXISTS
    // redundantes (a coluna já vem no CREATE TABLE) e o Postgres responde
    // NOTICE 42701 "already exists, skipping" — ruído puro no output do init.
    await tx`SET client_min_messages = warning`;
    const infrastructureSql = provider === 'postgres'
      ? MIGRATION_INFRASTRUCTURE
      : MIGRATION_INFRASTRUCTURE.replaceAll("DEFAULT 'postgres'", `DEFAULT '${provider}'`);
    if (fresh) {
      await tx.unsafe(schemaSql);
    } else {
      await applyInfrastructure(tx, provider, infrastructureSql);
    }
    await tx`
      INSERT INTO schema_bootstrap (id, schema_version, schema_checksum)
      VALUES (1, ${schemaVersion}, ${schemaChecksum})
      ON CONFLICT (id) DO UPDATE SET
        schema_version = CASE
          WHEN ${options.adoptLegacy === true} THEN EXCLUDED.schema_version
          ELSE schema_bootstrap.schema_version
        END,
        schema_checksum = EXCLUDED.schema_checksum,
        applied_at = NOW()
    `;
  });
  return fresh;
}

/**
 * Resolve o argumento `--tenant` para um UUID:
 * - UUID válido → devolve direto;
 * - slug existente em tenants.slug → devolve o id;
 * - slug "default" inexistente → cria o tenant (bootstrap) e devolve o id;
 * - qualquer outro slug inexistente → erro claro (não cria slug com typo).
 */
export async function resolveTenantId(
  input: string,
  options: { createDefault?: boolean } = {}
): Promise<string> {
  if (UUID_RE.test(input)) {
    return input;
  }

  const sql = getConnection();

  const found = await sql<{ id: string }[]>`
    SELECT id FROM tenants WHERE slug = ${input} LIMIT 1
  `;
  if (found[0]) {
    return found[0].id;
  }

  if (input !== 'default' || options.createDefault === false) {
    throw new Error(
      `Tenant "${input}" não encontrado. Crie-o no admin ou passe um UUID com --tenant.`
    );
  }

  const created = await sql<{ id: string }[]>`
    INSERT INTO tenants (name, slug) VALUES ('Default', 'default')
    ON CONFLICT (slug) DO NOTHING
    RETURNING id
  `;
  if (created[0]) {
    return created[0].id;
  }

  // Corrida: outro processo criou o tenant entre o SELECT e o INSERT.
  const again = await sql<{ id: string }[]>`
    SELECT id FROM tenants WHERE slug = ${input} LIMIT 1
  `;
  if (again[0]) {
    return again[0].id;
  }
  throw new Error('Falha ao criar o tenant default');
}
