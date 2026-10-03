// @oktis-works/database - RLS: tenant context com SQL válido
// `SET x = $1` não existe no Postgres (syntax error 42601) — o tenant context
// precisa usar set_config parametrizado (regressão: quebrava login/X-Tenant-ID).

import { describe, it, expect, vi, beforeEach } from 'vitest';

type TaggedCall = { text: string; values: unknown[] };
const tagged: TaggedCall[] = [];

const sql = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
  tagged.push({ text: strings.join('?'), values });
  return Promise.resolve([]);
});

vi.mock('../connection.js', () => ({
  getConnection: vi.fn(() => sql),
}));

import { setTenantContext, clearTenantContext, getCurrentTenantId } from './index.js';

beforeEach(() => {
  tagged.length = 0;
});

describe('setTenantContext', () => {
  it('usa set_config parametrizado (nunca `SET x = placeholder`)', async () => {
    await setTenantContext('a7839ef5-9b1a-4dfb-b971-65bcb3639189');

    const call = tagged[0]!;
    expect(call.text).toContain("set_config('app.current_tenant_id'");
    expect(call.text).not.toMatch(/^SET /);
    expect(call.values).toEqual(['a7839ef5-9b1a-4dfb-b971-65bcb3639189']);
  });

  it('o valor é passado como parâmetro (sem interpolação / injection)', async () => {
    const hostile = "x'; DROP TABLE content; --";
    await setTenantContext(hostile);

    expect(tagged[0]!.values).toEqual([hostile]);
    expect(tagged[0]!.text).not.toContain('DROP TABLE');
  });
});

describe('clearTenantContext / getCurrentTenantId', () => {
  it('RESET não tem parâmetro (SQL válido como está)', async () => {
    await clearTenantContext();

    expect(tagged[0]!.text).toContain('RESET app.current_tenant_id');
    expect(tagged[0]!.values).toHaveLength(0);
  });

  it('getCurrentTenantId lê via current_setting (null sem valor)', async () => {
    expect(await getCurrentTenantId()).toBeNull();

    expect(tagged[0]!.text).toContain("current_setting('app.current_tenant_id'");
    expect(tagged[0]!.values).toHaveLength(0);
  });

  it('getCurrentTenantId devolve o valor do GUC', async () => {
    vi.mocked(sql).mockResolvedValueOnce([{ app_current_tenant_id: 'tenant-1' }] as never);

    expect(await getCurrentTenantId()).toBe('tenant-1');
  });
});
