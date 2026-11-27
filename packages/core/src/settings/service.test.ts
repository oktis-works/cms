// @oktis-works/core - SettingsService: params jsonb crus + boolean via CASE WHEN
//
// Regressão do bug achado no E2E: o código pré-stringificava E o driver também
// serializava → gravava jsonb duplo ('"Site E2E"' em vez de 'Site E2E').
// E boolean nativo não tem cast para jsonb (boolean::jsonb não existe) — nesse
// caso o valor vira literal jsonb via CASE WHEN.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const store: {
  queries: { text: string; values: unknown[] }[];
  byKey: Record<string, unknown>[];
  returning: Record<string, unknown>[];
} = { queries: [], byKey: [], returning: [] };

vi.mock('@oktis-works/database', () => ({
  getConnection: vi.fn(() => ({
    unsafe: vi.fn(async (text: string, values?: unknown[]) => {
      store.queries.push({ text, values: values ?? [] });
      if (text.includes('FROM settings WHERE key')) return store.byKey;
      return store.returning;
    }),
  })),
  runInTransaction: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));

import { SettingsService } from './service.js';

beforeEach(() => {
  store.queries = [];
  store.byKey = [];
  store.returning = [{ id: 's-1', key: 'siteTitle' }];
});

describe('SettingsService.set (INSERT)', () => {
  it('passa a string CRUA como param — sem pre-stringify (uma serialização só)', async () => {
    await new SettingsService().set('siteTitle', 'Site E2E', 'general', 'string', 'tenant-1');

    const insert = store.queries.find((q) => q.text.includes('INSERT INTO settings'));
    expect(insert).toBeDefined();
    expect(insert!.text).toContain('$4::jsonb');
    expect(typeof insert!.values[0]).toBe('string'); // id (uuid)
    expect(insert!.values[1]).toBe('tenant-1');
    expect(insert!.values[2]).toBe('siteTitle');
    expect(insert!.values[3]).toBe('Site E2E');
    expect(insert!.values[4]).toBe('general');
    expect(insert!.values[5]).toBe('string');
  });

  it('boolean vira literal jsonb via CASE WHEN (param segue boolean)', async () => {
    await new SettingsService().set('maintenance', false, 'general', 'boolean', 'tenant-1');

    const insert = store.queries.find((q) => q.text.includes('INSERT INTO settings'));
    expect(insert!.text).toContain("CASE WHEN $4 THEN 'true'::jsonb ELSE 'false'::jsonb END");
    expect(insert!.values[3]).toBe(false);
  });

  it('normalizes known setting types and assigns explicit public visibility', async () => {
    await new SettingsService().set('seo.robotsEnabled', 'false', 'seo', 'string', 'tenant-1');

    const insert = store.queries.find((q) => q.text.includes('INSERT INTO settings'));
    expect(insert!.values[3]).toBe(false);
    expect(insert!.values[5]).toBe('boolean');
    expect(insert!.values[6]).toBe('public');
  });

  it('objeto/array passam crus (driver serializa para jsonb)', async () => {
    await new SettingsService().set('menuLinks', [{ label: 'Home', url: '/' }], 'general', 'array', 'tenant-1');

    const insert = store.queries.find((q) => q.text.includes('INSERT INTO settings'));
    expect(insert!.values[3]).toEqual([{ label: 'Home', url: '/' }]);
  });
});

describe('SettingsService.set (UPDATE)', () => {
  it('upserts with tenant scope and preserves the raw JSON parameter', async () => {
    store.byKey = [{ key: 'siteTitle', value: 'Antigo' }];

    await new SettingsService().set('siteTitle', 'Novo Título', 'general', 'string', 'tenant-1');

    const upsert = store.queries.find((q) => q.text.includes('INSERT INTO settings'));
    expect(upsert!.text).toContain('ON CONFLICT (key, tenant_id)');
    expect(upsert!.values[3]).toBe('Novo Título');
  });

  it('boolean no UPDATE usa CASE WHEN $1 e param boolean', async () => {
    store.byKey = [{ key: 'maintenance', value: true }];

    await new SettingsService().set('maintenance', false, 'general', 'boolean', 'tenant-1');

    const upsert = store.queries.find((q) => q.text.includes('INSERT INTO settings'));
    expect(upsert!.text).toContain("CASE WHEN $4 THEN 'true'::jsonb ELSE 'false'::jsonb END");
    expect(upsert!.values[3]).toBe(false);
  });
});

describe('SettingsService tenant scope', () => {
  it('includes the explicit tenant in reads and resolves tenant values before global values', async () => {
    await new SettingsService().get('general', 'tenant-a');
    const query = store.queries[0]!;
    expect(query.text).toContain('tenant_id = $1');
    expect(query.text).toContain('CASE WHEN tenant_id = $1 THEN 0 ELSE 1 END');
    expect(query.values).toEqual(['tenant-a', 'general']);
  });

  it('returns one effective row with tenant precedence over the global row', async () => {
    store.returning = [
      { key: 'siteTitle', value: 'Tenant', group: 'general', type: 'string', tenant_id: 'tenant-a' },
      { key: 'siteTitle', value: 'Global', group: 'general', type: 'string', tenant_id: null },
    ];

    const result = await new SettingsService().get('general', 'tenant-a');

    expect(result).toHaveLength(1);
    expect(result[0]?.value).toBe('Tenant');
  });

  it('writes bulk settings inside one transaction and never omits scope metadata', async () => {
    await new SettingsService().setMany([
      { key: 'one', value: '1', group: 'general', type: 'string' },
      { key: 'two', value: '2', group: 'general', type: 'string' },
    ], 'tenant-a');
    expect(store.queries.filter((query) => query.text.includes('INSERT INTO settings'))).toHaveLength(2);
    expect(store.queries.every((query) => query.values[1] === 'tenant-a')).toBe(true);
  });
});
