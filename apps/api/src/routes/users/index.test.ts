// @oktis-works/api - rotas /users: papéis, senha e lista com roles

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../middleware/auth.js', () => ({
  authMiddleware: async (_c: unknown, next: () => Promise<void>) => next(),
  requirePermission: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('@oktis-works/database', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@oktis-works/database')>();
  return { ...actual, resolveTenantId: vi.fn(async (slug: string) => `uuid-of-${slug}`) };
});

vi.mock('@oktis-works/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@oktis-works/core')>();
  return {
    ...actual,
    userService: {
      list: vi.fn(),
      getById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      updatePassword: vi.fn(),
      getRoleById: vi.fn(),
      rolesFor: vi.fn(),
      rolesForUsers: vi.fn(),
      addToTenant: vi.fn(),
      removeFromTenant: vi.fn(),
    },
  };
});

import usersRouter from './index.js';
import { userService } from '@oktis-works/core';

const svc = () => vi.mocked(userService);

beforeEach(() => vi.clearAllMocks());

describe('GET /users', () => {
  it('anexa os papéis de cada usuário (1 query batch)', async () => {
    svc().list.mockResolvedValue({
      data: [
        { id: 'u1', email: 'a@a.a', name: 'A' } as never,
        { id: 'u2', email: 'b@b.b', name: 'B' } as never,
      ],
      total: 2,
    });
    svc().rolesForUsers.mockResolvedValue({ u1: ['TENANT_ADMIN'], u2: [] });

    const res = await usersRouter.request('/');
    const body = (await res.json()) as { data: Array<{ id: string; roles: string[] }> };

    expect(res.status).toBe(200);
    expect(body.data[0]!.roles).toEqual(['TENANT_ADMIN']);
    expect(body.data[1]!.roles).toEqual([]);
    expect(svc().rolesForUsers).toHaveBeenCalledWith(['u1', 'u2'], 'uuid-of-default');
  });
});

describe('GET /users/:id', () => {
  it('retorna o usuário com roles', async () => {
    svc().getById.mockResolvedValue({ id: 'u1', email: 'a@a.a' } as never);
    svc().rolesFor.mockResolvedValue(['EDITOR']);

    const res = await usersRouter.request('/u1');
    const body = (await res.json()) as { roles: string[] };

    expect(res.status).toBe(200);
    expect(body.roles).toEqual(['EDITOR']);
  });
});

describe('POST /users/:id/roles', () => {
  it('atribui o papel no tenant do JWT (upsert no backend)', async () => {
    svc().getById.mockResolvedValue({ id: 'u1' } as never);
    svc().getRoleById.mockResolvedValue({ id: 'role-1', name: 'Editor', slug: 'EDITOR' });
    svc().addToTenant.mockResolvedValue(undefined);
    svc().rolesFor.mockResolvedValue(['EDITOR']);

    const res = await usersRouter.request('/u1/roles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roleId: 'role-1' }),
    });
    const body = (await res.json()) as { success: boolean; roles: string[] };

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true, roles: ['EDITOR'] });
    expect(svc().addToTenant).toHaveBeenCalledWith('u1', 'uuid-of-default', 'role-1');
  });

  it('role inexistente → 404', async () => {
    svc().getById.mockResolvedValue({ id: 'u1' } as never);
    svc().getRoleById.mockResolvedValue(null);

    const res = await usersRouter.request('/u1/roles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roleId: 'nope' }),
    });

    expect(res.status).toBe(404);
    expect(svc().addToTenant).not.toHaveBeenCalled();
  });

  it('sem roleId → 400', async () => {
    const res = await usersRouter.request('/u1/roles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });
});

describe('DELETE /users/:id/roles/:roleId', () => {
  it('remove o papel específico (mantém os demais)', async () => {
    svc().getById.mockResolvedValue({ id: 'u1' } as never);
    svc().removeFromTenant.mockResolvedValue(undefined);
    svc().rolesFor.mockResolvedValue([]);

    const res = await usersRouter.request('/u1/roles/role-1', { method: 'DELETE' });

    expect(res.status).toBe(200);
    expect(svc().removeFromTenant).toHaveBeenCalledWith('u1', 'uuid-of-default', 'role-1');
  });
});

describe('PUT /users/:id/password', () => {
  it('senha curta → 400 sem tocar no service', async () => {
    const res = await usersRouter.request('/u1/password', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: '1234567' }),
    });

    expect(res.status).toBe(400);
    expect(svc().updatePassword).not.toHaveBeenCalled();
  });

  it('senha válida → hashea e atualiza', async () => {
    svc().updatePassword.mockResolvedValue(true);

    const res = await usersRouter.request('/u1/password', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'segura123' }),
    });

    expect(res.status).toBe(200);
    expect(svc().updatePassword).toHaveBeenCalledWith('u1', expect.any(String));
    expect(svc().updatePassword.mock.calls[0]?.[1]).not.toBe('segura123');
  });
});
