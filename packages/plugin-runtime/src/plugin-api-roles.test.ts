// @oktis-works/plugin-runtime - PluginAPI: api.roles (Item 6)
//
// Covers the plugin-facing surface only (permission gate, tenant-scope
// requirement, backend delegation). The anti-escalation rules themselves
// live in core PluginRolesService and are covered there.

import { describe, it, expect, vi } from 'vitest';
import { createPluginApi, type PluginApiDependencies } from './plugin-api.js';

function createDeps(overrides: Partial<PluginApiDependencies> = {}): PluginApiDependencies {
  return {
    hooks: {
      addAction: vi.fn(),
      addFilter: vi.fn(),
      removeAction: vi.fn(() => false),
      removeFilter: vi.fn(() => false),
      hasAction: vi.fn(() => false),
      hasFilter: vi.fn(() => false),
      didAction: vi.fn(() => 0),
      getCurrentHook: vi.fn(() => null),
    },
    manifest: { name: 'roles-plugin', version: '1.0.0' } as PluginApiDependencies['manifest'],
    settings: { get: vi.fn(async () => undefined), set: vi.fn(async () => {}) },
    eventBus: { emit: vi.fn(async () => {}) },
    db: { query: vi.fn(async () => []) },
    getTenantId: () => 'tenant-abc',
    getUserId: () => 'user-123',
    getRequestId: () => 'req-456',
    getTenantById: vi.fn(async (id: string) => ({ id, name: 'T', slug: 't' })),
    allowedPermissions: ['roles:create'],
    roles: {
      add: vi.fn(async (input) => ({ id: 'role-1', name: input.name, slug: 'reviewer', permissions: [] })),
      remove: vi.fn(async () => true),
      addPermission: vi.fn(async () => true),
    },
    ...overrides,
  } as PluginApiDependencies;
}

describe('api.roles (Item 6)', () => {
  it('delegates add/remove/addPermission to the core backend with tenant + plugin context', async () => {
    const deps = createDeps();
    const { api } = createPluginApi(deps);

    const role = await api.roles.add({ name: 'Reviewer', permissions: ['read:content'] });
    expect(role.slug).toBe('reviewer');
    expect(deps.roles!.add).toHaveBeenCalledWith({
      tenantId: 'tenant-abc',
      pluginName: 'roles-plugin',
      name: 'Reviewer',
      slug: undefined,
      permissions: ['read:content'],
    });

    await api.roles.remove('reviewer');
    expect(deps.roles!.remove).toHaveBeenCalledWith({ tenantId: 'tenant-abc', pluginName: 'roles-plugin', slug: 'reviewer' });

    await api.roles.addPermission('reviewer', 'update:content');
    expect(deps.roles!.addPermission).toHaveBeenCalledWith({
      tenantId: 'tenant-abc',
      pluginName: 'roles-plugin',
      slug: 'reviewer',
      permission: 'update:content',
    });
  });

  it('denies operations without the roles:create permission', async () => {
    const { api } = createPluginApi(createDeps({ allowedPermissions: [] }));
    await expect(api.roles.add({ name: 'X' })).rejects.toThrow(/roles:create/);
    await expect(api.roles.remove('x')).rejects.toThrow(/roles:create/);
    await expect(api.roles.addPermission('x', 'read:content')).rejects.toThrow(/roles:create/);
  });

  it('refuses to run outside a tenant scope (platform plugins)', async () => {
    const { api } = createPluginApi(createDeps({ getTenantId: () => null }));
    await expect(api.roles.add({ name: 'X' })).rejects.toThrow(/tenant scope/);
    await expect(api.roles.remove('x')).rejects.toThrow(/tenant scope/);
  });

  it('fails with a clear error when the backend is not wired', async () => {
    const deps = createDeps();
    delete (deps as { roles?: unknown }).roles;
    const { api } = createPluginApi(deps);
    await expect(api.roles.add({ name: 'X' })).rejects.toThrow(/backend not wired/);
  });

  it('validates required inputs before touching the backend', async () => {
    const deps = createDeps();
    const { api } = createPluginApi(deps);
    await expect(api.roles.add({ name: '  ' })).rejects.toThrow(/name/);
    await expect(api.roles.remove('')).rejects.toThrow(/slug/);
    await expect(api.roles.addPermission('reviewer', '')).rejects.toThrow(/action:resource/);
    expect(deps.roles!.add).not.toHaveBeenCalled();
  });
});
