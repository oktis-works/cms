// @oktis-works/plugin-runtime - PluginAPI audit trail (Item 18)
//
// Covers the sensitive-operation audit surface: write queries are audited
// (reads are not), route registrations and job operations are audited, and
// audit failures never break the plugin operation.

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
    manifest: { name: 'audit-plugin', version: '1.0.0' } as PluginApiDependencies['manifest'],
    settings: { get: vi.fn(async () => undefined), set: vi.fn(async () => {}) },
    eventBus: { emit: vi.fn(async () => {}) },
    db: { query: vi.fn(async () => []) },
    getTenantId: () => 'tenant-abc',
    getUserId: () => 'user-123',
    getRequestId: () => 'req-456',
    getTenantById: vi.fn(async (id: string) => ({ id, name: 'T', slug: 't' })),
    allowedPermissions: ['db:query', 'routes:register', 'jobs:schedule'],
    jobs: {
      schedule: vi.fn(async () => true),
      cancel: vi.fn(async () => true),
      enqueue: vi.fn(async () => true),
    },
    audit: {
      record: vi.fn(async () => {}),
    },
    ...overrides,
  } as PluginApiDependencies;
}

describe('plugin operation audit (Item 18)', () => {
  it('audits write queries with the truncated statement, not reads', async () => {
    const deps = createDeps();
    const { api } = createPluginApi(deps);

    await api.query('INSERT INTO notes VALUES ($1)', ['x']);
    await api.query('SELECT * FROM notes');

    const recorded = (deps.audit!.record as ReturnType<typeof vi.fn>).mock.calls.map(
      (call) => call[0] as { action: string }
    );
    expect(recorded).toEqual([expect.objectContaining({ action: 'plugin.db.query' })]);
    expect(deps.audit!.record).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-abc',
        resourceType: 'db',
        changes: expect.objectContaining({ statement: 'INSERT INTO notes VALUES ($1)', paramsCount: 1 }),
      })
    );
  });

  it('audits route registrations', () => {
    const deps = createDeps();
    const { api } = createPluginApi(deps);

    api.addRoute({ method: 'GET', path: '/webhook', handler: async () => new Response('{}') });

    expect(deps.audit!.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'plugin.route.register',
        resourceType: 'route',
        changes: expect.objectContaining({ method: 'GET', path: '/webhook' }),
      })
    );
  });

  it('audits successful job operations only (queue down → no audit)', async () => {
    const deps = createDeps();
    const { api } = createPluginApi(deps);

    await api.jobs.schedule('nightly', { every: 60_000 });
    await api.jobs.enqueue('nightly', { run: 1 });
    await api.jobs.cancel('nightly');

    const actions = (deps.audit!.record as ReturnType<typeof vi.fn>).mock.calls.map(
      (call) => (call[0] as { action: string }).action
    );
    expect(actions).toEqual(['plugin.jobs.schedule', 'plugin.jobs.enqueue', 'plugin.jobs.cancel']);

    // queue unavailable → operation degrades to false and nothing is audited
    const noQueue = createDeps({ jobs: undefined });
    const api2 = createPluginApi(noQueue).api;
    await expect(api2.jobs.enqueue('nightly', {})).resolves.toBe(false);
    expect(noQueue.audit!.record).not.toHaveBeenCalled();
  });

  it('never blocks the operation when auditing fails', async () => {
    const deps = createDeps({
      audit: { record: vi.fn(async () => { throw new Error('audit down'); }) },
    });
    const { api } = createPluginApi(deps);

    await expect(api.query('DELETE FROM notes')).resolves.toEqual([]);
    expect(deps.db.query).toHaveBeenCalled();
  });
});
