// @oktis-works/api - Pattern catalog helpers (GET /api/v1/patterns)
//
// Covers the E4 data-plane merge: WordPress-style namespacing of bare names,
// dedupe by namespaced name (manifest wins over runtime) and defensive
// handling of malformed entries.

import { describe, it, expect } from 'vitest';
import { addPluginPatterns, namespacePatternName, type PatternCatalogEntry } from './catalog.js';

const validPattern = {
  name: 'hero-section',
  label: 'Hero Section',
  content: '<section class="hero"></section>',
};

describe('namespacePatternName', () => {
  it('prefixes bare names with the plugin namespace', () => {
    expect(namespacePatternName('my-plugin', 'hero-section')).toBe('my-plugin/hero-section');
  });

  it('keeps already-namespaced names untouched', () => {
    expect(namespacePatternName('my-plugin', 'acme/hero-section')).toBe('acme/hero-section');
  });
});

describe('addPluginPatterns', () => {
  it('adds valid patterns with namespacing, pluginName and source', () => {
    const catalog: PatternCatalogEntry[] = [];
    addPluginPatterns(catalog, [validPattern], 'my-plugin', 'manifest');

    expect(catalog).toHaveLength(1);
    expect(catalog[0]?.name).toBe('my-plugin/hero-section');
    expect(catalog[0]?.pluginName).toBe('my-plugin');
    expect(catalog[0]?.source).toBe('manifest');
  });

  it('drops malformed entries instead of throwing', () => {
    const catalog: PatternCatalogEntry[] = [];
    addPluginPatterns(
      catalog,
      [
        { name: '', label: 'X', content: 'c' } as never,
        { name: 'no-label', content: 'c' } as never,
        { name: 'no-content', label: 'Z' } as never,
        { notAPattern: true } as never,
      ],
      'my-plugin',
      'manifest'
    );
    expect(catalog).toHaveLength(0);
  });

  it('dedupes runtime against manifest by namespaced name (manifest wins)', () => {
    const catalog: PatternCatalogEntry[] = [];
    addPluginPatterns(catalog, [validPattern], 'my-plugin', 'manifest');
    addPluginPatterns(catalog, [validPattern], 'my-plugin', 'runtime');
    // a second plugin with the same bare name gets its own namespace
    addPluginPatterns(catalog, [validPattern], 'other-plugin', 'runtime');

    expect(catalog.map((entry) => entry.name)).toEqual([
      'my-plugin/hero-section',
      'other-plugin/hero-section',
    ]);
    expect(catalog[0]?.source).toBe('manifest');
  });
});
