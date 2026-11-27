import { describe, expect, it, vi } from 'vitest';

const { verifyToken, runWithTenantTransaction, runWithTenantContext } = vi.hoisted(() => ({
  verifyToken: vi.fn(),
  runWithTenantTransaction: vi.fn(async (_tenantId: string, fn: () => Promise<unknown>, _userId?: string) => fn()),
  runWithTenantContext: vi.fn((_context: unknown, fn: () => Promise<unknown>) => fn()),
}));

vi.mock('@oktis-works/auth', () => ({ AuthService: class { verifyToken = verifyToken; } }));
vi.mock('@oktis-works/config', () => ({ loadConfig: () => ({ auth: {} }) }));
vi.mock('@oktis-works/database', () => ({ runWithTenantTransaction }));
vi.mock('@oktis-works/core', () => ({ runWithTenantContext }));
vi.mock('hono/cookie', () => ({ getCookie: () => undefined }));

import { authMiddleware } from './auth.js';

describe('API authentication context', () => {
  it('establishes Core and database tenant/user context from the signed token', async () => {
    verifyToken.mockResolvedValue({ sub: 'user-a', email: 'a@example.com', tenantId: 'tenant-a', roles: ['TENANT_ADMIN'] });
    const context = {
      req: { header: (name: string) => name === 'Authorization' ? 'Bearer token' : undefined },
      set: vi.fn(),
      json: vi.fn(),
    };
    const next = vi.fn(async () => undefined);

    await authMiddleware(context as never, next);

    expect(runWithTenantContext).toHaveBeenCalledWith({ tenantId: 'tenant-a', userId: 'user-a' }, expect.any(Function));
    expect(runWithTenantTransaction).toHaveBeenCalledWith('tenant-a', expect.any(Function), 'user-a');
    expect(next).toHaveBeenCalledOnce();
  });
});
