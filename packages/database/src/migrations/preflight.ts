import type { RepoSql } from '../connection.js';
import type { MigrationFile, MigrationMetadata } from './runner.js';

export type MigrationConflictKind = 'duplicate_data' | 'uniqueness' | 'json_content' | 'affected_rows';

export interface MigrationConflict {
  kind: MigrationConflictKind;
  table: string;
  count: number;
  policy: 'report' | 'block' | 'dedupe_keep_oldest';
  message: string;
}

export interface MigrationPreflightReport {
  migration: string;
  provider: string;
  conflicts: MigrationConflict[];
  blocked: boolean;
  requiresBackup: boolean;
}

function numberFromRow(row: Record<string, unknown> | undefined): number {
  return Number(row?.['count'] ?? row?.['conflicts'] ?? row?.['affected'] ?? 0);
}

function metadataPolicy(metadata: MigrationMetadata): MigrationConflict['policy'] {
  const policy = (metadata as MigrationMetadata & { conflictPolicy?: string }).conflictPolicy;
  return policy === 'block' || policy === 'dedupe_keep_oldest' ? policy : 'report';
}

async function count(sql: RepoSql, query: string): Promise<number> {
  const rows = await sql.unsafe<Record<string, unknown>[]>(query);
  return numberFromRow(rows[0]);
}

/**
 * Runs deterministic, read-only checks before data-changing migrations. The
 * checks intentionally report facts; deletion or conflict resolution stays in
 * the migration's reviewed SQL and never happens implicitly in the runner.
 */
export async function preflightMigration(
  migration: MigrationFile,
  sql: RepoSql,
  options: { maxAffectedRows?: number } = {}
): Promise<MigrationPreflightReport> {
  const metadata = migration.metadata!;
  const source = migration.sql;
  const policy = metadataPolicy(metadata);
  const conflicts: MigrationConflict[] = [];

  if (/content[\s\S]*UNIQUE|UNIQUE[\s\S]*content/i.test(source)) {
    const conflictsCount = await count(sql, `SELECT COUNT(*) AS conflicts FROM (SELECT tenant_id, type, slug FROM content GROUP BY tenant_id, type, slug HAVING COUNT(*) > 1) duplicates`);
    conflicts.push({ kind: 'uniqueness', table: 'content', count: conflictsCount, policy, message: `${conflictsCount} content rows conflict with tenant/type/slug uniqueness` });
  }
  if (/menus[\s\S]*UNIQUE|UNIQUE[\s\S]*menus/i.test(source)) {
    const conflictsCount = await count(sql, `SELECT COUNT(*) AS conflicts FROM (SELECT tenant_id, slug FROM menus GROUP BY tenant_id, slug HAVING COUNT(*) > 1) duplicates`);
    conflicts.push({ kind: 'uniqueness', table: 'menus', count: conflictsCount, policy, message: `${conflictsCount} menu rows conflict with tenant/slug uniqueness` });
  }
  if (/DELETE\s+FROM\s+(content|menus)[\s\S]*GROUP BY|ctid|duplicate/i.test(source)) {
    const table = /DELETE\s+FROM\s+(content|menus)/i.exec(source)?.[1] ?? 'unknown';
    const conflictsCount = conflicts.find((item) => item.table === table)?.count ?? 0;
    conflicts.push({ kind: 'duplicate_data', table, count: conflictsCount, policy: policy === 'report' ? 'block' : policy, message: `${conflictsCount} duplicate rows require an explicit conflict policy` });
  }
  if (/jsonb|JSON|content\.(?:body|data)|field_values/i.test(source)) {
    const table = /field_values/i.test(source) ? 'field_values' : 'content';
    const affected = await count(sql, `SELECT COUNT(*) AS affected FROM ${table}`);
    conflicts.push({ kind: 'json_content', table, count: affected, policy, message: `${affected} rows are in the JSON/content conversion scope` });
  }

  // Match UPDATE <table> and DELETE FROM <table> but not ON CONFLICT ... DO UPDATE SET
  const affectedTables = [...source.matchAll(/\b(?:UPDATE|DELETE\s+FROM)\s+([a-z_][a-z0-9_]*)/gi)]
    .filter((match) => match[1]?.toLowerCase() !== 'set')
    .map((match) => match[1]!);
  const uniqueTables = [...new Set(affectedTables)];
  for (const table of uniqueTables) {
    const affected = await count(sql, `SELECT COUNT(*) AS affected FROM ${table}`);
    const threshold = options.maxAffectedRows ?? (metadata as MigrationMetadata & { maxAffectedRows?: number }).maxAffectedRows;
    conflicts.push({ kind: 'affected_rows', table, count: affected, policy, message: `${affected} rows may be affected in ${table}${threshold === undefined ? '' : ` (threshold ${threshold})`}` });
  }

  const threshold = options.maxAffectedRows ?? (metadata as MigrationMetadata & { maxAffectedRows?: number }).maxAffectedRows;
  const blocked = conflicts.some((item) => item.policy === 'block' && item.count > 0)
    || (threshold !== undefined && conflicts.some((item) => item.kind === 'affected_rows' && item.count > threshold));
  return {
    migration: `${migration.owner}:${migration.version}`,
    provider: metadata.provider,
    conflicts,
    blocked,
    requiresBackup: metadata.requiresBackup || conflicts.some((item) => item.count > 0),
  };
}
