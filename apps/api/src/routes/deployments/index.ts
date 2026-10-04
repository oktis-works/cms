import { Hono } from 'hono';
import { deploymentService, buildService, enqueueJob } from '@oktis-works/core';
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
    const tenantId = String(c.get('tenantId' as never) ?? 'default');

    const result = await deploymentService.create({
      buildId: body.buildId,
      coreVersion: body.coreVersion,
      themeVersion: body.themeVersion,
      pluginVersions: body.pluginVersions,
      checksum: body.checksum,
      createdBy: userId,
    });

    // A3: pipeline build → deployment roda no worker. Se o build ainda está
    // PENDING, enfileira o build também; o handler de deployment aguarda o
    // build COMPLETED via retries do BullMQ (backoff exponencial).
    const build = await buildService.getById(String(body.buildId));
    if (build && build.status === 'PENDING') {
      void enqueueJob(
        'build.create',
        {
          buildId: build.id,
          plugins: (build.plugins as Record<string, string> | null) ?? {},
          theme: (build.theme as Record<string, string> | null) ?? {},
        },
        { tenantId, userId, jobId: `build.create:${build.id}` }
      );
    }
    void enqueueJob(
      'deployment.create',
      { deploymentId: result.id, buildId: String(body.buildId) },
      { tenantId, userId, jobId: `deployment.create:${result.id}` }
    );

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
