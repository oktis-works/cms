// @oktis-works/api - Editor pattern catalog helpers (GET /api/v1/patterns)
//
// WordPress-parity item 13 (E4): the pattern catalog is an editor-agnostic
// data plane with no table — it merges `manifest.patterns` (static
// declarations of active plugins) with `api.registerPattern` runtime
// registrations, which only exist while the plugin is loaded. Names are
// namespaced like WordPress patterns (`namespace/name`): a bare name gets
// the plugin name as its namespace, so two plugins never collide.

import type { PluginPatternManifest } from '@oktis-works/types'

export interface PatternCatalogEntry extends PluginPatternManifest {
  pluginName: string
  source: 'manifest' | 'runtime'
}

/** `hero-section` → `my-plugin/hero-section`; an already-namespaced `ns/name` stays untouched. */
export function namespacePatternName(pluginName: string, name: string): string {
  return name.includes('/') ? name : `${pluginName}/${name}`
}

/**
 * Adds one plugin's patterns to the catalog with namespacing and dedupe by
 * namespaced name (malformed entries are dropped — the endpoint never
 * breaks). Call manifest sources first so static declarations win over
 * runtime ones.
 */
export function addPluginPatterns(
  target: PatternCatalogEntry[],
  patterns: readonly PluginPatternManifest[] | undefined | null,
  pluginName: string,
  source: 'manifest' | 'runtime'
): void {
  for (const pattern of patterns ?? []) {
    if (!pattern || typeof pattern.name !== 'string' || pattern.name.length === 0) continue
    if (typeof pattern.label !== 'string' || pattern.label.length === 0) continue
    if (typeof pattern.content !== 'string' || pattern.content.length === 0) continue
    const name = namespacePatternName(pluginName, pattern.name)
    if (target.some((existing) => existing.name === name)) continue
    target.push({ ...pattern, name, pluginName, source })
  }
}
