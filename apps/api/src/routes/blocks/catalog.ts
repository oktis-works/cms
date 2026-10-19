// @oktis-works/api - Editor block catalog helpers (GET /api/v1/blocks)
//
// WordPress-parity item E3: the block catalog is a data plane with no table —
// it merges `manifest.blocks` (static declarations of active plugins) with
// `api.registerBlock` runtime registrations, which only exist while the
// plugin is loaded. Types are namespaced like WordPress (`namespace/block`):
// a bare type gets the plugin name as its namespace, so two plugins never
// collide in the catalog.

import type { PluginBlockManifest } from '@oktis-works/types'

export interface BlockCatalogEntry extends PluginBlockManifest {
  pluginName: string
  source: 'manifest' | 'runtime'
}

/** `product-card` → `my-plugin/product-card`; an already-namespaced `ns/block` stays untouched. */
export function namespaceBlockType(pluginName: string, type: string): string {
  return type.includes('/') ? type : `${pluginName}/${type}`
}

/**
 * Adds one plugin's blocks to the catalog with namespacing and dedupe by
 * namespaced type (malformed entries are dropped — the endpoint never breaks).
 * Call manifest sources first so static declarations win over runtime ones.
 */
export function addPluginBlocks(
  target: BlockCatalogEntry[],
  blocks: readonly PluginBlockManifest[] | undefined | null,
  pluginName: string,
  source: 'manifest' | 'runtime'
): void {
  for (const block of blocks ?? []) {
    if (!block || typeof block.type !== 'string' || block.type.length === 0) continue
    if (typeof block.label !== 'string' || block.label.length === 0) continue
    if (typeof block.adminComponentPath !== 'string' || block.adminComponentPath.length === 0) continue
    const type = namespaceBlockType(pluginName, block.type)
    if (target.some((existing) => existing.type === type)) continue
    target.push({ ...block, type, pluginName, source })
  }
}
