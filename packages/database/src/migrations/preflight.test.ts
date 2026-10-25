import { describe, expect, it, vi } from 'vitest';
import { preflightMigration } from './preflight.js';
import type { RepoSql } from '../connection.js';
import type { MigrationFile } from './runner.js';

const migration: MigrationFile = {
  name: 'unique_content',
  version: '019',
  owner: 'core',
  ownerType: 'CORE',
  sql: '-- @okcms domain=core_schema provider=postgres conflict_policy=block max_affected_rows=10\nDELETE FROM content a WHERE a.ctid <> (SELECT min(b.ctid) FROM content b);\nALTER TABLE content ADD CONSTRAINT unique_content UNIQUE (tenant_id, type, slug);',
  checksum: 'fixture',
  metadata: {
    domain: 'core_schema', provider: 'postgres', reversible: true, forwardOnly: false,
    destructive: true, requiresBackup: true, dependencies: [], conflictPolicy: 'block', maxAffectedRows: 10,
  },
};

describe('migration preflight', () => {
  it('reports duplicate and affected-row conflicts and blocks above policy', async () => {
    const sql = { unsafe: vi.fn(async (query: string) => query.includes('GROUP BY') ? [{ conflicts: 2 }] : [{ affected: 11 }]) } as unknown as RepoSql;
    const report = await preflightMigration(migration, sql);
    expect(report.blocked).toBe(true);
    expect(report.conflicts.map((item) => item.kind)).toEqual(expect.arrayContaining(['uniqueness', 'duplicate_data', 'affected_rows']));
    expect(sql.unsafe).toHaveBeenCalled();
  });

  it('does not block a clean report', async () => {
    const sql = { unsafe: vi.fn(async () => [{ conflicts: 0, affected: 0 }]) } as unknown as RepoSql;
    const report = await preflightMigration(migration, sql);
    expect(report.blocked).toBe(false);
    expect(report.requiresBackup).toBe(true);
  });
});
