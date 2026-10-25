// @oktis-works/api - Editor pattern catalog route (GET /api/v1/patterns)
//
// WordPress-parity item 13 (E4) — editor-agnostic data plane endpoint:
// merges `manifest.patterns` from active plugins with runtime
// `api.registerPattern` registrations (platform + tenant scopes). No table:
// entries exist while the plugin is active. RBAC: reading the catalog
// requires `read content` (same gate as the block catalog).

import { Hono } from 'hono'
import { pluginService, ensureTenantPluginsLoaded, getPluginPatterns } from '@oktis-works/core'
import { authMiddleware, requirePermission } from '../../middleware/auth.js'
import type { PluginManifest } from '@oktis-works/types'
import { isPluginActive } from '../plugins/extensions.js'
import { addPluginPatterns, type PatternCatalogEntry } from './catalog.js'

const patterns = new Hono()

patterns.use('*', authMiddleware)

// GET /patterns — pattern catalog for the editor (manifest + runtime, no table)
patterns.get('/', requirePermission('read', 'content'), async (c) => {
  try {
    const userRoles = c.get('userRoles')
    const sessionTenant = c.get('tenantId')
    const tenantId = userRoles.includes('SUPER_ADMIN') ? c.req.query('tenantId') ?? sessionTenant : sessionTenant

    const catalog: PatternCatalogEntry[] = []

    const rows = await pluginService.list(tenantId)
    for (const row of rows) {
      if (!isPluginActive(row.status)) continue
      const manifest = row.manifest as (PluginManifest & { permissions?: string[] }) | undefined | null
      if (manifest?.permissions?.includes('patterns:register')) addPluginPatterns(catalog, manifest.patterns, row.name, 'manifest')
    }

    // Runtime registrations — best-effort: keep serving the manifest when the
    // runtime is unavailable (mirrors GET /plugins/extensions).
    if (tenantId) {
      try {
        await ensureTenantPluginsLoaded(tenantId)
      } catch {
        // runtime unavailable — manifest-only catalog
      }
    }
    for (const entry of await getPluginPatterns(null)) {
      addPluginPatterns(catalog, entry.patterns, entry.pluginName, 'runtime')
    }
    if (tenantId) {
      for (const entry of await getPluginPatterns(tenantId)) {
        addPluginPatterns(catalog, entry.patterns, entry.pluginName, 'runtime')
      }
    }

    return c.json({ patterns: catalog })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to collect pattern catalog'
    return c.json({ error: message }, 500)
  }
})

export default patterns
