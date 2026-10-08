import { Hono } from 'hono'
import { pluginService } from '@oktis-works/core'
import { authMiddleware, requirePermission } from '../../middleware/auth.js'

const plugins = new Hono()

plugins.use('*', authMiddleware)

plugins.get('/', requirePermission('read', 'plugin'), async (c) => {
  try {
    const result = await pluginService.syncFromDirectory(c.get('tenantId' as never) as string | undefined)
    return c.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list plugins'
    return c.json({ error: message }, 500)
  }
})

plugins.post('/install', requirePermission('create', 'plugin'), async (c) => {
  try {
    const body = await c.req.json()
    const result = await pluginService.install({
      name: body.name,
      version: body.version,
      manifest: body.manifest,
    })
    return c.json(result, 201)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to install plugin'
    return c.json({ error: message }, 400)
  }
})

plugins.post('/:id/activate', requirePermission('update', 'plugin'), async (c) => {
  try {
    const id = c.req.param('id') as string
    const result = await pluginService.activate(id)
    return c.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to activate plugin'
    return c.json({ error: message }, 400)
  }
})

plugins.post('/:id/deactivate', requirePermission('update', 'plugin'), async (c) => {
  try {
    const id = c.req.param('id') as string
    const result = await pluginService.deactivate(id)
    return c.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to deactivate plugin'
    return c.json({ error: message }, 400)
  }
})

plugins.delete('/:id', requirePermission('delete', 'plugin'), async (c) => {
  try {
    const id = c.req.param('id') as string
    await pluginService.uninstall(id)
    return c.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to uninstall plugin'
    return c.json({ error: message }, 400)
  }
})

export default plugins
