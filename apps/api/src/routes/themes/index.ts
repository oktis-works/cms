import { Hono } from 'hono'
import { themeService } from '@oktis-works/core'
import { authMiddleware, requirePermission } from '../../middleware/auth.js'

const themes = new Hono()

themes.use('*', authMiddleware)

themes.get('/', requirePermission('read', 'theme'), async (c) => {
  try {
    const result = await themeService.list()
    return c.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list themes'
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
    return c.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to activate theme'
    return c.json({ error: message }, 400)
  }
})

themes.delete('/:id', requirePermission('delete', 'theme'), async (c) => {
  try {
    const id = c.req.param('id') as string
    await themeService.uninstall(id)
    return c.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to uninstall theme'
    return c.json({ error: message }, 400)
  }
})

export default themes
