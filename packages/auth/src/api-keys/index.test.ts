// @oktis-works/auth - ApiKeyService: geração, verificação, consumo e revogação
//
// Regressão do design: a key em claro só existe na criação; verify valida o
// hash em constant-time, registra last_used_at/use_count e revoga keys
// single-use. Revogadas/expiradas/refix errado → null.

import { describe, it, expect, vi, beforeEach } from 'vitest';

type UnsafeCall = { query: string; values: unknown[] };

let calls: UnsafeCall[];
let rowsByNeedle: Record<string, unknown[]>;

function makeClient() {
  const respond = (text: string): unknown[] => {
    for (const [needle, rows] of Object.entries(rowsByNeedle)) {
      if (text.includes(needle)) return rows;
    }
    return [];
  };
  const unsafe = vi.fn(async (query: string, params?: unknown[]) => {
    calls.push({ query, values: params ?? [] });
    if (query.includes('INSERT INTO api_keys')) {
      // Ecoa os valores como o RETURNING * real faria.
      const [id, tenant_id, user_id, name, key_prefix, key_hash, one_time, expires_at, created_by] = params ?? [];
      return [{
        id,
        tenant_id,
        user_id,
        name,
        key_prefix,
        key_hash,
        one_time,
        expires_at,
        last_used_at: null,
        use_count: 0,
        revoked_at: null,
        created_by,
        created_at: new Date().toISOString(),
      }];
    }
    return respond(query);
  });
  return { unsafe };
}

vi.mock('@oktis-works/database', () => ({
  getConnection: vi.fn(),
}));

import { getConnection } from '@oktis-works/database';
import { ApiKeyService } from './index.js';

const TENANT = '11111111-2222-3333-4444-555555555555';
const OTHER_TENANT = '99999999-8888-7777-6666-555555555555';

beforeEach(() => {
  calls = [];
  rowsByNeedle = {};
  vi.mocked(getConnection).mockReturnValue(makeClient() as never);
});

const PLAINTEXT = 'okcms_a1b2c3d4e5f60718_4Ks9xR2vQ8mNpL5wYtG3uH6jZ1cD7fA0bE4iO2kM9nP';
const PREFIX = 'a1b2c3d4e5f60718';

// Hash sha256 do valor claro — o mesmo que o service calcula internamente.
async function sha256(value: string): Promise<string> {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(value).digest('hex');
}

describe('ApiKeyService.create', () => {
  it('gera formato okcms_<prefix>_<secret> e persiste SOMENTE o hash', async () => {
    const service = new ApiKeyService();
    const created = await service.create({ tenantId: TENANT, userId: 'user-1', name: 'App mobile' });

    expect(created.plaintext).toMatch(/^okcms_[0-9a-f]{16}_[A-Za-z0-9_-]+$/);
    expect(created.keyPrefix).toBe(created.plaintext.split('_')[1]);

    const insert = calls.find((c) => c.query.includes('INSERT INTO api_keys'))!;
    const expectedHash = await sha256(created.plaintext);
    expect(insert.values).toContain(expectedHash);
    // O valor claro NUNCA vai para o banco.
    expect(insert.values).not.toContain(created.plaintext);
    expect(created.plaintext.startsWith(`okcms_${created.keyPrefix}_`)).toBe(true);
  });

  it('seta contexto de tenant na transação (RLS)', async () => {
    const service = new ApiKeyService();
    await service.create({ tenantId: TENANT, userId: 'user-1', name: 'k' });
    expect(calls.some((c) => c.query.includes('app.current_tenant_id') && c.values.includes(TENANT))).toBe(true);
  });
});

describe('ApiKeyService.verify', () => {
  async function keyRow(overrides: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    return {
      id: 'key-1',
      tenant_id: TENANT,
      user_id: 'user-1',
      name: 'k',
      key_prefix: PREFIX,
      key_hash: await sha256(PLAINTEXT),
      one_time: false,
      expires_at: null,
      last_used_at: null,
      use_count: 0,
      revoked_at: null,
      created_by: null,
      created_at: new Date().toISOString(),
      ...overrides,
    };
  }

  it('aceita key válida e registra consumo (last_used_at + use_count)', async () => {
    rowsByNeedle['SELECT * FROM api_keys WHERE tenant_id'] = [await keyRow()];
    rowsByNeedle['UPDATE api_keys'] = [await keyRow({ last_used_at: new Date().toISOString(), use_count: 1 })];

    const service = new ApiKeyService();
    const result = await service.verify(PLAINTEXT, TENANT);

    expect(result).not.toBeNull();
    expect(result!.useCount).toBe(1);
    const update = calls.find((c) => c.query.includes('UPDATE api_keys'))!;
    expect(update.query).toContain('use_count = use_count + 1');
  });

  it('rejeita prefixo que não pertence ao formato okcms', async () => {
    const service = new ApiKeyService();
    expect(await service.verify('sk_live_qualquercoisa', TENANT)).toBeNull();
    expect(calls.some((c) => c.query.includes('SELECT * FROM api_keys'))).toBe(false);
  });

  it('rejeita hash divergente (não é a key daquele prefixo)', async () => {
    rowsByNeedle['SELECT * FROM api_keys WHERE tenant_id'] = [await keyRow({ key_hash: 'deadbeef'.repeat(8) })];
    const service = new ApiKeyService();
    expect(await service.verify(PLAINTEXT, TENANT)).toBeNull();
  });

  it('rejeita key revogada', async () => {
    rowsByNeedle['SELECT * FROM api_keys WHERE tenant_id'] = [
      await keyRow({ revoked_at: new Date(Date.now() - 1000).toISOString() }),
    ];
    const service = new ApiKeyService();
    expect(await service.verify(PLAINTEXT, TENANT)).toBeNull();
  });

  it('rejeita key expirada', async () => {
    rowsByNeedle['SELECT * FROM api_keys WHERE tenant_id'] = [
      await keyRow({ expires_at: new Date(Date.now() - 1000).toISOString() }),
    ];
    const service = new ApiKeyService();
    expect(await service.verify(PLAINTEXT, TENANT)).toBeNull();
  });

  it('revoga keys single-use já no consumo (2º uso falha)', async () => {
    rowsByNeedle['SELECT * FROM api_keys WHERE tenant_id'] = [await keyRow({ one_time: true })];
    rowsByNeedle['UPDATE api_keys'] = [
      await keyRow({ one_time: true, revoked_at: new Date().toISOString(), use_count: 1 }),
    ];

    const service = new ApiKeyService();
    const first = await service.verify(PLAINTEXT, TENANT);
    expect(first).not.toBeNull();
    const update = calls.find((c) => c.query.includes('UPDATE api_keys'))!;
    expect(update.query).toContain('one_time THEN NOW()');
  });

  it('seta o prefixo no contexto transacional (policy api_key_prefix_lookup)', async () => {
    rowsByNeedle['SELECT * FROM api_keys WHERE tenant_id'] = [await keyRow()];
    rowsByNeedle['UPDATE api_keys'] = [await keyRow()];

    const service = new ApiKeyService();
    await service.verify(PLAINTEXT, TENANT);
    expect(
      calls.some((c) => c.query.includes('app.current_api_key_prefix') && c.values.includes(PREFIX))
    ).toBe(true);
  });
});

describe('ApiKeyService.revoke', () => {
  it('revoga somente no próprio tenant', async () => {
    rowsByNeedle['UPDATE api_keys'] = [{ id: 'key-1' }];
    const service = new ApiKeyService();
    const ok = await service.revoke('key-1', TENANT);
    expect(ok).toBe(true);
    const update = calls.find((c) => c.query.includes('UPDATE api_keys'))!;
    expect(update.values).toEqual(['key-1', TENANT]);
  });

  it('devolve false quando já revogada ou inexistente', async () => {
    const service = new ApiKeyService();
    expect(await service.revoke('key-x', OTHER_TENANT)).toBe(false);
  });
});

describe('ApiKeyService.list', () => {
  it('lista por tenant ordenado e sem expor key_hash no mapeamento', async () => {
    rowsByNeedle['SELECT * FROM api_keys WHERE tenant_id'] = [
      {
        id: 'key-1',
        tenant_id: TENANT,
        user_id: 'user-1',
        name: 'k',
        key_prefix: PREFIX,
        key_hash: 'secrethash',
        one_time: false,
        expires_at: null,
        last_used_at: null,
        use_count: 0,
        revoked_at: null,
        created_by: null,
        created_at: new Date().toISOString(),
      },
    ];

    const service = new ApiKeyService();
    const list = await service.list(TENANT);
    expect(list).toHaveLength(1);
    expect(list[0]!.keyPrefix).toBe(PREFIX);
    expect('keyHash' in list[0]!).toBe(false);
    expect(JSON.stringify(list[0])).not.toContain('secrethash');
  });
});
