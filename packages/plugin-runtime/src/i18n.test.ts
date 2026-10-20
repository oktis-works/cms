// @oktis-works/plugin-runtime - api.i18n tests (Item 9)
//
// Covers the fallback chain, {param} interpolation, bundle merging, the
// api.i18n surface and the manifest locales[] boot loading.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { bootstrapPlugins, resetLoadedPlugins } from './bootstrap.js';
import { HookRegistry } from './hook-registry.js';
import { createPluginApi, type PluginApiDependencies } from './plugin-api.js';
import { i18nFallbackChain, i18nInterpolate } from './i18n.js';

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
    manifest: { name: 'i18n-plugin', version: '1.0.0' } as PluginApiDependencies['manifest'],
    settings: { get: vi.fn(async () => undefined), set: vi.fn(async () => {}) },
    eventBus: { emit: vi.fn(async () => {}) },
    db: { query: vi.fn(async () => []) },
    getTenantId: () => null,
    getUserId: () => 'user-123',
    getRequestId: () => 'req-456',
    getTenantById: vi.fn(async (id: string) => ({ id, name: 'T', slug: 't' })),
    allowedPermissions: [],
    ...overrides,
  } as PluginApiDependencies;
}

describe('i18nFallbackChain', () => {
  it('builds locale → base language → en chains without duplicates', () => {
    expect(i18nFallbackChain('pt-BR')).toEqual(['pt-BR', 'pt', 'en']);
    expect(i18nFallbackChain('en')).toEqual(['en']);
    expect(i18nFallbackChain('fr')).toEqual(['fr', 'en']);
  });
});

describe('i18nInterpolate', () => {
  it('replaces {token} placeholders and keeps unknown ones', () => {
    expect(i18nInterpolate('Hello {name}, you have {count} items', { name: 'Ada', count: 3 })).toBe(
      'Hello Ada, you have 3 items'
    );
    expect(i18nInterpolate('Hi {missing}', {})).toBe('Hi {missing}');
    expect(i18nInterpolate('No params')).toBe('No params');
  });
});

describe('api.i18n (Item 9)', () => {
  it('translates through the fallback chain with interpolation', () => {
    const { api } = createPluginApi(createDeps());
    api.i18n.load('pt-BR', { 'greeting.hello': 'Olá {name}!' });
    api.i18n.load('pt', { 'greeting.bye': 'Tchau!' });
    api.i18n.load('en', { 'greeting.hello': 'Hello {name}!' });

    expect(api.i18n.translate('greeting.hello', { name: 'Ada' }, 'pt-BR')).toBe('Olá Ada!');
    // pt-BR bundle misses the key → falls back to pt
    expect(api.i18n.translate('greeting.bye', undefined, 'pt-BR')).toBe('Tchau!');
    // unknown everywhere → key itself
    expect(api.i18n.translate('greeting.missing')).toBe('greeting.missing');
    // explicit locale not loaded → falls back to en bundle
    expect(api.i18n.translate('greeting.hello', { name: 'Ada' }, 'fr')).toBe('Hello Ada!');
  });

  it('merges later loads over earlier ones and respects the default locale', () => {
    const { api } = createPluginApi(createDeps());
    expect(api.i18n.locale()).toBe('en');

    api.i18n.load('en', { 'btn.save': 'Save' });
    api.i18n.load('en', { 'btn.save': 'Save changes', 'btn.cancel': 'Cancel' });
    expect(api.i18n.translate('btn.save')).toBe('Save changes');
    expect(api.i18n.translate('btn.cancel')).toBe('Cancel');

    api.i18n.setDefaultLocale('pt-BR');
    api.i18n.load('pt-BR', { 'btn.save': 'Salvar' });
    expect(api.i18n.locale()).toBe('pt-BR');
    expect(api.i18n.translate('btn.save')).toBe('Salvar');
  });

  it('validates load/setDefaultLocale inputs', () => {
    const { api } = createPluginApi(createDeps());
    expect(() => api.i18n.load('', { a: 'b' })).toThrow(/locale/);
    expect(() => api.i18n.load('en', ['x'] as never)).toThrow(/bundle/);
    expect(() => api.i18n.load('en', { a: 42 } as never)).toThrow(/must be a string/);
    expect(() => api.i18n.setDefaultLocale('')).toThrow(/locale/);
  });
});

describe('manifest locales[] boot loading (Item 9)', () => {
  let pluginsDir: string;
  let registry: HookRegistry;

  beforeEach(() => {
    pluginsDir = mkdtempSync(join(tmpdir(), 'bl-i18n-'));
    registry = new HookRegistry();
    resetLoadedPlugins(registry);
  });

  afterEach(() => {
    resetLoadedPlugins(registry);
    rmSync(pluginsDir, { recursive: true, force: true });
  });

  it('loads locale files before register() and translate() works at boot', async () => {
    const dir = join(pluginsDir, 'i18n-plugin');
    mkdirSync(join(dir, 'locales'), { recursive: true });
    writeFileSync(
      join(dir, 'manifest.json'),
      JSON.stringify({
        name: 'i18n-plugin',
        version: '1.0.0',
        main: 'index.js',
        locales: ['locales/pt-BR.json', 'locales/missing-file.json'],
      })
    );
    writeFileSync(join(dir, 'locales', 'pt-BR.json'), JSON.stringify({ 'welcome.message': 'Bem-vindo, {name}!' }));
    writeFileSync(
      join(dir, 'index.js'),
      `
      export async function register(api) {
        api.i18n.setDefaultLocale('pt-BR');
        globalThis.__i18nBootProbe = api.i18n.translate('welcome.message', { name: 'Ada' });
      }
      `
    );

    const sql = { unsafe: vi.fn(async () => [{ name: 'i18n-plugin' }]) };
    const result = await bootstrapPlugins({ pluginsDir, sql, registry, apiDeps: createDeps() });

    expect(result.loaded).toContain('i18n-plugin');
    expect((globalThis as Record<string, unknown>)['__i18nBootProbe']).toBe('Bem-vindo, Ada!');
    delete (globalThis as Record<string, unknown>)['__i18nBootProbe'];
  });
});
