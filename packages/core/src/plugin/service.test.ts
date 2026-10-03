// @oktis-works/core - Plugin Scope Tests (RULE-tenant-plugin-scope)

import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = Record<string, unknown>;
let rows: Row[];
let queue: Row[][];
let lastQuery: { text: string; values: unknown[] } | null;
const allQueries: Array<{ text: string; values: unknown[] }> = [];
const migrationCalls: string[] = [];
const emittedEvents: Array<{ type: string; payload: Record<string, unknown> }> = [];

vi.mock('@oktis-works/database', () => ({
  getConnection: vi.fn(() => ({
    unsafe: vi.fn(async (text: string, values?: unknown[]) => {
      lastQuery = { text, values: values ?? [] };
      allQueries.push(lastQuery);
      if (queue.length > 0) return queue.shift();
      return rows;
    }),
  })),
  runPluginMigrations: vi.fn(async (_t: string, _o: string, files: Array<{ version: string }>) => {
    for (const f of [...files].sort((a, b) => a.version.localeCompare(b.version))) migrationCalls.push(f.version);
    return migrationCalls.length;
  }),
  rollbackPluginMigrations: vi.fn(async () => 0),
}));

vi.mock('../events/bus.js', () => ({
  getEventBus: vi.fn(() => ({
    emit: vi.fn(async (e: { type: string; payload: Record<string, unknown> }) => {
      emittedEvents.push({ type: e.type, payload: e.payload });
    }),
  })),
}));

import { PluginService } from './service.js';

beforeEach(() => {
  rows = [];
  queue = [];
  lastQuery = null;
  allQueries.length = 0;
  migrationCalls.length = 0;
  emittedEvents.length = 0;
});

const plugin = (name: string, scope: string | null) =>
  ({ id: name, name, manifest: { scope }, tenant_id: 'tenant-2' }) as never;

describe('PluginService.list — tenant/platform scope', () => {
  it('com tenantId retorna platform + do próprio tenant (query parametrizada)', async () => {
    rows = [plugin('seo', 'platform'), plugin('loja', null), plugin('interno', 'tenant')];

    const result = await new PluginService().list('tenant-2');

    expect(lastQuery!.values).toEqual(['tenant-2']);
    expect(lastQuery!.text).toContain("'platform'");
    expect(result).toHaveLength(3);
  });

  it('sem tenantId retorna apenas escopo platform/legacy', async () => {
    rows = [plugin('seo', 'platform')];

    const result = await new PluginService().list();

    expect(lastQuery!.values).toHaveLength(0);
    expect(result).toHaveLength(1);
  });
});

describe('PluginService mutações — REQ-observability-004', () => {
  it('install registra audit plugin.install em audit_logs', async () => {
    rows = [{ id: 'p1' }];

    await new PluginService().install({
      name: 'seo',
      version: '1.0.0',
      manifest: { name: 'seo' },
    });

    expect(lastQuery!.text).toContain('INSERT INTO audit_logs');
    expect(lastQuery!.values[2]).toBe('plugin.install');
    expect(lastQuery!.values[3]).toBe('plugin');
    expect(lastQuery!.values[5]).toEqual({ name: 'seo', version: '1.0.0' });
  });

  it('activate registra audit plugin.activate', async () => {
    rows = [
      { id: 'p1', status: 'INSTALLED' },
      { id: 'p1', status: 'ACTIVATED' },
    ];

    await new PluginService().activate('p1');

    expect(lastQuery!.text).toContain('INSERT INTO audit_logs');
    expect(lastQuery!.values[2]).toBe('plugin.activate');
  });
});

describe('Ciclo de vida avançado — instalação, ativação e desativação', () => {
  it('install bloqueia quando dependência obrigatória não está instalada', async () => {
    queue = [[]];

    await expect(
      new PluginService().install({
        name: 'filho',
        version: '1.0.0',
        manifest: { name: 'filho' },
        dependencies: [{ name: 'pai' }],
      })
    ).rejects.toThrow('DEPENDENCY_MISSING');

    expect(lastQuery!.text).toContain("status IN ('INSTALLED','ACTIVATED')");
    expect(lastQuery!.values).toContain('pai');
  });

  it('install registra dependências e aplica migrations do plugin em ordem', async () => {
    queue = [[{ id: 'dep-1' }], [{ id: 'p1' }], [{ id: 'dep-1' }]];
    const migration = (v: string): { version: string; name: string; owner: string; ownerType: 'PLUGIN'; checksum: string; sql: string } => ({
      version: v,
      name: `V${v}__plugin_x__t.sql`,
      owner: 'x',
      ownerType: 'PLUGIN' as const,
      checksum: 'abc',
      sql: 'SELECT 1',
    });

    await new PluginService().install({
      name: 'x',
      version: '1.0.0',
      manifest: { name: 'x' },
      dependencies: [{ name: 'dep', versionRange: '^1.0.0' }],
      migrations: [migration('002'), migration('001')],
    });

    expect(migrationCalls).toEqual(['001', '002']);
    const depInsert = allQueries.find((q) => q.text.includes('INSERT INTO plugin_dependencies'))!;
    expect(depInsert.values[2]).toBe('^1.0.0');
    expect(depInsert.values[2]).toBe('^1.0.0');
  });

  it('install com falha de migration marca MIGRATION_FAILED e propaga erro', async () => {
    queue = [[{ id: 'dep-1' }], [{ id: 'p1' }]];
    const { runPluginMigrations } = (await import('@oktis-works/database')) as unknown as {
      runPluginMigrations: ReturnType<typeof vi.fn>;
    };
    runPluginMigrations.mockRejectedValueOnce(new Error('syntax error'));

    await expect(
      new PluginService().install({
        name: 'x',
        version: '1.0.0',
        manifest: { name: 'x' },
        migrations: [
          { version: '001', name: 'V001__plugin_x__a.sql', owner: 'x', ownerType: 'PLUGIN', checksum: 'c', sql: 'BAD;' },
        ],
      })
    ).rejects.toThrow('MIGRATION_FAILED');

    expect(allQueries.some((q) => q.text.includes("'MIGRATION_FAILED'"))).toBe(true);
  });

  it('activate bloqueia range compatibility.okcms insatisfazível', async () => {
    rows = [
      {
        id: 'p1',
        name: 'futuro',
        status: 'INSTALLED',
        manifest: JSON.stringify({ name: 'futuro', compatibility: { okcms: '^99.0.0' } }),
      },
    ];

    await expect(new PluginService().activate('p1')).rejects.toThrow('ACTIVATION_FAILED');
  });

  it('activate aceita range satisfazível e transiciona para ACTIVATED', async () => {
    rows = [
      {
        id: 'p1',
        name: 'ok',
        status: 'INSTALLED',
        manifest: { name: 'ok', compatibility: { okcms: '^0.1.0' } },
      },
    ];

    const activated = await new PluginService().activate('p1');

    expect(activated).not.toBeNull();
    expect(allQueries.some((q) => q.text.includes('SET status = $1') && q.values.includes('ACTIVATED'))).toBe(true);
  });

  it('deactivate notifica dependentes ativos via evento plugin.deactivated', async () => {
    queue = [
      [{ id: 'p1', name: 'base', status: 'ACTIVATED', manifest: {} }],
      [{ id: 'p1', name: 'base', status: 'DEACTIVATED' }],
      [{ id: 'd1', name: 'extensao' }],
    ];

    await new PluginService().deactivate('p1');

    expect(emittedEvents).toHaveLength(1);
    expect(emittedEvents[0]!.type).toBe('plugin.deactivated');
    expect(emittedEvents[0]!.payload['dependents']).toEqual(['extensao']);
    expect(allQueries.some((q) => q.text.includes('plugin_dependencies'))).toBe(true);
  });
});
