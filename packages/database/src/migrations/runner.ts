// @oktis-works/database - Migration Runner

import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { getConnection, sqlId, type RepoSql } from '../connection.js';
import { preflightMigration, type MigrationPreflightReport } from './preflight.js';

export interface MigrationFile {
  name: string;
  version: string;
  owner: string;
  ownerType: 'CORE' | 'PLUGIN';
  sql: string;
  checksum: string;
  /** Machine-readable operational metadata; legacy files use safe defaults. */
  metadata?: MigrationMetadata;
}

export interface MigrationMetadata {
  domain: 'core_schema' | 'tenant_data' | 'plugin_schema';
  provider: string;
  reversible: boolean;
  forwardOnly: boolean;
  destructive: boolean;
  requiresBackup: boolean;
  dependencies: string[];
  conflictPolicy?: 'report' | 'block' | 'dedupe_keep_oldest';
  maxAffectedRows?: number;
}

export interface ApplyMigrationOptions {
  /** Plugin schema that must own the migration objects. */
  schemaName?: string;
  /** Reserved connection used to hold a plan lock across all migrations. */
  connection?: RepoSql;
}

export interface RollbackMigrationOptions {
  /** Plugin schema that owns the migration objects. */
  schemaName?: string;
}

export interface MigrationRunOptions {
  /** Active database provider. */
  provider?: string;
  /** Required when the bootstrap identifies an unadopted legacy database. */
  adoptLegacy?: boolean;
}

async function readSchemaBaseline(sql: RepoSql): Promise<string | null> {
  try {
    const rows = await sql<{ schema_version: string }[]>`
      SELECT schema_version FROM schema_bootstrap WHERE id = 1
    `;
    return rows[0]?.schema_version ?? null;
  } catch (error) {
    if (/relation .* does not exist/i.test(error instanceof Error ? error.message : String(error))) return null;
    throw error;
  }
}

export interface MigrationRecord {
  id: string;
  tenant_id?: string;
  owner: string;
  owner_type: string;
  version: string;
  name: string;
  applied_at: Date;
  checksum: string;
  domain?: string;
  provider?: string;
  reversible?: boolean;
  forward_only?: boolean;
  destructive?: boolean;
  requires_backup?: boolean;
  dependencies?: string[] | unknown;
}

type MigrationDomain = MigrationMetadata['domain'];

function domainFor(migration: MigrationFile): MigrationDomain {
  return migration.metadata?.domain ?? parseMigrationMetadata(migration.sql, migration.ownerType).domain;
}

/** Reads the domain ledger; table names are a closed internal allow-list. */
async function selectDomainLedger(
  sql: RepoSql,
  domain: MigrationDomain,
  tenantId: string,
  owner?: string,
  version?: string
): Promise<MigrationRecord[]> {
  try {
    switch (domain) {
      case 'core_schema':
        return owner === undefined
          ? await sql<MigrationRecord[]>`SELECT * FROM core_schema_migrations ORDER BY version::integer ASC, applied_at ASC`
          : await sql<MigrationRecord[]>`SELECT id, checksum FROM core_schema_migrations WHERE owner = ${owner} AND version = ${version!}`;
      case 'tenant_data':
        return owner === undefined
          ? await sql<MigrationRecord[]>`SELECT * FROM tenant_data_migrations WHERE tenant_id = ${tenantId} ORDER BY owner ASC, version::integer ASC, applied_at ASC`
          : await sql<MigrationRecord[]>`SELECT id, checksum FROM tenant_data_migrations WHERE tenant_id = ${tenantId} AND owner = ${owner} AND version = ${version!}`;
      case 'plugin_schema':
        return owner === undefined
          ? await sql<MigrationRecord[]>`SELECT * FROM plugin_schema_migrations WHERE tenant_id = ${tenantId} ORDER BY owner ASC, version::integer ASC, applied_at ASC`
          : await sql<MigrationRecord[]>`SELECT id, checksum FROM plugin_schema_migrations WHERE tenant_id = ${tenantId} AND owner = ${owner} AND version = ${version!}`;
    }
  } catch (error) {
    if (/relation .* does not exist/i.test(error instanceof Error ? error.message : String(error))) return [];
    throw error;
  }
}

async function selectLegacyLedger(
  sql: RepoSql,
  tenantId: string,
  owner?: string,
  version?: string
): Promise<MigrationRecord[]> {
  if (owner === undefined) {
    return await sql<MigrationRecord[]>`
      SELECT * FROM migrations
      WHERE tenant_id = ${tenantId}
      ORDER BY owner ASC, version::integer ASC, applied_at ASC
    `;
  }
  return sql<MigrationRecord[]>`
    SELECT id, checksum FROM migrations
    WHERE tenant_id = ${tenantId}
      AND owner = ${owner}
      AND version = ${version!}
  `;
}

async function selectAppliedForMigration(
  sql: RepoSql,
  migration: MigrationFile,
  tenantId: string
): Promise<MigrationRecord[]> {
  const domain = domainFor(migration);
  // Read-only compatibility path for databases created before domain ledgers.
  const legacy = await selectLegacyLedger(sql, tenantId, migration.owner, migration.version);
  if (legacy.length > 0) return legacy;
  return selectDomainLedger(sql, domain, tenantId, migration.owner, migration.version);
}

async function insertDomainLedger(
  sql: RepoSql,
  domain: MigrationDomain,
  tenantId: string,
  migration: MigrationFile,
  metadata: MigrationMetadata
): Promise<void> {
  const values: [string, string, string, string, string, string, string, string, string, boolean, boolean, boolean, boolean, string] = [
    randomUUID(), tenantId, migration.owner, migration.ownerType, migration.version,
    migration.name, migration.checksum, metadata.domain, metadata.provider,
    metadata.reversible, metadata.forwardOnly, metadata.destructive, metadata.requiresBackup,
    JSON.stringify(metadata.dependencies),
  ];
  if (domain === 'core_schema') {
    await sql`
      INSERT INTO core_schema_migrations
        (id, owner, owner_type, version, name, checksum, domain, provider, reversible, forward_only, destructive, requires_backup, dependencies)
      VALUES
        (${values[0]}, ${values[2]}, ${values[3]}, ${values[4]}, ${values[5]}, ${values[6]}, ${values[7]}, ${values[8]}, ${values[9]}, ${values[10]}, ${values[11]}, ${values[12]}, ${values[13]}::jsonb)
    `;
    return;
  }
  if (domain === 'tenant_data') {
    await sql`
      INSERT INTO tenant_data_migrations
        (id, tenant_id, owner, owner_type, version, name, checksum, domain, provider, reversible, forward_only, destructive, requires_backup, dependencies)
      VALUES
        (${values[0]}, ${values[1]}, ${values[2]}, ${values[3]}, ${values[4]}, ${values[5]}, ${values[6]}, ${values[7]}, ${values[8]}, ${values[9]}, ${values[10]}, ${values[11]}, ${values[12]}, ${values[13]}::jsonb)
    `;
    return;
  }
  await sql`
    INSERT INTO plugin_schema_migrations
      (id, tenant_id, owner, owner_type, version, name, checksum, domain, provider, reversible, forward_only, destructive, requires_backup, dependencies)
    VALUES
      (${values[0]}, ${values[1]}, ${values[2]}, ${values[3]}, ${values[4]}, ${values[5]}, ${values[6]}, ${values[7]}, ${values[8]}, ${values[9]}, ${values[10]}, ${values[11]}, ${values[12]}, ${values[13]}::jsonb)
  `;
}

async function deleteDomainLedger(
  sql: RepoSql,
  domain: MigrationDomain,
  tenantId: string,
  migration: MigrationFile
): Promise<void> {
  if (domain === 'core_schema') {
    await sql`DELETE FROM core_schema_migrations WHERE owner = ${migration.owner} AND version = ${migration.version}`;
    return;
  }
  const table = domain === 'tenant_data' ? 'tenant_data_migrations' : 'plugin_schema_migrations';
  await sql.unsafe(
    `DELETE FROM ${table} WHERE tenant_id = $1 AND owner = $2 AND version = $3`,
    [tenantId, migration.owner, migration.version]
  );
}

function computeChecksum(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/** Reads an optional `@okcms` header without making SQL comments executable. */
export function parseMigrationMetadata(
  sql: string,
  ownerType: 'CORE' | 'PLUGIN'
): MigrationMetadata {
  const header = sql.match(/^\s*--\s*@okcms\s+([^\n\r]*)/im)?.[1] ?? '';
  const values = new Map<string, string>();
  for (const token of header.matchAll(/([a-z_]+)=([^\s]+)/gi)) {
    values.set(token[1]!.toLowerCase(), token[2]!);
  }
  const down = sql.match(/--\s*\+migrate\s+Down([\s\S]*)/i)?.[1]?.trim() ?? '';
  const reversible = values.get('reversible') === undefined ? down.length > 0 : values.get('reversible') === 'true';
  const destructive = values.get('destructive') === 'true' || /\b(DROP|TRUNCATE|DELETE|ALTER\s+TABLE[\s\S]*\bDROP)\b/i.test(sql);
  const dependencies = (values.get('depends_on') ?? values.get('dependencies') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return {
    domain: (values.get('domain') as MigrationMetadata['domain'] | undefined)
      ?? (ownerType === 'PLUGIN' ? 'plugin_schema' : 'core_schema'),
    provider: values.get('provider') ?? 'postgres',
    reversible,
    forwardOnly: !reversible,
    destructive,
    requiresBackup: values.get('requires_backup') === 'true' || destructive || !reversible,
    dependencies,
    conflictPolicy: (values.get('conflict_policy') as MigrationMetadata['conflictPolicy']) ?? 'report',
    maxAffectedRows: values.get('max_affected_rows') ? Number(values.get('max_affected_rows')) : undefined,
  };
}

function parseMigrationName(filename: string): { version: string; name: string; owner: string; ownerType: 'CORE' | 'PLUGIN' } {
  // Format: V001__core__create_users.sql or V001__plugin_seo__create_tables.sql
  const match = filename.match(/^V(\d{3,})__([A-Za-z0-9_-]+)__([A-Za-z0-9][A-Za-z0-9_-]*)\.sql$/);
  if (!match) {
    throw new Error(`Invalid migration filename: ${filename}`);
  }
  const [, version, owner, name] = match;
  const ownerType = owner === 'core' ? 'CORE' : 'PLUGIN';
  return { version: version!, owner: owner!, name: name!, ownerType };
}

export function loadMigrationsFromDir(dir: string): MigrationFile[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch (error) {
    // Projeto sem diretório `migrations/` (init cria vazio; quem montou na
    // mão pode nem ter) = nenhum arquivo, não é erro — o schema core não vem
    // daqui: ele sincroniza via schema.sql no prepareDb (ensureCoreSchema).
    // Um --dir com typo também cai aqui e o aviso do db:migrate mostra o path.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const files = entries.filter(f => f.endsWith('.sql'));
  const migrations = files.map(file => {
    const filePath = join(dir, file);
    const sql = readFileSync(filePath, 'utf-8');
    const { version, name, owner, ownerType } = parseMigrationName(file);
    return {
      name,
      version,
      owner,
      ownerType,
      sql,
      checksum: computeChecksum(sql),
      metadata: parseMigrationMetadata(sql, ownerType),
    };
  });
  migrations.sort((a, b) => {
    const version = Number(a.version) - Number(b.version);
    if (version !== 0) return version;
    const owner = a.owner.localeCompare(b.owner);
    if (owner !== 0) return owner;
    return a.name.localeCompare(b.name);
  });

  const identities = new Set<string>();
  for (const migration of migrations) {
    const identity = `${migration.owner}:${migration.version}`;
    if (identities.has(identity)) {
      throw new Error(`Duplicate migration identity: ${identity}`);
    }
    identities.add(identity);
  }
  return migrations;
}

export interface MigrationManifest {
  version: 1;
  provider: string;
  entries: Array<{
    id: string;
    file: string;
    owner: string;
    version: string;
    name: string;
    checksum: string;
    metadata: MigrationMetadata;
  }>;
}

/** Validates dependencies and returns a deterministic, machine-readable plan. */
export function buildMigrationManifest(migrations: MigrationFile[], provider = 'postgres'): MigrationManifest {
  const entries = migrations.map((migration) => ({
    id: `${migration.owner}:${migration.version}`,
    file: `V${migration.version}__${migration.owner}__${migration.name}.sql`,
    owner: migration.owner,
    version: migration.version,
    name: migration.name,
    checksum: migration.checksum,
    metadata: migration.metadata ?? parseMigrationMetadata(migration.sql, migration.ownerType),
  }));
  const ids = new Set(entries.map((entry) => entry.id));
  const errors: string[] = [];
  for (const entry of entries) {
    for (const dependency of entry.metadata.dependencies) {
      if (!ids.has(dependency)) errors.push(`${entry.id} depends on missing migration ${dependency}`);
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const visit = (id: string): void => {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      errors.push(`Migration dependency cycle detected at ${id}`);
      return;
    }
    visiting.add(id);
    for (const dependency of byId.get(id)?.metadata.dependencies ?? []) {
      if (byId.has(dependency)) visit(dependency);
    }
    visiting.delete(id);
    visited.add(id);
  };
  for (const entry of entries) visit(entry.id);
  if (errors.length > 0) throw new Error(errors.join('; '));
  return { version: 1, provider, entries };
}

export async function getAppliedMigrations(tenantId: string, connection: RepoSql = getConnection()): Promise<MigrationRecord[]> {
  const sql = connection;
  const records = [
    ...(await selectDomainLedger(sql, 'core_schema', tenantId)),
    ...(await selectDomainLedger(sql, 'tenant_data', tenantId)),
    ...(await selectDomainLedger(sql, 'plugin_schema', tenantId)),
    ...(await selectLegacyLedger(sql, tenantId)),
  ];
  const unique = new Map<string, MigrationRecord>();
  for (const record of records) unique.set(`${record.owner}:${record.version}`, record);
  return [...unique.values()].sort((a, b) => {
    const version = Number(a.version) - Number(b.version);
    return version !== 0 ? version : a.owner.localeCompare(b.owner);
  });
}

/**
 * Extrai a seção que a aplicação deve executar: o conteúdo entre
 * `-- +migrate Up` e `-- +migrate Down` (marcadores ausentes = SQL cru).
 * Sem esse recorte, `applyMigration` executaria o bloco Down logo após o Up —
 * desfazendo a própria migration no mesmo commit.
 */
export function extractUpSection(sql: string): string {
  const downMarker = '-- +migrate Down';
  const downIndex = sql.indexOf(downMarker);
  let body = downIndex === -1 ? sql : sql.slice(0, downIndex);

  const upMarker = '-- +migrate Up';
  const upIndex = body.indexOf(upMarker);
  if (upIndex !== -1) {
    body = body.slice(upIndex + upMarker.length);
  }
  return body;
}

export async function applyMigration(
  tenantId: string,
  migration: MigrationFile,
  options: ApplyMigrationOptions = {}
): Promise<boolean> {
  const sql = options.connection ?? getConnection();
  const metadata = migration.metadata ?? parseMigrationMetadata(migration.sql, migration.ownerType);
  let applied = false;

  const existingBeforeTransaction = await selectAppliedForMigration(sql, migration, tenantId);
  if (existingBeforeTransaction.length > 0) {
    if (existingBeforeTransaction[0]!.checksum !== migration.checksum) {
      throw new Error(
        `Migration checksum drift: ${migration.owner}:${migration.version} ` +
        `(stored ${existingBeforeTransaction[0]!.checksum}, current ${migration.checksum})`
      );
    }
    return false;
  }

  await sql.begin(async (tx) => {
    // Serialize the check and SQL execution so concurrent runners cannot both
    // execute a pending migration before the unique ledger insert.
    await tx`SELECT pg_advisory_xact_lock(hashtext(${'okcms:migration:' + migration.owner + ':' + migration.version}))`;

    const existing = await selectAppliedForMigration(tx, migration, tenantId);

    if (existing.length > 0) {
      if (existing[0]!.checksum !== migration.checksum) {
        throw new Error(
          `Migration checksum drift: ${migration.owner}:${migration.version} ` +
          `(stored ${existing[0]!.checksum}, current ${migration.checksum})`
        );
      }
      return;
    }

    // Transaction-local tenant context must not leak through a pooled client.
    await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;

    if (options.schemaName) {
      await tx`CREATE SCHEMA IF NOT EXISTS ${sqlId(options.schemaName)}`;
      await tx`GRANT USAGE ON SCHEMA ${sqlId(options.schemaName)} TO CURRENT_ROLE`;
      await tx`SET LOCAL search_path = ${sqlId(options.schemaName)}, public`;
    }

    await tx.unsafe(extractUpSection(migration.sql));

    await insertDomainLedger(tx, metadata.domain, tenantId, migration, metadata);
    applied = true;
  });
  return applied;
}

export async function rollbackMigration(
  tenantId: string,
  migration: MigrationFile,
  options: RollbackMigrationOptions = {}
): Promise<void> {
  const sql = getConnection();

  // Check if applied
  const existing = await selectAppliedForMigration(sql, migration, tenantId);

  if (existing.length === 0) {
    return; // Not applied
  }

  // Extract the Down section (convention: -- +migrate Up / -- +migrate Down)
  const downMarker = '-- +migrate Down';
  if (!migration.sql.includes(downMarker)) {
    throw new Error(`No rollback defined for migration: ${migration.name}`);
  }
  const downSql = migration.sql
    .slice(migration.sql.indexOf(downMarker) + downMarker.length)
    .trim();
  if (!downSql) {
    throw new Error(`Empty rollback section for migration: ${migration.name}`);
  }

  // Execute rollback in transaction
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${'okcms:migration:' + migration.owner + ':' + migration.version}))`;
    const applied = await selectAppliedForMigration(tx, migration, tenantId);
    if (applied.length === 0) return;

    await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
    const schemaName = options.schemaName ?? (
      migration.ownerType === 'PLUGIN'
        ? `plugin_${migration.owner.replace(/^plugin_/, '')}`
        : undefined
    );
    if (schemaName) {
      await tx`SET LOCAL search_path = ${sqlId(schemaName)}, public`;
    }
    await tx.unsafe(downSql);

    const domain = domainFor(migration);
    await deleteDomainLedger(tx, domain, tenantId, migration);
    // Legacy rows are removed only after a successful Down, preserving the
    // old ledger contract for installations that have not adopted domains.
    await tx`DELETE FROM migrations WHERE tenant_id = ${tenantId} AND owner = ${migration.owner} AND version = ${migration.version}`;
  });
}

export async function runMigrations(
  tenantId: string,
  migrationsDir: string,
  options: MigrationRunOptions = {}
): Promise<{ applied: string[]; skipped: string[]; preflight?: MigrationPreflightReport[] }> {
  const provider = options.provider ?? process.env['DB_ENGINE'] ?? 'postgres';
  if (!['postgres', 'mysql', 'mariadb'].includes(provider)) {
    throw new Error(
      `Database provider "${provider}" is not supported by the migration runner.`
    );
  }
  const baseConnection = getConnection();
  const reserved = typeof (baseConnection as RepoSql & { reserve?: unknown }).reserve === 'function'
    ? await baseConnection.reserve?.()
    : null;
  const connection = reserved ?? baseConnection;
  const release = (): void => {
    (reserved as RepoSql & { release?: () => void } | null)?.release?.();
  };

  try {
    if ((baseConnection as { driver?: string }).driver) {
      await (await import('../connection.js')).assertSupportedServerVersion();
    }
    // Keep a stable session-level lock from inventory discovery through the
    // final migration transaction. The fallback still has per-migration
    // transaction locks for test doubles and non-reservable adapters.
    if (reserved) {
      await connection`SELECT pg_advisory_lock(hashtext('okcms:migration:plan:core'))`;
    }
    const providerDir = join(migrationsDir, provider);
    const activeMigrationsDir = existsSync(providerDir) ? providerDir : migrationsDir;
    const migrations = loadMigrationsFromDir(activeMigrationsDir);
    const manifest = buildMigrationManifest(migrations, provider);
    const incompatible = manifest.entries.find((entry) => entry.metadata.provider !== provider);
    if (incompatible) {
      throw new Error(
        `Migration ${incompatible.id} requires provider "${incompatible.metadata.provider}"; active provider is "${provider}".`
      );
    }
    const schemaBaseline = await readSchemaBaseline(connection);
    if (schemaBaseline === 'legacy-pending' && options.adoptLegacy !== true) {
      throw new Error(
        'This database predates the canonical schema baseline. Create a backup and rerun db:migrate with --adopt-legacy after reviewing the migration inventory.'
      );
    }
    const baselineVersion = Number(schemaBaseline?.match(/^V?(\d+)$/i)?.[1] ?? 0);
    const applied = await getAppliedMigrations(tenantId, connection);
    const appliedVersions = new Map(applied.map(m => [`${m.owner}:${m.version}`, m]));

    const result: { applied: string[]; skipped: string[] } = {
      applied: [],
      skipped: [],
    };
    const preflightReports: MigrationPreflightReport[] = [];

    // Apply migrations in order
    for (const migration of migrations) {
      const key = `${migration.owner}:${migration.version}`;
      const existing = appliedVersions.get(key);
      if (existing && existing.checksum !== migration.checksum) {
        throw new Error(
          `Migration checksum drift: ${key} (stored ${existing.checksum}, current ${migration.checksum})`
        );
      }
      if (domainFor(migration) === 'core_schema' && Number(migration.version) <= baselineVersion) {
        result.skipped.push(migration.name);
        continue;
      }
      if (existing) {
        result.skipped.push(migration.name);
        continue;
      }

      try {
        if (migration.metadata?.destructive || migration.metadata?.requiresBackup || migration.metadata?.conflictPolicy === 'block' || migration.metadata?.maxAffectedRows !== undefined) {
          const report = await preflightMigration(migration, connection);
          preflightReports.push(report);
          if (report.blocked) {
            throw new Error(`Migration preflight blocked ${key}: ${report.conflicts.filter((item) => item.count > 0).map((item) => item.message).join('; ')}`);
          }
        }
        const didApply = await applyMigration(tenantId, migration, { connection });
        if (didApply) result.applied.push(migration.name);
        else result.skipped.push(migration.name);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Migration failed: ${migration.name} - ${message}`);
      }
    }
    if (options.adoptLegacy === true && schemaBaseline === 'legacy-pending') {
      const latestCore = migrations
        .filter((migration) => domainFor(migration) === 'core_schema')
        .reduce((latest, migration) => Math.max(latest, Number(migration.version)), 0);
      if (latestCore > 0) {
        const adoptedVersion = `V${String(latestCore).padStart(3, '0')}`;
        try {
          await connection`
            UPDATE schema_bootstrap
            SET schema_version = ${adoptedVersion}, applied_at = NOW()
            WHERE id = 1
          `;
        } catch (error) {
          if (!/relation .* does not exist/i.test(error instanceof Error ? error.message : String(error))) throw error;
        }
      }
    }
    // After applying core_schema migrations, advance schema_bootstrap.schema_version
    // to reflect the highest core version now present. This keeps the baseline in sync
    // for databases that started below the current snapshot (e.g. V018 → V025 via
    // numbered migrations) without relying on the adoptLegacy path.
    if (result.applied.length > 0) {
      const latestAppliedCore = migrations
        .filter((m) => result.applied.includes(m.name) && domainFor(m) === 'core_schema')
        .reduce((latest, m) => Math.max(latest, Number(m.version)), 0);
      if (latestAppliedCore > baselineVersion) {
        const newVersion = `V${String(latestAppliedCore).padStart(3, '0')}`;
        try {
          await connection`
            UPDATE schema_bootstrap
            SET schema_version = ${newVersion}, applied_at = NOW()
            WHERE id = 1
          `;
        } catch (error) {
          if (!/relation .* does not exist/i.test(error instanceof Error ? error.message : String(error))) throw error;
        }
      }
    }
    return preflightReports.length > 0 ? { ...result, preflight: preflightReports } : result;
  } finally {
    if (reserved) {
      try {
        await connection`SELECT pg_advisory_unlock(hashtext('okcms:migration:plan:core'))`;
      } finally {
        release();
      }
    }
  }
}

/**
 * Aplica todas as migrations de um plugin em ordem de versão (idempotente).
 * Usado no install/upgrade do plugin; cada migration roda em transação própria.
 * 
 * WP8: cria schema `plugin_<name>` e aplica RLS automático nas tabelas criadas.
 */
export async function runPluginMigrations(
  tenantId: string,
  owner: string,
  files: Array<Pick<MigrationFile, 'version' | 'name' | 'sql'>>
): Promise<number> {
  // Deriva o nome do plugin do owner (ex.: "plugin_seo" → "seo")
  const pluginName = owner.startsWith('plugin_') ? owner.slice(7) : owner;
  const schemaName = `plugin_${pluginName}`;

  let applied = 0;
  const sorted = [...files].sort((a, b) => Number(a.version) - Number(b.version));
  
  for (const file of sorted) {
    const didApply = await applyMigration(tenantId, {
      ...file,
      owner,
      ownerType: 'PLUGIN',
      checksum: computeChecksum(file.sql),
    }, { schemaName });
    if (didApply) applied++;
  }
  return applied;
}

/**
 * Reverte (remove o registro de) todas as migrations aplicadas por um owner.
 * database-migrations-004: rollback de deployment reverte migrations de plugin
 * na ordem inversa. O SQL de down não existe — a reversão remove os objetos
 * registrados pelo owner quando o próprio plugin define DROPs em `downSql`.
 */
export async function rollbackPluginMigrations(
  tenantId: string,
  owner: string,
  downSql?: string
): Promise<number> {
  const sql = getConnection();
  const [domainApplied, legacyApplied] = await Promise.all([
    selectDomainLedger(sql, 'plugin_schema', tenantId, owner),
    sql<MigrationRecord[]>`
      SELECT * FROM migrations
      WHERE tenant_id = ${tenantId} AND owner = ${owner}
      ORDER BY version DESC
    `,
  ]);
  const applied = [...domainApplied, ...legacyApplied].sort((a, b) => Number(b.version) - Number(a.version));
  if (applied.length === 0) return 0;

  if (!downSql?.trim()) {
    throw new Error(
      `Cannot rollback plugin ${owner}: no Down SQL was supplied; migration records were preserved.`
    );
  }

  const pluginName = owner.startsWith('plugin_') ? owner.slice(7) : owner;
  const schemaName = `plugin_${pluginName}`;
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${'okcms:migration:rollback:' + owner}))`;
    await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
    const safeSchemaName = schemaName.replace(/[^a-zA-Z0-9_]/g, '');
    await tx.unsafe(`SET LOCAL search_path = ${safeSchemaName}, public`);
    await tx.unsafe(downSql);
    await tx`
      DELETE FROM plugin_schema_migrations
      WHERE tenant_id = ${tenantId} AND owner = ${owner}
    `;
    await tx`
      DELETE FROM migrations
      WHERE tenant_id = ${tenantId} AND owner = ${owner}
    `;
  });
  return applied.length;
}
