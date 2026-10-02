// @oktis-works/core - Catálogo de hooks (REQU-035-002)

import { describe, it, expect, beforeEach } from 'vitest';
import { HookRegistry, setHookRegistry } from '@oktis-works/plugin-runtime';
import { HOOK_POINTS } from './points.js';
import { getHookCatalog } from './catalog.js';

beforeEach(() => {
  setHookRegistry(new HookRegistry());
});

describe('getHookCatalog', () => {
  it('inclui pontos estáticos do core mesmo sem registros', () => {
    const catalog = getHookCatalog();

    expect(catalog.entries.some((e) => e.hook === HOOK_POINTS.ADMIN_MENU)).toBe(true);
    expect(catalog.entries.some((e) => e.hook === HOOK_POINTS.THEME_HEAD)).toBe(true);
    expect(catalog.total).toBeGreaterThan(5);
  });

  it('materializa pontos parametrizados e reflete registros do registry', () => {
    const registry = new HookRegistry();
    registry.addAction(HOOK_POINTS.AFTER_SAVE_CONTENT('page'), () => undefined, { sourceId: 'seo-plugin' });
    registry.addFilter(HOOK_POINTS.THEME_DATA('posts'), (v) => v, { sourceId: 'seo-plugin' });
    registry.addFilter('theme:data:custom_hook', (v) => v, { sourceId: 'outro' });
    setHookRegistry(registry);

    const catalog = getHookCatalog();
    const save = catalog.entries.find((e) => e.hook.startsWith('after_save_content_'))!;
    const themePosts = catalog.entries.find((e) => e.hook === 'theme:data:posts')!;
    const custom = catalog.entries.find((e) => e.hook === 'theme:data:custom_hook')!;

    expect(save.registered).toBe(true);
    expect(save.sources).toContain('seo-plugin');
    expect(themePosts.type).toBe('filter');
    expect(custom.registered).toBe(true);
    expect(catalog.entries.every((e) => typeof e.total === 'number')).toBe(true);
  });

  it('catálogo ordenado por hook e com timestamp', () => {
    const names = getHookCatalog().entries.map((e) => e.hook);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });
});
