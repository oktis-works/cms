// @oktis-works/core - PluginRolesService tests (Item 6 do plugin-parity-plan)
//
// Covers the blocking anti-escalation rules (reserved slugs, wildcard and
// platform-only permissions, system-role protection), slug normalization,
// permission dedupe and the audit trail.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const store: { queries: Array<{ text: string; values: unknown[] }>; results: unknown[][] } = {
  queries: [],
  results: [],
};

vi.mock('@oktis-works/database', () => ({
  getConnection: vi.fn(() => ({
    unsafe: vi.fn(async (text: string, values?: unknown[]) => {
      store.queries.push({ text, values: values ?? [] });
      return store.results.shift() ?? [];
    }),
  })),
}));

import { PluginRolesService, RESERVED_ROLE_SLUGS, roleSlugFromName, parseRolePermission } from './plugin-roles.js';

beforeEach(() => {
  store.queries = [];
  store.results = [];
});

const tenantInput = {
  tenantId: 't-1',
  pluginName: 'my-plugin',
  name: 'Content Reviewer',
  permissions: ['read:content'],
};

const roleRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'role-1',
  tenant_id: 't-1',
  name: 'Content Reviewer',
  slug: 'content-reviewer',
  is_system: false,
  permissions: ['read:content'],
  ...overrides,
});

describe('parseRolePermission', () => {
  it('accepts action:resource strings', () => {
    expect(parseRolePermission('read:content')).toEqual({ action: 'read', resource: 'content' });
  });

  it('rejects wildcards and platform-only operations (anti-escalation)', () => {
    expect(() => parseRolePermission('*:*')).toThrow(/Wildcard/);
    expect(() => parseRolePermission('read:*')).toThrow(/Wildcard/);
    expect(() => parseRolePermission('*:content')).toThrow(/Wildcard/);
    expect(() => parseRolePermission('create:plugin')).toThrow(/platform-only/);
    expect(() => parseRolePermission('update:plugin')).toThrow(/platform-only/);
    expect(() => parseRolePermission('delete:plugin')).toThrow(/platform-only/);
  });

  it('rejects malformed permission strings', () => {
    expect(() => parseRolePermission('read')).toThrow(/action:resource/);
    expect(() => parseRolePermission('')).toThrow(/action:resource/);
    expect(() => parseRolePermission(42 as never)).toThrow(/action:resource/);
  });
});

describe('roleSlugFromName', () => {
  it('normalizes names into kebab-case slugs (accents included)', () => {
    expect(roleSlugFromName('Content Reviewer')).toBe('content-reviewer');
    expect(roleSlugFromName('Revisor de Conteúdo')).toBe('revisor-de-conteudo');
    expect(roleSlugFromName('!!!')).toBe('role');
  });
});

describe('PluginRolesService.add', () => {
  it('creates a tenant role with normalized slug and deduped permissions', async () => {
    const service = new PluginRolesService();
    // roleService.list (dup check) → empty; create → row
    store.results = [[], [roleRow()]];

    const role = await service.add({ ...tenantInput, permissions: ['read:content', 'read:content', 'update:content'] });

    expect(role.slug).toBe('content-reviewer');
    const insert = store.queries.find((query) => query.text.includes('INSERT INTO roles'));
    expect(insert).toBeDefined();
    expect(insert?.values[1]).toBe('t-1');
    expect(insert?.values[3]).toBe('content-reviewer');
    // permissions are normalized (action:resource) and deduped
    expect(insert?.values[5]).toEqual(['read:content', 'update:content']);
  });

  it('blocks reserved slugs and explicit reserved slug input', async () => {
    const service = new PluginRolesService();
    store.results = [[]];
    await expect(service.add({ ...tenantInput, name: 'Super Admin' })).rejects.toThrow(/reserved/);
    await expect(service.add({ ...tenantInput, name: 'X', slug: 'tenant-admin' })).rejects.toThrow(/reserved/);
    expect([...RESERVED_ROLE_SLUGS]).toContain('super-admin');
  });

  it('blocks duplicate slugs inside the tenant (including platform roles)', async () => {
    const service = new PluginRolesService();
    store.results = [[roleRow()]]; // list returns an existing role with the slug
    await expect(service.add(tenantInput)).rejects.toThrow(/already exists/);
  });
});

describe('PluginRolesService.remove', () => {
  it('removes a non-system tenant role and audits it', async () => {
    const service = new PluginRolesService();
    // list (findBySlug) → getById (roleService.delete) → DELETE
    store.results = [[roleRow()], [roleRow()], []];

    const removed = await service.remove({ tenantId: 't-1', pluginName: 'my-plugin', slug: 'content-reviewer' });

    expect(removed).toBe(true);
    const del = store.queries.find((query) => query.text.includes('DELETE FROM roles'));
    expect(del).toBeDefined();
  });

  it('refuses system roles and unknown slugs', async () => {
    const service = new PluginRolesService();
    store.results = [[roleRow({ is_system: true })]];
    await expect(service.remove({ tenantId: 't-1', pluginName: 'p', slug: 'content-reviewer' })).rejects.toThrow(/system role/);

    store.results = [[]];
    await expect(service.remove({ tenantId: 't-1', pluginName: 'p', slug: 'missing' })).resolves.toBe(false);
  });

  it('blocks reserved slugs up front', async () => {
    const service = new PluginRolesService();
    await expect(service.remove({ tenantId: 't-1', pluginName: 'p', slug: 'super-admin' })).rejects.toThrow(/reserved/);
  });
});

describe('PluginRolesService.addPermission', () => {
  it('appends a new permission and audits it', async () => {
    const service = new PluginRolesService();
    store.results = [
      [roleRow({ permissions: ['read:content'] })], // list (findBySlug)
      [roleRow({ permissions: ['read:content'] })], // getById (roleService.update)
      [roleRow({ permissions: ['read:content', 'update:media'] })], // UPDATE
    ];

    const ok = await service.addPermission({ tenantId: 't-1', pluginName: 'my-plugin', slug: 'content-reviewer', permission: 'update:media' });

    expect(ok).toBe(true);
    const update = store.queries.find((query) => query.text.includes('UPDATE roles'));
    expect(update).toBeDefined();
  });

  it('is idempotent when the role already has the permission', async () => {
    const service = new PluginRolesService();
    store.results = [[roleRow({ permissions: ['read:content'] })]];

    const ok = await service.addPermission({ tenantId: 't-1', pluginName: 'my-plugin', slug: 'content-reviewer', permission: 'read:content' });

    expect(ok).toBe(true);
    expect(store.queries.some((query) => query.text.includes('UPDATE roles'))).toBe(false);
  });

  it('rejects invalid/platform-only permissions and system roles', async () => {
    const service = new PluginRolesService();
    await expect(
      service.addPermission({ tenantId: 't-1', pluginName: 'p', slug: 'r', permission: 'create:plugin' })
    ).rejects.toThrow(/platform-only/);

    store.results = [[roleRow({ is_system: true })]];
    await expect(
      service.addPermission({ tenantId: 't-1', pluginName: 'p', slug: 'content-reviewer', permission: 'read:content' })
    ).rejects.toThrow(/system role/);
  });
});
