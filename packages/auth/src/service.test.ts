// @oktis-works/auth - AuthService: onboarding de papel (register) e tenant real (login)
//
// Regressão do bug: registrava usuário SEM vincular em tenant_users → JWT com
// roles [] → 403 em toda rota protegida. E login mandava o slug "default"
// direto para sessions.tenant_id (FK UUID).

import { describe, it, expect, vi, beforeEach } from 'vitest';

type UnsafeCall = { kind: 'unsafe'; query: string; values: unknown[] };

let calls: UnsafeCall[];
let unsafeResults: Record<string, unknown[]>;

function makeClient() {
  const respond = (text: string): unknown[] => {
    for (const [needle, rows] of Object.entries(unsafeResults)) {
      if (text.includes(needle)) return rows;
    }
    return [];
  };
  return {
    unsafe: vi.fn(async (query: string, params?: unknown[]) => {
      calls.push({ kind: 'unsafe', query, values: params ?? [] });
      return respond(query);
    }),
  };
}

vi.mock('@oktis-works/database', () => ({
  getConnection: vi.fn(),
  resolveTenantId: vi.fn(),
  seedDefaultRoles: vi.fn(),
  setTenantContext: vi.fn(),
}));

vi.mock('./password/index.js', () => ({
  hashPassword: vi.fn(async () => 'hashed-password'),
  // Fiel ao real: hash não-string = formato inválido (reproduz o bug do
  // SELECT * devolver password_hash enquanto o service lia passwordHash).
  verifyPassword: vi.fn(async (_plain: string, hash: string) => {
    if (typeof hash !== 'string') throw new Error('Invalid hash format');
    return true;
  }),
}));

import { getConnection, resolveTenantId, seedDefaultRoles, setTenantContext } from '@oktis-works/database';
import { AuthService } from './service.js';
import type { AuthConfig } from '@oktis-works/config';

const config: AuthConfig = {
  jwtSecret: 'test-secret-do-not-use-em-producao',
  jwtExpiresIn: '1h',
  refreshTokenExpiresIn: '7d',
  bcryptRounds: 10,
  cookie: {
    sameSite: 'lax',
    secure: false,
    accessTokenMaxAge: 900,
    refreshTokenMaxAge: 2592000,
  },
  csrf: {
    enabled: true,
    headerName: 'x-csrf-token',
    cookieName: 'csrf_token',
  },
};

const TENANT_UUID = '11111111-2222-3333-4444-555555555555';

beforeEach(() => {
  calls = [];
  unsafeResults = {};
  vi.mocked(getConnection).mockReturnValue(makeClient() as never);
  vi.mocked(resolveTenantId).mockResolvedValue(TENANT_UUID);
  vi.mocked(seedDefaultRoles).mockResolvedValue(0);
  vi.mocked(setTenantContext).mockResolvedValue(undefined as never);
});

const valuesFor = (needle: string): unknown[][] =>
  calls.filter((c) => c.query.includes(needle)).map((c) => c.values);

describe('AuthService.register', () => {
  it('primeiro usuário do tenant vira TENANT_ADMIN (seed + vínculo em tenant_users)', async () => {
    unsafeResults['SELECT id FROM users WHERE email'] = [];
    unsafeResults['INSERT INTO users'] = [{ id: 'user-1', email: 'a@b.c', name: 'A' }];
    unsafeResults['SELECT COUNT(*)::int AS count FROM tenant_users'] = [{ count: 0 }];
    unsafeResults['SELECT id FROM roles'] = [{ id: 'role-admin' }];
    unsafeResults['INSERT INTO tenant_users'] = [];

    const service = new AuthService(config);
    const user = await service.register({ email: 'a@b.c', password: 'x', name: 'A' });

    expect(user.id).toBe('user-1');
    expect(vi.mocked(seedDefaultRoles)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(resolveTenantId)).toHaveBeenCalledWith('default');
    // busca a role TENANT_ADMIN e vincula o usuário a ela
    expect(valuesFor('SELECT id FROM roles')[0]?.[0]).toBe('TENANT_ADMIN');
    const link = valuesFor('INSERT INTO tenant_users')[0];
    expect(link).toEqual([TENANT_UUID, 'user-1', 'role-admin']);
  });

  it('segundo usuário em diante recebe VIEWER (não nasce admin)', async () => {
    unsafeResults['SELECT id FROM users WHERE email'] = [];
    unsafeResults['INSERT INTO users'] = [{ id: 'user-2', email: 'c@d.e', name: 'C' }];
    unsafeResults['SELECT COUNT(*)::int AS count FROM tenant_users'] = [{ count: 3 }];
    unsafeResults['SELECT id FROM roles'] = [{ id: 'role-viewer' }];
    unsafeResults['INSERT INTO tenant_users'] = [];

    const service = new AuthService(config);
    await service.register({ email: 'c@d.e', password: 'x', name: 'C' });

    expect(valuesFor('SELECT id FROM roles')[0]?.[0]).toBe('VIEWER');
  });

  it('aceita tenantId explícito no registro', async () => {
    unsafeResults['SELECT id FROM users WHERE email'] = [];
    unsafeResults['INSERT INTO users'] = [{ id: 'user-3' }];
    unsafeResults['SELECT COUNT(*)::int AS count FROM tenant_users'] = [{ count: 1 }];
    unsafeResults['SELECT id FROM roles'] = [{ id: 'r' }];
    unsafeResults['INSERT INTO tenant_users'] = [];

    const service = new AuthService(config);
    await service.register({ email: 'e@f.g', password: 'x', name: 'G', tenantId: 'outra-loja' });

    expect(vi.mocked(resolveTenantId)).toHaveBeenCalledWith('outra-loja');
  });

  it('falha antes de tocar no vínculo quando o email já existe', async () => {
    unsafeResults['SELECT id FROM users WHERE email'] = [{ id: 'x' }];

    const service = new AuthService(config);
    await expect(service.register({ email: 'dup@x.y', password: 'x', name: 'D' })).rejects.toThrow(
      'already exists'
    );
    expect(valuesFor('INSERT INTO tenant_users')).toHaveLength(0);
  });
});

describe('AuthService.login', () => {
  it('lê password_hash (snake do SELECT *), resolve slug → UUID e não vaza o hash', async () => {
    unsafeResults['SELECT * FROM users WHERE email'] = [
      { id: 'user-1', email: 'a@b.c', password_hash: 'pbkdf2$...', status: 'ACTIVE' },
    ];
    unsafeResults['SELECT r.slug'] = [{ slug: 'TENANT_ADMIN' }];
    unsafeResults['INSERT INTO sessions'] = [{ id: 'sess-1' }];

    const service = new AuthService(config);
    const result = await service.login({ email: 'a@b.c', password: 'x', tenantId: 'default' });

    expect(vi.mocked(resolveTenantId)).toHaveBeenCalledWith('default');
    expect(vi.mocked(setTenantContext)).toHaveBeenCalledWith(TENANT_UUID);
    // sessão recebe o UUID (FK) — não o slug (params: [id, userId, tenantId, ...])
    expect(valuesFor('INSERT INTO sessions')[0]?.[2]).toBe(TENANT_UUID);
    expect(result.tenantId).toBe(TENANT_UUID);
    expect(result.sessionId).toBe('sess-1');
    expect(result.accessToken).toBeTruthy();
    // hash nunca sai na resposta
    expect(result.user).not.toHaveProperty('password_hash');
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  it('aceita passwordHash camel (drivers que convertem o casing)', async () => {
    unsafeResults['SELECT * FROM users WHERE email'] = [
      { id: 'user-2', email: 'c@d.e', passwordHash: 'pbkdf2$...', status: 'ACTIVE' },
    ];
    unsafeResults['SELECT r.slug'] = [{ slug: 'VIEWER' }];
    unsafeResults['INSERT INTO sessions'] = [{ id: 'sess-2' }];

    const service = new AuthService(config);
    const result = await service.login({ email: 'c@d.e', password: 'x', tenantId: 'default' });

    expect(result.accessToken).toBeTruthy();
  });
});
