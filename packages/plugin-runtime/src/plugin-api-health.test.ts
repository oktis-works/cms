// @oktis-works/plugin-runtime - PluginAPI: api.health (Item 14)
//
// Covers health.register permission/dup checks, internal exposure and the
// scope collector. The 2s budget aggregation lives in the API route.

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
    manifest: { name: 'health-plugin', version: '1.0.0' } as PluginApiDependencies['manifest'],
    settings: { get: vi.fn(async () => undefined), set: vi.fn(async () => {}) },
    eventBus: { emit: vi.fn(async () => {}) },
    db: { query: vi.fn(async () => []) },
    getTenantId: () => null,
    getUserId: () => 'user-123',
    getRequestId: () => 'req-456',
    getTenantById: vi.fn(async (id: string) => ({ id, name: 'T', slug: 't' })),
    allowedPermissions: ['health:register'],
    ...overrides,
  } as PluginApiDependencies;
}

describe('api.health (Item 14)', () => {
  it('registers named checks and exposes them via internal.getHealthChecks', () => {
    const { api, internal } = createPluginApi(createDeps());
    const check = () => ({ ok: true });

    api.health.register('queue', check);

    const checks = internal.getHealthChecks();
    expect(checks).toHaveLength(1);
    expect(checks[0]?.name).toBe('queue');
    expect(checks[0]?.check).toBe(check);
  });

  it('denies registration without the health:register permission', () => {
    const { api } = createPluginApi(createDeps({ allowedPermissions: [] }));
    expect(() => api.health.register('x', () => ({ ok: true }))).toThrow(/health:register/);
  });

  it('validates inputs and rejects duplicate names', () => {
    const { api } = createPluginApi(createDeps());
    expect(() => api.health.register('', () => ({ ok: true }))).toThrow(/name/);
    expect(() => api.health.register('x', 'nope' as never)).toThrow(/check function/);

    api.health.register('queue', () => ({ ok: true }));
    expect(() => api.health.register('queue', () => ({ ok: false }))).toThrow(/already registered/);
  });
});
