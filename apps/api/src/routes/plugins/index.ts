// @oktis-works/api - Rotas de plugins (WP4: vínculo por tenant, RBAC, runtime)
//
// Decisões:
// - Artefato (instalação) = plugins tenant_id NULL (platform)
// - Ativação = vínculo em plugin_tenants (ENABLED/DISABLED) por tenant
// - Só SUPER_ADMIN instala/ativa/desativa/desinstala; TENANT_ADMIN só lê
// - Operações de vínculo correm em runWithTenantTransaction(tenantId) p/ RLS

import { Hono } from 'hono'
import { pluginService, syncEnabledPlugins, ensureTenantPluginsLoaded, getPluginsRuntimeState, getPluginAdminExtensions } from '@oktis-works/core'
import { authMiddleware, requirePermission } from '../../middleware/auth.js'
import { runWithTenantTransaction } from '@oktis-works/database'
import type { PluginManifest } from '@oktis-works/types'
import { emptyAdminExtensionsState, isPluginActive, manifestAdminAsState, mergePluginAdminState } from './extensions.js'

const plugins = new Hono()

plugins.use('*', authMiddleware)

// GET /plugins — lista artefatos com flag `enabled` do tenant da sessão
// SUPER_ADMIN pode passar ?tenantId= para ver outro tenant
plugins.get('/', requirePermission('read', 'plugin'), async (c) => {
  try {
    const userRoles = c.get('userRoles')
    const sessionTenant = c.get('tenantId')
    const tenantId = userRoles.includes('SUPER_ADMIN') ? c.req.query('tenantId') ?? sessionTenant : sessionTenant

    const result = await pluginService.list(tenantId)
    return c.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list plugins'
    return c.json({ error: message }, 500)
  }
})

// GET /plugins/runtime — estado de carga por escopo (observabilidade WP2)
plugins.get('/runtime', requirePermission('read', 'plugin'), async (c) => {
  try {
    const state = getPluginsRuntimeState()
    return c.json(state)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get runtime state'
    return c.json({ error: message }, 500)
  }
})

// GET /plugins/extensions — estado declarativo agregado dos slots de admin
// (FEAT-098 / DECI-027): manifest.admin (ativo para o tenant) + api.admin.*
// registrado em runtime (escopo platform + tenant). O admin renderiza os slots
// a partir deste payload; capability gating de menu acontece no cliente.
plugins.get('/extensions', requirePermission('read', 'plugin'), async (c) => {
  try {
    const userRoles = c.get('userRoles')
    const sessionTenant = c.get('tenantId')
    const tenantId = userRoles.includes('SUPER_ADMIN') ? c.req.query('tenantId') ?? sessionTenant : sessionTenant

    const state = emptyAdminExtensionsState()

    const rows = await pluginService.list(tenantId)
    for (const row of rows) {
      if (!isPluginActive(row.status)) continue
      const adminDecl = (row.manifest as PluginManifest | undefined | null)?.admin
      if (adminDecl) mergePluginAdminState(state, manifestAdminAsState(adminDecl), row.name)
    }

    // Runtime (api.admin.*): best-effort — garante o escopo do tenant carregado;
    // falha não derruba o endpoint (o manifesto segue válido sozinho).
    if (tenantId) {
      try {
        await ensureTenantPluginsLoaded(tenantId)
      } catch {
        // runtime indisponível — segue só com o manifesto
      }
    }
    for (const entry of await getPluginAdminExtensions(null)) {
      mergePluginAdminState(state, entry.state, entry.pluginName)
    }
    if (tenantId) {
      for (const entry of await getPluginAdminExtensions(tenantId)) {
        mergePluginAdminState(state, entry.state, entry.pluginName)
      }
    }

    return c.json(state)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to collect admin extensions'
    return c.json({ error: message }, 500)
  }
})

// POST /plugins/:id/tenants/:tenantId — habilita plugin para um tenant (SUPER_ADMIN)
plugins.post('/:id/tenants/:tenantId', requirePermission('update', 'plugin'), async (c) => {
  const userRoles = c.get('userRoles')
  if (!userRoles.includes('SUPER_ADMIN')) {
    return c.json({ error: 'Only SUPER_ADMIN can link plugins to tenants' }, 403)
  }

  try {
    const pluginId = c.req.param('id')
    const tenantId = c.req.param('tenantId')
    if (!pluginId || !tenantId) return c.json({ error: 'Missing id or tenantId' }, 400)

    // Corre dentro do contexto do tenant alvo (RLS do plugin_tenants)
    const result = await runWithTenantTransaction(tenantId, async () => {
      return pluginService.activate(pluginId, tenantId)
    })

    if (!result) return c.json({ error: 'Plugin not found' }, 404)

    // Reflete no processo atual (API); web/worker recarregam no próximo request
    await ensureTenantPluginsLoaded(tenantId, { force: true })

    return c.json({ ...result, enabled: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to enable plugin for tenant'
    return c.json({ error: message }, 400)
  }
})

// DELETE /plugins/:id/tenants/:tenantId — desabilita plugin para um tenant
plugins.delete('/:id/tenants/:tenantId', requirePermission('update', 'plugin'), async (c) => {
  const userRoles = c.get('userRoles')
  if (!userRoles.includes('SUPER_ADMIN')) {
    return c.json({ error: 'Only SUPER_ADMIN can unlink plugins from tenants' }, 403)
  }

  try {
    const pluginId = c.req.param('id')
    const tenantId = c.req.param('tenantId')
    if (!pluginId || !tenantId) return c.json({ error: 'Missing id or tenantId' }, 400)

    const result = await runWithTenantTransaction(tenantId, async () => {
      return pluginService.deactivate(pluginId, tenantId)
    })

    if (!result) return c.json({ error: 'Plugin not found' }, 404)

    await ensureTenantPluginsLoaded(tenantId, { force: true })

    return c.json({ ...result, enabled: false })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to disable plugin for tenant'
    return c.json({ error: message }, 400)
  }
})

// POST /plugins/:id/activate — ativa plugin (body: { tenantId }) — alias compat
plugins.post('/:id/activate', requirePermission('update', 'plugin'), async (c) => {
  const userRoles = c.get('userRoles')
  if (!userRoles.includes('SUPER_ADMIN')) {
    return c.json({ error: 'Only SUPER_ADMIN can activate plugins' }, 403)
  }

  try {
    const id = c.req.param('id')
    if (!id) return c.json({ error: 'Missing id' }, 400)
    const body = await c.req.json().catch(() => ({}))
    const tenantId = body.tenantId as string | undefined

    if (!tenantId) return c.json({ error: 'tenantId é obrigatório' }, 400)

    const result = await runWithTenantTransaction(tenantId, async () => {
      return pluginService.activate(id, tenantId)
    })

    if (!result) return c.json({ error: 'Plugin not found' }, 404)
    await ensureTenantPluginsLoaded(tenantId, { force: true })
    return c.json({ ...result, enabled: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to activate plugin'
    return c.json({ error: message }, 400)
  }
})

// POST /plugins/:id/deactivate — desativa plugin (body: { tenantId }) — alias compat
plugins.post('/:id/deactivate', requirePermission('update', 'plugin'), async (c) => {
  const userRoles = c.get('userRoles')
  if (!userRoles.includes('SUPER_ADMIN')) {
    return c.json({ error: 'Only SUPER_ADMIN can deactivate plugins' }, 403)
  }

  try {
    const id = c.req.param('id')
    if (!id) return c.json({ error: 'Missing id' }, 400)
    const body = await c.req.json().catch(() => ({}))
    const tenantId = body.tenantId as string | undefined

    if (!tenantId) return c.json({ error: 'tenantId é obrigatório' }, 400)

    const result = await runWithTenantTransaction(tenantId, async () => {
      return pluginService.deactivate(id, tenantId)
    })

    if (!result) return c.json({ error: 'Plugin not found' }, 404)
    await ensureTenantPluginsLoaded(tenantId, { force: true })
    return c.json({ ...result, enabled: false })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to deactivate plugin'
    return c.json({ error: message }, 400)
  }
})

// DELETE /plugins/:id — desinstala (remove artefato + vínculos + migrations)
plugins.delete('/:id', requirePermission('delete', 'plugin'), async (c) => {
  const userRoles = c.get('userRoles')
  if (!userRoles.includes('SUPER_ADMIN')) {
    return c.json({ error: 'Only SUPER_ADMIN can uninstall plugins' }, 403)
  }

  try {
    const id = c.req.param('id')
    if (!id) return c.json({ error: 'Missing id' }, 400)
    await pluginService.uninstall(id)
    // Invalida todo estado de cache (todos os tenants + platform)
    // Como não exportamos invalidateAll, fazemos sync forçado
    await syncEnabledPlugins({ force: true })
    return c.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to uninstall plugin'
    return c.json({ error: message }, 400)
  }
})

export default plugins