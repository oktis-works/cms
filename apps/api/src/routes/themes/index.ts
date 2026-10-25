import { Hono } from 'hono'
import { themeService } from '@oktis-works/core'
import { authMiddleware, requirePermission } from '../../middleware/auth.js'

const themes = new Hono()

themes.use('*', authMiddleware)

// Leitura pura: lista o estado do banco SEM escrever. A descoberta de temas
// no disco é explícita em POST /sync — operação de leitura não deve disparar
// side-effect de escrita.
themes.get('/', requirePermission('read', 'theme'), async (c) => {
  try {
    const result = await themeService.list()
    return c.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list themes'
    return c.json({ error: message }, 500)
  }
})

// Sincroniza o diretório de temas com o banco (upsert por nome) e retorna o
// estado completo. Usada pela tela Temas do admin ao abrir/atualizar.
themes.post('/sync', requirePermission('create', 'theme'), async (c) => {
  try {
    const result = await themeService.syncFromDirectory();
    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to sync themes'
    return c.json({ error: message }, 500)
  }
})

themes.post('/install', requirePermission('create', 'theme'), async (c) => {
  try {
    const body = await c.req.json()
    const result = await themeService.install({
      name: body.name,
      version: body.version,
      manifest: body.manifest,
    })
    return c.json(result, 201)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to install theme'
    return c.json({ error: message }, 400)
  }
})

themes.post('/:id/activate', requirePermission('update', 'theme'), async (c) => {
  try {
    const id = c.req.param('id') as string
    const result = await themeService.activate(id)
    if (!result) return c.json({ error: 'Theme not found' }, 404)
    return c.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to activate theme'
    return c.json({ error: message }, 400)
  }
})

themes.post('/:id/deactivate', requirePermission('update', 'theme'), async (c) => {
  try {
    const id = c.req.param('id') as string
    const result = await themeService.deactivate(id)
    if (!result) return c.json({ error: 'Theme not found' }, 404)
    return c.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to deactivate theme'
    return c.json({ error: message }, 400)
  }
})

themes.patch('/:id/config', requirePermission('customize', 'theme'), async (c) => {
  try {
    const id = c.req.param('id') as string
    const body = await c.req.json()
    const userId = c.get('userId') as string | undefined
    const result = await themeService.updateConfig(id, body.config, userId)
    if (!result) return c.json({ error: 'Theme not found' }, 404)
    return c.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update theme config'
    return c.json({ error: message }, 400)
  }
})

themes.delete('/:id', requirePermission('delete', 'theme'), async (c) => {
  try {
    const id = c.req.param('id') as string
    const removed = await themeService.uninstall(id)
    if (!removed) return c.json({ error: 'Theme not found' }, 404)
    return c.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to uninstall theme'
    return c.json({ error: message }, 400)
  }
})

// Export theme config as JSON
themes.get('/:id/config/export', requirePermission('customize', 'theme'), async (c) => {
  try {
    const id = c.req.param('id') as string
    const result = await themeService.exportConfig(id)
    if (!result) return c.json({ error: 'Theme not found' }, 404)
    c.header('Content-Type', 'application/json')
    c.header('Content-Disposition', `attachment; filename="theme-config-${id}.json"`)
    return c.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to export theme config'
    return c.json({ error: message }, 500)
  }
})

// Import theme config from JSON
themes.post('/:id/config/import', requirePermission('customize', 'theme'), async (c) => {
  try {
    const id = c.req.param('id') as string
    const body = await c.req.json()
    const config = body.config
    const mode = body.mode ?? 'merge'
    if (!config || typeof config !== 'object') {
      return c.json({ error: 'Config is required' }, 400)
    }
    const result = await themeService.importConfig(id, config, { mode })
    if (!result) return c.json({ error: 'Theme not found' }, 404)
    return c.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to import theme config'
    return c.json({ error: message }, 400)
  }
})

// Get config version history
themes.get('/:id/config/history', requirePermission('customize', 'theme'), async (c) => {
  try {
    const id = c.req.param('id') as string
    const limit = parseInt(c.req.query('limit') || '50', 10)
    const offset = parseInt(c.req.query('offset') || '0', 10)
    const history = await themeService.getConfigHistory(id, limit, offset)
    return c.json(history)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get config history'
    return c.json({ error: message }, 500)
  }
})

// Restore a previous config version
themes.post('/:id/config/restore', requirePermission('customize', 'theme'), async (c) => {
  try {
    const id = c.req.param('id') as string
    const body = await c.req.json()
    const versionId = body.versionId
    if (!versionId) return c.json({ error: 'versionId is required' }, 400)
    // Get user from auth context (simplified - in real impl would use auth context)
    const userId = (c as any).get('user')?.id || 'system'
    const result = await themeService.restoreConfigVersion(id, versionId, userId)
    if (!result) return c.json({ error: 'Version not found' }, 404)
    return c.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to restore config version'
    return c.json({ error: message }, 400)
  }
})

// Restore defaults (reset to manifest defaults)
themes.post('/:id/config/restore-defaults', requirePermission('customize', 'theme'), async (c) => {
  try {
    const id = c.req.param('id') as string
    const theme = await themeService.getById(id)
    if (!theme) return c.json({ error: 'Theme not found' }, 404)

    const manifest = theme.manifest as { settings?: any[] } | null
    const defaults: Record<string, unknown> = {}
    const settings = Array.isArray(manifest?.settings) ? manifest.settings : []
    for (const field of settings) {
      if (field && typeof field === 'object' && field.default !== undefined) {
        defaults[field.name] = field.default
      }
    }

    const result = await themeService.updateConfig(id, defaults)
    return c.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to restore defaults'
    return c.json({ error: message }, 400)
  }
})

export default themes
