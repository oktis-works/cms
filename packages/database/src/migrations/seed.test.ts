// @oktis-works/database - Seeds (roles + settings) — idempotência e conteúdo

import { describe, it, expect, vi, beforeEach } from 'vitest';

type TaggedCall = { kind: 'tagged'; text: string; values: unknown[] };
type UnsafeCall = { kind: 'unsafe'; query: string; values: unknown[] };
type Call = TaggedCall | UnsafeCall;

let calls: Call[];
let selectResults: Record<string, unknown[]>;
let client: ReturnType<typeof makeClient>;

function makeClient() {
  const respond = (text: string): unknown[] => {
    for (const [needle, rows] of Object.entries(selectResults)) {
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
    unsafe: vi.fn(async (query: string, params?: unknown[]) => {
      calls.push({ kind: 'unsafe', query, values: params ?? [] });
      return respond(query);
    }),
    begin: vi.fn(async (fn: (tx: typeof c) => Promise<void>) => {
      calls.push({ kind: 'tagged', text: '__BEGIN__', values: [] });
      await fn(c);
    }),
  });
  return c;
}

vi.mock('../connection.js', () => ({ getConnection: vi.fn() }));

import { getConnection } from '../connection.js';
import { seedCoreData, seedDefaultRoles, seedDefaultSettings, DEFAULT_ROLES, DEFAULT_SETTINGS } from './seed.js';

beforeEach(() => {
  calls = [];
  selectResults = {};
  client = makeClient();
  vi.mocked(getConnection).mockReturnValue(client as never);
});

const unsafeCalls = () => calls.filter((c): c is UnsafeCall => c.kind === 'unsafe');

describe('seedDefaultRoles', () => {
  it('cria as 5 roles da política com guarda de idempotência (WHERE NOT EXISTS)', async () => {
    selectResults['INSERT INTO roles'] = [{ id: 'r1' }];

    const inserted = await seedDefaultRoles();

    expect(inserted).toBe(5);
    const inserts = unsafeCalls().filter((c) => c.query.includes('INSERT INTO roles'));
    expect(inserts).toHaveLength(5);
    for (const insert of inserts) {
      expect(insert.query).toContain('WHERE NOT EXISTS');
      expect(insert.query).toContain('tenant_id IS NULL');
      expect(insert.query).toContain("'[]'::jsonb");
    }
    // slugs exatamente os da política (o JWT depende disso)
    expect(inserts.map((c) => c.values[1])).toEqual(DEFAULT_ROLES.map((r) => r.slug));
    expect(inserts.map((c) => c.values[0])).toEqual(DEFAULT_ROLES.map((r) => r.name));
  });

  it('banco já com as roles → nenhuma linha nova (guarda do SQL devolve 0)', async () => {
    selectResults['INSERT INTO roles'] = [];

    expect(await seedDefaultRoles()).toBe(0);
  });
});

describe('seedDefaultSettings', () => {
  const tenant = '11111111-2222-3333-4444-555555555555';

  it('cria os settings do grupo general com ON CONFLICT (idempotente)', async () => {
    selectResults['INSERT INTO settings'] = [{ id: 's1' }];

    const inserted = await seedDefaultSettings(tenant);

    expect(inserted).toBe(4);
    const inserts = unsafeCalls().filter((c) => c.query.includes('INSERT INTO settings'));
    expect(inserts).toHaveLength(4);
    for (const insert of inserts) {
      expect(insert.query).toContain('ON CONFLICT (key, tenant_id) DO NOTHING');
      expect(insert.query).toContain('"group"');
      expect(insert.query).toContain('to_jsonb($3::text)');
      expect(insert.values[0]).toBe(tenant);
      expect(insert.values[3]).toBe('string');
    }
    expect(inserts.map((c) => c.values[1])).toEqual(DEFAULT_SETTINGS.map((s) => s.key));
  });

  it('já existentes → 0', async () => {
    selectResults['INSERT INTO settings'] = [];
    expect(await seedDefaultSettings(tenant)).toBe(0);
  });
});

describe('seedCoreData', () => {
  it('resolve/cria o tenant default e semeia roles + settings', async () => {
    const uuid = '22222222-3333-4444-5555-666666666666';
    selectResults['INSERT INTO roles'] = [{ id: 'r' }];
    selectResults['INSERT INTO settings'] = [{ id: 's' }];
    selectResults['SELECT id FROM tenants'] = [{ id: uuid }];

    const result = await seedCoreData();

    expect(result).toEqual({ roles: 5, settings: 4 });
    expect(calls.some((c) => c.kind === 'tagged' && c.text.includes('SELECT id FROM tenants'))).toBe(true);
    // settings apontam para o UUID real do tenant
    const settingsInserts = unsafeCalls().filter((c) => c.query.includes('INSERT INTO settings'));
    expect(settingsInserts.every((c) => c.values[0] === uuid)).toBe(true);
  });
});
