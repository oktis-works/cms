// @oktis-works/api - Editor block catalog route (GET /api/v1/blocks)
//
// WordPress-parity item E3 — data plane endpoint: merges `manifest.blocks`
// from active plugins with runtime `api.registerBlock` registrations
// (platform + tenant scopes). No table: entries exist while the plugin is
// active. RBAC: reading the catalog requires `read content` (same gate as
// the field-types catalog the editor consumes).

import { Hono } from 'hono'
import { pluginService, ensureTenantPluginsLoaded, getPluginBlocks } from '@oktis-works/core'
import { authMiddleware, requirePermission } from '../../middleware/auth.js'
import type { PluginManifest } from '@oktis-works/types'
import { isPluginActive } from '../plugins/extensions.js'
import { addPluginBlocks, type BlockCatalogEntry } from './catalog.js'

const blocks = new Hono()

blocks.use('*', authMiddleware)

// GET /blocks — block catalog for the editor (manifest + runtime, no table)
blocks.get('/', requirePermission('read', 'content'), async (c) => {
  try {
    const userRoles = c.get('userRoles')
    const sessionTenant = c.get('tenantId')
    const tenantId = userRoles.includes('SUPER_ADMIN') ? c.req.query('tenantId') ?? sessionTenant : sessionTenant

    const catalog: BlockCatalogEntry[] = []

    const rows = await pluginService.list(tenantId)
    for (const row of rows) {
      if (!isPluginActive(row.status)) continue
      addPluginBlocks(catalog, (row.manifest as PluginManifest | undefined | null)?.blocks, row.name, 'manifest')
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
    for (const entry of await getPluginBlocks(null)) {
      addPluginBlocks(catalog, entry.blocks, entry.pluginName, 'runtime')
    }
    if (tenantId) {
      for (const entry of await getPluginBlocks(tenantId)) {
        addPluginBlocks(catalog, entry.blocks, entry.pluginName, 'runtime')
      }
    }

    return c.json({ blocks: catalog })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to collect block catalog'
    return c.json({ error: message }, 500)
  }
})

export default blocks
