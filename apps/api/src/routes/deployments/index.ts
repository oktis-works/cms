import { Hono } from 'hono';
import { deploymentService } from '@oktis-works/core';
import { authMiddleware, requirePermission } from '../../middleware/auth.js';

const router = new Hono();

router.use('*', authMiddleware);

router.get('/', requirePermission('read', 'deployment'), async (c) => {
  const page = Number(c.req.query('page') ?? 1);
  const limit = Number(c.req.query('limit') ?? 20);
  const status = c.req.query('status') || undefined;

  const result = await deploymentService.list({ page, limit, status });
  return c.json(result);
});

router.post('/', requirePermission('create', 'deployment'), async (c) => {
  try {
    const body = await c.req.json();
    const userId = c.get('userId' as never) as string;

    const result = await deploymentService.create({
      buildId: body.buildId,
      coreVersion: body.coreVersion,
      themeVersion: body.themeVersion,
      pluginVersions: body.pluginVersions,
      checksum: body.checksum,
      createdBy: userId,
    });
    return c.json(result, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create deployment';
    return c.json({ error: message }, 400);
  }
});

router.get('/:id', requirePermission('read', 'deployment'), async (c) => {
  const id = c.req.param('id') as string;
  const result = await deploymentService.getById(id);
  if (!result) return c.json({ error: 'Deployment not found' }, 404);
  return c.json(result);
});

router.post('/:id/rollback', requirePermission('create', 'deployment'), async (c) => {
  try {
    const id = c.req.param('id') as string;
    const body = await c.req.json();
    const result = await deploymentService.rollback(id, body.rollbackToId);
    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to rollback deployment';
    return c.json({ error: message }, 400);
  }
});

export default router;
