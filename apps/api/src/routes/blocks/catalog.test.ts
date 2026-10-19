// @oktis-works/api - Block catalog helpers (GET /api/v1/blocks)
//
// Covers the E3 data-plane merge: WordPress-style namespacing of bare types,
// dedupe by namespaced type (manifest wins over runtime) and defensive
// handling of malformed entries.

import { describe, it, expect } from 'vitest';
import { addPluginBlocks, namespaceBlockType, type BlockCatalogEntry } from './catalog.js';

const validBlock = {
  type: 'product-card',
  label: 'Product Card',
  icon: 'credit-card',
  adminComponentPath: 'my-plugin:ProductCard',
};

describe('namespaceBlockType', () => {
  it('prefixes bare types with the plugin namespace', () => {
    expect(namespaceBlockType('my-plugin', 'product-card')).toBe('my-plugin/product-card');
  });

  it('keeps already-namespaced types untouched', () => {
    expect(namespaceBlockType('my-plugin', 'acme/product-card')).toBe('acme/product-card');
  });
});

describe('addPluginBlocks', () => {
  it('adds valid blocks with namespacing, pluginName and source', () => {
    const catalog: BlockCatalogEntry[] = [];
    addPluginBlocks(catalog, [validBlock], 'my-plugin', 'manifest');

    expect(catalog).toHaveLength(1);
    expect(catalog[0]?.type).toBe('my-plugin/product-card');
    expect(catalog[0]?.pluginName).toBe('my-plugin');
    expect(catalog[0]?.source).toBe('manifest');
  });

  it('drops malformed entries instead of throwing', () => {
    const catalog: BlockCatalogEntry[] = [];
    addPluginBlocks(
      catalog,
      [
        { type: '', label: 'X', adminComponentPath: 'p:X' } as never,
        { type: 'no-label', adminComponentPath: 'p:Y' } as never,
        { type: 'no-path', label: 'Z' } as never,
        { notABlock: true } as never,
      ],
      'my-plugin',
      'manifest'
    );
    expect(catalog).toHaveLength(0);
  });

  it('dedupes runtime against manifest by namespaced type (manifest wins)', () => {
    const catalog: BlockCatalogEntry[] = [];
    addPluginBlocks(catalog, [validBlock], 'my-plugin', 'manifest');
    addPluginBlocks(catalog, [validBlock], 'my-plugin', 'runtime');
    // a second plugin with the same bare type gets its own namespace
    addPluginBlocks(catalog, [validBlock], 'other-plugin', 'runtime');

    expect(catalog.map((entry) => entry.type)).toEqual([
      'my-plugin/product-card',
      'other-plugin/product-card',
    ]);
    expect(catalog[0]?.source).toBe('manifest');
  });
});
