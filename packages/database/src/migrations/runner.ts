// @oktis-works/database - Migration Runner

import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { getConnection } from '../connection.js';

export interface MigrationFile {
  name: string;
  version: string;
  owner: string;
  ownerType: 'CORE' | 'PLUGIN';
  sql: string;
  checksum: string;
}

export interface MigrationRecord {
  id: string;
  tenant_id: string;
  owner: string;
  owner_type: string;
  version: string;
  name: string;
  applied_at: Date;
  checksum: string;
}

function computeChecksum(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function parseMigrationName(filename: string): { version: string; name: string; owner: string; ownerType: 'CORE' | 'PLUGIN' } {
  // Format: V001__core__create_users.sql or V001__plugin_seo__create_tables.sql
  const match = filename.match(/^V(\d+)__(\w+)__(.+)\.sql$/);
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
  const files = entries.filter(f => f.endsWith('.sql')).sort();
  return files.map(file => {
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
    };
  });
}

export async function getAppliedMigrations(tenantId: string): Promise<MigrationRecord[]> {
  const sql = getConnection();
  return sql<MigrationRecord[]>`
    SELECT * FROM migrations
    WHERE tenant_id = ${tenantId}
    ORDER BY version ASC
  `;
}

export async function applyMigration(
  tenantId: string,
  migration: MigrationFile
): Promise<void> {
  const sql = getConnection();

  // Check if already applied
  const existing = await sql<MigrationRecord[]>`
    SELECT id FROM migrations
    WHERE tenant_id = ${tenantId}
      AND owner = ${migration.owner}
      AND version = ${migration.version}
  `;

  if (existing.length > 0) {
    return; // Already applied
  }

  // Execute migration in transaction
  await sql.begin(async (tx) => {
    // Set tenant context for RLS
    await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, false)`;

    // Execute the migration SQL
    await tx.unsafe(migration.sql);

    // Record the migration
    await tx`
      INSERT INTO migrations (id, tenant_id, owner, owner_type, version, name, checksum)
      VALUES (${randomUUID()}, ${tenantId}, ${migration.owner}, ${migration.ownerType}, ${migration.version}, ${migration.name}, ${migration.checksum})
    `;
  });
}

export async function rollbackMigration(
  tenantId: string,
  migration: MigrationFile
): Promise<void> {
  const sql = getConnection();

  // Check if applied
  const existing = await sql<MigrationRecord[]>`
    SELECT id FROM migrations
    WHERE tenant_id = ${tenantId}
      AND owner = ${migration.owner}
      AND version = ${migration.version}
  `;

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
    await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, false)`;
    await tx.unsafe(downSql);

    await tx`
      DELETE FROM migrations
      WHERE tenant_id = ${tenantId}
        AND owner = ${migration.owner}
        AND version = ${migration.version}
    `;
  });
}

export async function runMigrations(
  tenantId: string,
  migrationsDir: string
): Promise<{ applied: string[]; skipped: string[] }> {
  const migrations = loadMigrationsFromDir(migrationsDir);
  const applied = await getAppliedMigrations(tenantId);
  const appliedVersions = new Set(applied.map(m => `${m.owner}:${m.version}`));

  const result: { applied: string[]; skipped: string[] } = {
    applied: [],
    skipped: [],
  };

  // Check for dependency conflicts
  const ownerVersions = new Map<string, string[]>();
  for (const migration of migrations) {
    const versions = ownerVersions.get(migration.owner) ?? [];
    versions.push(migration.version);
    ownerVersions.set(migration.owner, versions);
  }

  // Apply migrations in order
  for (const migration of migrations) {
    const key = `${migration.owner}:${migration.version}`;
    if (appliedVersions.has(key)) {
      result.skipped.push(migration.name);
      continue;
    }

    try {
      await applyMigration(tenantId, migration);
      result.applied.push(migration.name);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Migration failed: ${migration.name} - ${message}`);
    }
  }

  return result;
}

/**
 * Aplica todas as migrations de um plugin em ordem de versão (idempotente).
 * Usado no install/upgrade do plugin; cada migration roda em transação própria.
 */
export async function runPluginMigrations(
  tenantId: string,
  owner: string,
  files: Array<Pick<MigrationFile, 'version' | 'name' | 'sql'>>
): Promise<number> {
  let applied = 0;
  const sorted = [...files].sort((a, b) => a.version.localeCompare(b.version));
  for (const file of sorted) {
    const before = await getAppliedMigrations(tenantId);
    await applyMigration(tenantId, {
      ...file,
      owner,
      ownerType: 'PLUGIN',
      checksum: computeChecksum(file.sql),
    });
    const after = await getAppliedMigrations(tenantId);
    if (after.length > before.length) applied++;
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
  const applied = await sql<MigrationRecord[]>`
    SELECT * FROM migrations
    WHERE tenant_id = ${tenantId} AND owner = ${owner}
    ORDER BY version DESC
  `;
  if (applied.length === 0) return 0;

  if (downSql) {
    await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, false)`;
      await tx.unsafe(downSql);
    });
  }

  await sql`
    DELETE FROM migrations
    WHERE tenant_id = ${tenantId} AND owner = ${owner}
  `;
  return applied.length;
}
