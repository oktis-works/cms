// @oktis-works/database - Migration Runner Tests (REQ-database-migrations)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

type TaggedCall = { kind: 'tagged'; text: string; values: unknown[] };
type UnsafeCall = { kind: 'unsafe'; query: string };
type Call = TaggedCall | UnsafeCall;

let calls: Call[];
let selectResults: Record<string, unknown[]>;
let unsafeError: Error | null;
let client: ReturnType<typeof makeClient>;

function makeClient() {
  const respond = (text: string): unknown[] => {
    for (const [needle, rows] of Object.entries(selectResults).sort(([a], [b]) => b.length - a.length)) {
      if (text.includes(needle)) return rows;
    }
    return [];
  };
  const tag = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join('?');
    calls.push({ kind: 'tagged', text, values });
    return Promise.resolve(respond(text));
  };
  const c = Object.assign(tag, {
    unsafe: vi.fn(async (query: string) => {
      calls.push({ kind: 'unsafe', query });
      if (unsafeError) throw unsafeError;
      return respond(query);
    }),
    begin: vi.fn(async (fn: (tx: typeof c) => Promise<void>) => {
      calls.push({ kind: 'tagged', text: '__BEGIN__', values: [] });
      await fn(c);
    }),
  });
  return c;
}

vi.mock('../connection.js', () => ({
  getConnection: vi.fn(),
  sqlId: (name: string) => name,
}));

import { getConnection } from '../connection.js';
import {
  loadMigrationsFromDir,
  applyMigration,
  rollbackMigration,
  rollbackPluginMigrations,
  runPluginMigrations,
  runMigrations,
  extractUpSection,
  buildMigrationManifest,
  parseMigrationMetadata,
  type MigrationFile,
} from './runner.js';

beforeEach(() => {
  calls = [];
  selectResults = {};
  unsafeError = null;
  client = makeClient();
  (getConnection as unknown as ReturnType<typeof vi.fn>).mockReturnValue(client);
});

const sha256 = (content: string) => createHash('sha256').update(content).digest('hex');

function withMigrations(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'bl-migrations-'));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content, 'utf-8');
  }
  return dir;
}

describe('loadMigrationsFromDir', () => {
  it('carrega migrations .sql ordenadas com version/owner/checksum', () => {
    const dir = withMigrations({
      'V002__core__add_index.sql': 'CREATE INDEX idx ON t(a);',
      'V001__core__create_users.sql': 'CREATE TABLE users (id uuid);',
      'V003__plugin_seo__meta_tables.sql': 'CREATE TABLE seo_meta (id uuid);',
      'README.md': 'ignored',
    });

    const migrations = loadMigrationsFromDir(dir);

    expect(migrations.map((m) => m.version)).toEqual(['001', '002', '003']);
    expect(migrations[0]!.ownerType).toBe('CORE');
    expect(migrations[2]!.owner).toBe('plugin_seo');
    expect(migrations[2]!.ownerType).toBe('PLUGIN');
    expect(migrations[0]!.checksum).toBe(sha256('CREATE TABLE users (id uuid);'));
    rmSync(dir, { recursive: true, force: true });
  });

  it('rejeita filename fora do padrão V###__owner__name.sql', () => {
    const dir = withMigrations({ 'migrate-up.sql': 'SELECT 1;' });
    expect(() => loadMigrationsFromDir(dir)).toThrow(/Invalid migration filename/);
    rmSync(dir, { recursive: true, force: true });
  });

  it('diretório inexistente → lista vazia (projeto sem migrations/, não é erro)', () => {
    const missing = join(tmpdir(), `bl-migrations-missing-${Date.now()}`);
    expect(loadMigrationsFromDir(missing)).toEqual([]);
  });

  it('derives safe metadata and validates dependency references', () => {
    const sql = '-- @okcms domain=tenant_data depends_on=core:999\n-- +migrate Up\nCREATE TABLE t (id uuid);\n-- +migrate Down\nDROP TABLE t;';
    const metadata = parseMigrationMetadata(sql, 'CORE');
    expect(metadata).toMatchObject({
      domain: 'tenant_data',
      provider: 'postgres',
      reversible: true,
      forwardOnly: false,
      destructive: true,
      requiresBackup: true,
      dependencies: ['core:999'],
    });
    expect(() => buildMigrationManifest([{
      name: 'x', version: '001', owner: 'core', ownerType: 'CORE', sql, checksum: sha256(sql), metadata,
    }])).toThrow(/depends on missing migration/);
  });
});

describe('applyMigration', () => {
  const migration: MigrationFile = {
    name: 'create_users',
    version: '001',
    owner: 'core',
    ownerType: 'CORE',
    sql: 'CREATE TABLE users (id uuid);',
    checksum: sha256('CREATE TABLE users (id uuid);'),
  };

  it('pula migration já aplicada (idempotência)', async () => {
    selectResults['SELECT id, checksum FROM migrations'] = [{ id: 'existing', checksum: migration.checksum }];

    await applyMigration('tenant-1', migration);

    expect(calls.some((c) => 'text' in c && c.text.includes('__BEGIN__'))).toBe(false);
    expect(calls.some((c) => c.kind === 'unsafe')).toBe(false);
  });

  it('executa em transação com tenant context e registra checksum/owner_type', async () => {
    await applyMigration('tenant-1', migration);

    const texts = calls.filter((c): c is TaggedCall => c.kind === 'tagged').map((c) => c.text);
    expect(texts[0]).toContain('SELECT id, checksum FROM migrations');
    expect(texts).toContain('__BEGIN__');
    expect(texts.some((t) => t.includes("set_config('app.current_tenant_id'"))).toBe(true);

    const insert = calls.find(
      (c): c is TaggedCall => c.kind === 'tagged' && c.text.includes('INSERT INTO core_schema_migrations')
    );
    expect(insert!.values).toContain(migration.owner);
    expect(insert!.values).toContain(migration.checksum);
    expect(insert!.values).toContain('CORE');

    const unsafe = calls.find((c): c is UnsafeCall => c.kind === 'unsafe');
    expect(unsafe!.query).toBe(migration.sql);
  });

  it('executa APENAS a seção Up — o Down nunca roda na aplicação', async () => {
    const withDown: MigrationFile = {
      name: 'harden_themes',
      version: '010',
      owner: 'core',
      ownerType: 'CORE',
      sql: '-- +migrate Up\nALTER TABLE themes ADD COLUMN updated_at timestamptz;\n-- +migrate Down\nALTER TABLE themes DROP COLUMN updated_at;',
      checksum: 'c',
    };

    await applyMigration('tenant-1', withDown);

    const unsafe = calls.find((c): c is UnsafeCall => c.kind === 'unsafe');
    expect(unsafe!.query).toContain('ALTER TABLE themes ADD COLUMN updated_at');
    expect(unsafe!.query).not.toContain('DROP COLUMN updated_at');
    expect(unsafe!.query).not.toContain('-- +migrate Down');
  });
});

describe('extractUpSection', () => {
  it('recorta entre os marcadores Up e Down', () => {
    expect(extractUpSection('-- +migrate Up\nCREATE TABLE x();\n-- +migrate Down\nDROP TABLE x();')).toContain(
      'CREATE TABLE x();'
    );
    const section = extractUpSection('-- +migrate Up\nCREATE TABLE x();\n-- +migrate Down\nDROP TABLE x();');
    expect(section).not.toContain('DROP TABLE x();');
  });

  it('sem marcadores devolve o SQL cru (migrations legadas)', () => {
    expect(extractUpSection('CREATE TABLE a();')).toBe('CREATE TABLE a();');
  });

  it('só o marcador Up sem Down devolve o corpo do Up', () => {
    expect(extractUpSection('-- +migrate Up\nCREATE TABLE x();').trim()).toBe('CREATE TABLE x();');
  });
});

describe('runMigrations', () => {
  it('rejects unsupported providers before loading or mutating migrations', async () => {
    const dir = withMigrations({ 'V001__core__a.sql': 'CREATE TABLE a();' });

    await expect(runMigrations('tenant-1', dir, { provider: 'sqlite' })).rejects.toThrow(/not supported/);
    expect(calls).toEqual([]);
    rmSync(dir, { recursive: true, force: true });
  });

  it('rejects a migration whose declared provider differs before ledger access', async () => {
    const dir = withMigrations({
      'V001__core__mysql_only.sql': '-- @okcms provider=mysql\nCREATE TABLE a();',
    });
    await expect(runMigrations('tenant-1', dir, { provider: 'postgres' })).rejects.toThrow(/requires provider "mysql"/);
    expect(calls).toEqual([]);
    rmSync(dir, { recursive: true, force: true });
  });

  it('aplica pendentes e pula já aplicadas', async () => {
    const dir = withMigrations({
      'V001__core__a.sql': 'CREATE TABLE a();',
      'V002__core__b.sql': 'CREATE TABLE b();',
    });
    selectResults['FROM migrations'] = [
      { id: '1', owner: 'core', version: '001', name: 'a', tenant_id: 'tenant-1', owner_type: 'CORE', applied_at: new Date(), checksum: sha256('CREATE TABLE a();') },
    ];
    selectResults['SELECT id, checksum FROM migrations'] = [];

    const result = await runMigrations('tenant-1', dir);

    expect(result.skipped).toEqual(['a']);
    expect(result.applied).toEqual(['b']);
    rmSync(dir, { recursive: true, force: true });
  });

  it('does not replay core migrations already covered by the canonical baseline', async () => {
    const dir = withMigrations({ 'V001__core__baseline_change.sql': 'CREATE TABLE baseline_change (id int);' });
    selectResults['schema_bootstrap'] = [{ schema_version: 'V025' }];
    const result = await runMigrations('tenant-1', dir);
    expect(result).toEqual({ applied: [], skipped: ['baseline_change'] });
    expect(calls.some((call) => call.kind === 'unsafe' && call.query.includes('CREATE TABLE baseline_change'))).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  it('fails closed until a legacy schema is explicitly adopted', async () => {
    const dir = withMigrations({ 'V001__core__legacy_upgrade.sql': 'CREATE TABLE legacy_upgrade (id int);' });
    selectResults['schema_bootstrap'] = [{ schema_version: 'legacy-pending' }];
    await expect(runMigrations('tenant-1', dir)).rejects.toThrow(/--adopt-legacy/);
    expect(calls.some((call) => call.kind === 'unsafe' && call.query.includes('CREATE TABLE legacy_upgrade'))).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  it('encapsula falha com nome da migration', async () => {
    const dir = withMigrations({ 'V001__core__boom.sql': 'INVALID SQL;' });
    unsafeError = new Error('syntax error');

    await expect(runMigrations('tenant-1', dir)).rejects.toThrow(
      /Migration failed: boom - syntax error/
    );
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('rollbackMigration', () => {
  it('rejeita rollback sem marcador -- +migrate Down', async () => {
    selectResults['FROM migrations'] = [{ id: 'applied' }];

    await expect(
      rollbackMigration('tenant-1', {
        name: 'no_down',
        version: '001',
        owner: 'core',
        ownerType: 'CORE',
        sql: '-- +migrate Up\nCREATE TABLE x();',
        checksum: 'c',
      })
    ).rejects.toThrow(/No rollback defined/);
  });

  it('executa bloco Down em transação e remove registro', async () => {
    selectResults['FROM migrations'] = [{ id: 'applied' }];

    await rollbackMigration('tenant-1', {
      name: 'with_down',
      version: '001',
      owner: 'core',
      ownerType: 'CORE',
      sql: '-- +migrate Up\nCREATE TABLE x();\n-- +migrate Down\nDROP TABLE x();',
      checksum: 'c',
    });

    const unsafe = calls.find((c): c is UnsafeCall => c.kind === 'unsafe');
    expect(unsafe!.query).toBe('DROP TABLE x();');
    const del = calls.find(
      (c): c is TaggedCall => c.kind === 'tagged' && c.text.includes('DELETE FROM migrations')
    );
    expect(del).toBeTruthy();
  });

  it('não faz nada se migration nunca foi aplicada', async () => {
    await rollbackMigration('tenant-1', {
      name: 'never_applied',
      version: '009',
      owner: 'core',
      ownerType: 'CORE',
      sql: '-- +migrate Up\nCREATE TABLE x();\n-- +migrate Down\nDROP TABLE x();',
      checksum: 'c',
    });

    expect(calls.some((c) => c.kind === 'unsafe')).toBe(false);
  });
});

describe('rollbackPluginMigrations', () => {
  it('preserves migration records when no rollback SQL is supplied', async () => {
    selectResults['FROM migrations'] = [
      { id: '1', tenant_id: 'tenant-1', owner: 'plugin_seo', version: '001', name: 'create_tables', owner_type: 'PLUGIN', applied_at: new Date(), checksum: 'c1' },
      { id: '2', tenant_id: 'tenant-1', owner: 'plugin_seo', version: '002', name: 'add_index', owner_type: 'PLUGIN', applied_at: new Date(), checksum: 'c2' },
      { id: '3', tenant_id: 'tenant-1', owner: 'plugin_seo', version: '003', name: 'add_column', owner_type: 'PLUGIN', applied_at: new Date(), checksum: 'c3' },
    ];

    await expect(rollbackPluginMigrations('tenant-1', 'plugin_seo')).rejects.toThrow(/no Down SQL/);
    expect(calls.some((c) => c.kind === 'unsafe')).toBe(false);
    expect(calls.some((c): c is TaggedCall => c.kind === 'tagged' && c.text.includes('DELETE FROM migrations'))).toBe(false);
  });

  it('retorna 0 quando plugin não tem migrations aplicadas', async () => {
    selectResults['FROM migrations'] = [];

    const count = await rollbackPluginMigrations('tenant-1', 'plugin_nonexistent');

    expect(count).toBe(0);
    expect(calls.some((c) => c.kind === 'unsafe')).toBe(false);
  });

  it('executa downSql fornecido em transação com tenant context', async () => {
    selectResults['FROM migrations'] = [
      { id: '1', tenant_id: 'tenant-1', owner: 'plugin_test', version: '001', name: 'create', owner_type: 'PLUGIN', applied_at: new Date(), checksum: 'c1' },
    ];

    const downSql = 'DROP TABLE plugin_test_data;';
    const count = await rollbackPluginMigrations('tenant-1', 'plugin_test', downSql);

    expect(count).toBe(1);
    // Verify transaction was started
    expect(calls.some((c): c is TaggedCall => c.kind === 'tagged' && c.text === '__BEGIN__')).toBe(true);
    // Verify tenant context was set
    const setConfigCalls = calls.filter((c): c is TaggedCall => c.kind === 'tagged' && c.text.includes('set_config'));
    expect(setConfigCalls.length).toBeGreaterThan(0);
    expect(setConfigCalls[0]!.text).toContain("app.current_tenant_id");
    // Verify downSql was executed
    const unsafeCalls = calls.filter((c): c is UnsafeCall => c.kind === 'unsafe');
    expect(unsafeCalls.some((c) => c.query === downSql)).toBe(true);
    // Verify migrations were deleted
    const deleteCalls = calls.filter((c): c is TaggedCall => c.kind === 'tagged' && c.text.includes('DELETE FROM migrations'));
    expect(deleteCalls.length).toBe(1);
  });

  it('aplica apenas ao owner especificado (não afeta outros plugins)', async () => {
    selectResults['FROM migrations'] = [
      { id: '1', tenant_id: 'tenant-1', owner: 'plugin_a', version: '001', name: 'a', owner_type: 'PLUGIN', applied_at: new Date(), checksum: 'c1' },
      { id: '2', tenant_id: 'tenant-1', owner: 'plugin_b', version: '001', name: 'b', owner_type: 'PLUGIN', applied_at: new Date(), checksum: 'c2' },
    ];

    const count = await rollbackPluginMigrations('tenant-1', 'plugin_a', 'DROP TABLE plugin_a_data;');

    expect(count).toBe(2); // Returns all matching rows from mock
    // The mock doesn't filter by owner, so both are returned
    // In real DB, the WHERE clause would filter by owner
    const deleteCalls = calls.filter((c): c is TaggedCall => c.kind === 'tagged' && c.text.includes('DELETE FROM migrations'));
    expect(deleteCalls.length).toBe(1);
    expect(deleteCalls[0]!.text).toContain('DELETE FROM migrations');
    expect(deleteCalls[0]!.text).toContain('tenant_id = ?');
    expect(deleteCalls[0]!.text).toContain('owner = ?');
  });
});

describe('runPluginMigrations', () => {
  it('executes each plugin Up section exactly once in the plugin search path', async () => {
    const files = [
      {
        version: '001',
        name: 'create_table',
        sql: '-- +migrate Up\nCREATE TABLE only_once (id integer);\n-- +migrate Down\nDROP TABLE only_once;',
      },
    ];

    const applied = await runPluginMigrations('tenant-1', 'plugin_seo', files);

    expect(applied).toBe(1);
    const unsafe = calls.filter((call): call is UnsafeCall => call.kind === 'unsafe');
    expect(unsafe).toHaveLength(1);
    expect(unsafe[0]!.query).toContain('CREATE TABLE only_once');
    expect(unsafe[0]!.query).not.toContain('DROP TABLE only_once');
    const searchPath = calls.find(
      (call): call is TaggedCall => call.kind === 'tagged' && call.text.includes('SET LOCAL search_path')
    );
    expect(searchPath).toBeTruthy();
  });
});
