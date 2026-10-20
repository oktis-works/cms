// @oktis-works/core - Lazy field types sync (Item 25)

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

import { fieldTypeExtensionService } from './service.js';
import { listFieldTypes } from './types/registry.js';

beforeEach(() => {
  store.queries = [];
  store.results = [];
});

const row = (overrides: Record<string, unknown> = {}) => ({
  plugin_name: 'p',
  type: 'eager',
  label: 'Eager',
  category: 'conteudo',
  icon: 'box',
  supports_conditions: true,
  is_layout: false,
  admin_component_path: 'p:A',
  admin_renderer_path: null,
  config_schema: null,
  lazy: false,
  ...overrides,
});

describe('syncToRegistry lazy filtering (Item 25)', () => {
  it('skips lazy types by default and includes them with includeLazy', async () => {
    store.results = [[
      row({ type: 'eager' }),
      row({ type: 'lazy', label: 'Lazy', lazy: true }),
    ]];

    await fieldTypeExtensionService.syncToRegistry();
    expect(listFieldTypes().some((type) => type.type === 'lazy')).toBe(false);
    expect(listFieldTypes().some((type) => type.type === 'eager')).toBe(true);

    // first use (GET /field-types) — includeLazy brings the lazy one in
    store.results = [[
      row({ type: 'eager' }),
      row({ type: 'lazy', label: 'Lazy', lazy: true }),
    ]];
    await fieldTypeExtensionService.syncToRegistry({ includeLazy: true });
    expect(listFieldTypes().some((type) => type.type === 'lazy')).toBe(true);
  });
});

describe('register persists the lazy flag (Item 25)', () => {
  it('writes lazy into field_type_extensions', async () => {
    store.results = [[]];
    await fieldTypeExtensionService.register({
      pluginName: 'p',
      type: 'my-lazy',
      label: 'My Lazy',
      category: 'conteudo',
      icon: 'box',
      supportsConditions: true,
      isLayout: false,
      adminComponentPath: 'p:A',
      isPluginType: true,
      lazy: true,
    });

    const insert = store.queries.find((query) => query.text.includes('INSERT INTO field_type_extensions'));
    expect(insert?.values[10]).toBe(true);
    expect(insert?.text).toContain('lazy = EXCLUDED.lazy');
  });
});
