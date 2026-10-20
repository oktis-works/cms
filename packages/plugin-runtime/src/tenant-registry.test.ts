// @oktis-works/plugin-runtime - Store de registries por tenant (WP3)
//
// Contrato de isolamento: hooks registrados num tenant nunca aparecem em outro
// nor in the platform scope; resolution is synchronous via the tenant resolver (the core
// ALS) and invalidation unloads the whole tenant.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  HookRegistry,
  getHookRegistry,
  getHookRegistryStore,
  setHookRegistry,
  setHookRegistryStore,
  setHookTenantResolver,
  getCurrentHookTenantId,
} from './hook-registry.js';

let previousResolver: () => string | null;

beforeEach(() => {
  previousResolver = () => null;
  setHookTenantResolver(() => null);
  setHookRegistryStore(null);
});

afterEach(() => {
  setHookTenantResolver(previousResolver);
  setHookRegistryStore(null);
});

describe('HookRegistryStore', () => {
  it('sem contexto de tenant → registry platform', () => {
    expect(getHookRegistry()).toBe(getHookRegistryStore().platform());
    expect(getCurrentHookTenantId()).toBeNull();
  });

  it('with a tenant context → the tenant registry (not platform)', () => {
    const store = getHookRegistryStore();
    setHookTenantResolver(() => 'tenant-a');

    const resolved = getHookRegistry();
    expect(resolved).toBe(store.tenant('tenant-a'));
    expect(resolved).not.toBe(store.platform());
  });

  it('hooks of one tenant never leak into another nor into platform', () => {
    const store = getHookRegistryStore();
    const tenantA = store.tenant('tenant-a');
    const tenantB = store.tenant('tenant-b');

    tenantA.addFilter('plugin.a:filter', (value: unknown) => `${String(value)}-a`);
    tenantA.addAction('plugin.a:action', () => {});

    expect(tenantB.hasFilter('plugin.a:filter')).toBe(false);
    expect(tenantB.hasAction('plugin.a:action')).toBe(false);
    expect(store.platform().hasFilter('plugin.a:filter')).toBe(false);

    expect(tenantA.applyFilters('plugin.a:filter', 'x')).toBe('x-a');
    expect(tenantB.applyFilters('plugin.a:filter', 'x')).toBe('x');
  });

  it('invalidateTenant descarrega o tenant inteiro e devolve true', () => {
    const store = getHookRegistryStore();
    const tenantA = store.tenant('tenant-a');
    tenantA.addFilter('plugin.a:filter', (value: unknown) => value);
    expect(store.hasTenant('tenant-a')).toBe(true);

    expect(store.invalidateTenant('tenant-a')).toBe(true);
    expect(store.hasTenant('tenant-a')).toBe(false);
    expect(store.invalidateTenant('tenant-a')).toBe(false);

    // recriado sob demanda, sem os hooks antigos
    expect(store.tenant('tenant-a').hasFilter('plugin.a:filter')).toBe(false);
  });

  it('setPlatform troca o platform preservando tenants', () => {
    const store = getHookRegistryStore();
    store.tenant('tenant-a').addFilter('plugin.a:filter', (v: unknown) => v);
    const replacement = new HookRegistry();
    store.setPlatform(replacement);

    expect(store.platform()).toBe(replacement);
    expect(getHookRegistry()).toBe(replacement);
    expect(store.tenant('tenant-a').hasFilter('plugin.a:filter')).toBe(true);
  });

  it('setHookRegistry (compat) substitui o platform', () => {
    const custom = new HookRegistry();
    setHookRegistry(custom);
    expect(getHookRegistry()).toBe(custom);
    expect(getHookRegistryStore().platform()).toBe(custom);
  });

  it('tenant registry creation inherits devMode and the pending catalog', () => {
    const store = getHookRegistryStore();
    store.setKnownHooks(['content:query', 'theme:data:*']);
    const tenant = store.tenant('tenant-a');

    expect(() => tenant.addAction('content:query', () => {})).not.toThrow();
    expect(() => tenant.addAction('theme:data:posts', () => {})).not.toThrow();
    // customizado sem prefixo continua proibido em dev
    expect(() => tenant.addAction('random:hook', () => {})).toThrow('prefixed');
  });
});

describe('catalog allowlist in dev mode (WP1)', () => {
  it('without a catalog, an official core name fails in dev', () => {
    const registry = new HookRegistry();
    registry.setDevMode(true);
    expect(() => registry.addAction('content:query', () => {})).toThrow('prefixed');
  });

  it('with a catalog, official names pass and custom ones stay blocked', () => {
    const registry = new HookRegistry();
    registry.setDevMode(true);
    registry.setKnownHooks([
      'content:query',
      'after_publish_content_*',
      'theme:data:*',
      'manage:*',
    ]);

    expect(() => registry.addAction('content:query', () => {})).not.toThrow();
    expect(() => registry.addAction('after_publish_content_post', () => {})).not.toThrow();
    expect(() => registry.addFilter('theme:data:posts', (v: unknown) => v)).not.toThrow();
    expect(() => registry.addAction('manage:post:columns', () => {})).not.toThrow();

    expect(() => registry.addAction('meu:hook:inventado', () => {})).toThrow('prefixed');
    expect(registry.isKnownHook('theme:data:pages')).toBe(true);
    expect(registry.isKnownHook('theme:outros')).toBe(false);
  });

  it('prefixos com * viram prefixo; nomes exatos casam exatamente', () => {
    const registry = new HookRegistry();
    registry.setKnownHooks(['okcms.x*', 'okcms.exato']);

    expect(registry.isKnownHook('okcms.xfoo')).toBe(true);
    expect(registry.isKnownHook('okcms.exato')).toBe(true);
    expect(registry.isKnownHook('okcms.exatoo')).toBe(false);
  });

  it('clearKnownHooks removes the catalog', () => {
    const registry = new HookRegistry();
    registry.setDevMode(true);
    registry.setKnownHooks(['content:query']);
    expect(() => registry.addAction('content:query', () => {})).not.toThrow();
    registry.clearKnownHooks();
    expect(() => registry.addAction('content:query', () => {})).toThrow('prefixed');
  });

  it('in production (devMode off) any name is still accepted', () => {
    const registry = new HookRegistry();
    expect(registry.getAuditLog).toBeDefined();
    expect(() => registry.addAction('qualquer:hok', () => {})).not.toThrow();
  });
});
