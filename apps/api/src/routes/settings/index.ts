import { Hono } from 'hono';
import { settingsService } from '@oktis-works/core';
import { authMiddleware, requirePermission } from '../../middleware/auth.js';

const router = new Hono();

router.use('*', authMiddleware);

router.get('/', requirePermission('read', 'setting'), async (c) => {
  const group = c.req.query('group') || undefined;
  const result = await settingsService.get(group);
  return c.json(result);
});

router.put('/', requirePermission('update', 'setting'), async (c) => {
  try {
    const body = await c.req.json();
    const settings = Array.isArray(body) ? body : [body];
    if (settings.length === 0 || settings.length > 100) {
      return c.json({ error: 'Settings payload must contain between 1 and 100 items' }, 400);
    }

    const result = await settingsService.setMany(
      settings.map((s: Record<string, unknown>) => ({
        key: s['key'] as string,
        value: s['value'],
        group: s['group'] as string,
        type: s['type'] as string,
        visibility: s['visibility'] as string | undefined,
      }))
    );

    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update settings';
    return c.json({ error: message }, 400);
  }
});

export default router;
