// @oktis-works/database - Bootstrap Tests (banco fresco → comandos db:* funcionais)
//
// Regressão do bug: `okcms db:migrate` em banco recém-criado morria com
// `relation "migrations" does not exist` (a tabela tem FK para tenants, que
// também não existia) e depois quebraria com `invalid uuid: "default"`.

import { describe, it, expect, vi, beforeEach } from 'vitest';

type TaggedCall = { kind: 'tagged'; text: string; values: unknown[] };
type UnsafeCall = { kind: 'unsafe'; query: string };
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
    unsafe: vi.fn(async (query: string) => {
      calls.push({ kind: 'unsafe', query });
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
import { ensureCoreSchema, resolveTenantId } from './bootstrap.js';

beforeEach(() => {
  calls = [];
  selectResults = {};
  client = makeClient();
  vi.mocked(getConnection).mockReturnValue(client as never);
});

describe('ensureCoreSchema', () => {
  it('banco fresco (tenants ausente) → aplica schema.sql numa transação e retorna true', async () => {
    const applied = await ensureCoreSchema();

    expect(applied).toBe(true);
    const unsafeCalls = calls.filter((c): c is UnsafeCall => c.kind === 'unsafe');
    expect(unsafeCalls).toHaveLength(1);
    expect(unsafeCalls[0]!.query).toContain('CREATE TABLE IF NOT EXISTS tenants');
    // schema completo aplicado de uma vez (inclui a tabela migrations)
    expect(unsafeCalls[0]!.query).toContain('CREATE TABLE IF NOT EXISTS migrations');
    expect(calls.some((c) => c.kind === 'tagged' && c.text === '__BEGIN__')).toBe(true);
  });

  it('schema já existe → reexecuta o schema.sql (idempotente) e retorna false', async () => {
    // Upgrade de consumidor: migrations/ de projeto é vazio, então o ÚNICO
    // canal de delta (ex.: users.locale no 0.4.0) é reexecutar o schema.sql.
    selectResults['to_regclass'] = [{ exists: 'tenants' }];

    const applied = await ensureCoreSchema();

    expect(applied).toBe(false);
    const unsafeCalls = calls.filter((c): c is UnsafeCall => c.kind === 'unsafe');
    expect(unsafeCalls).toHaveLength(1);
    expect(unsafeCalls[0]!.query).toContain('CREATE TABLE IF NOT EXISTS');
    // advisory lock antes do DDL (concorrência api/worker/cli no boot)
    const lock = calls.find(
      (c): c is TaggedCall => c.kind === 'tagged' && c.text.includes('pg_advisory_xact_lock')
    );
    expect(lock).toBeDefined();
  });
});

describe('resolveTenantId', () => {
  const uuid = '11111111-2222-3333-4444-555555555555';

  it('UUID é devolvido direto, sem tocar no banco', async () => {
    expect(await resolveTenantId(uuid)).toBe(uuid);
    expect(calls).toHaveLength(0);
  });

  it('slug existente resolve para o UUID do tenant', async () => {
    selectResults['SELECT id FROM tenants'] = [{ id: uuid }];

    expect(await resolveTenantId('minha-loja')).toBe(uuid);
    expect(calls.filter((c) => c.kind === 'unsafe')).toHaveLength(0);
  });

  it('"default" inexistente cria o tenant bootstrap e devolve o id', async () => {
    // SELECT inicial não encontra (sem needle → []); INSERT ... RETURNING devolve o id.
    selectResults['INSERT INTO tenants'] = [{ id: uuid }];

    expect(await resolveTenantId('default')).toBe(uuid);
    const insert = calls.find(
      (c): c is TaggedCall => c.kind === 'tagged' && c.text.includes('INSERT INTO tenants')
    );
    expect(insert).toBeDefined();
    // constantes embutidas como literais SQL (sem interpolação → values vazio)
    expect(insert!.text).toContain("('Default', 'default')");
    expect(insert!.text).toContain('RETURNING id');
  });

  it('slug desconhecido (fora de default) falha com erro claro, sem criar nada', async () => {
    await expect(resolveTenantId('loja-errada')).rejects.toThrow('não encontrado');
    expect(
      calls.filter((c) => c.kind === 'tagged' && c.text.includes('INSERT INTO tenants'))
    ).toHaveLength(0);
  });

  it('INSERT sem retorno (corrida/conflito) → refaz o SELECT e falha com mensagem clara', async () => {
    selectResults['INSERT INTO tenants'] = [];

    await expect(resolveTenantId('default')).rejects.toThrow('Falha ao criar o tenant default');
  });
});
