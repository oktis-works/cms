// @oktis-works/api - Builds (pipeline build → deploy)
// Cria builds (PENDING) e enfileira `build.create` no worker (docker build real).

import { Hono } from 'hono';
import { buildService, enqueueJob } from '@oktis-works/core';
import { CMS_VERSION } from '@oktis-works/validation';
import { authMiddleware, requirePermission } from '../../middleware/auth.js';

const router = new Hono();

router.use('*', authMiddleware);

router.get('/', requirePermission('read', 'build'), async (c) => {
  const page = Number(c.req.query('page') ?? 1);
  const limit = Number(c.req.query('limit') ?? 20);
  const status = c.req.query('status') || undefined;

  const result = await buildService.list({ page, limit, status });
  return c.json(result);
});

router.get('/:id', requirePermission('read', 'build'), async (c) => {
  const id = c.req.param('id') as string;
  const result = await buildService.getById(id);

  if (!result) {
    return c.json({ error: 'Build not found' }, 404);
  }
  return c.json(result);
});

// POST / — cria build e dispara o job build.create (worker monta a imagem Docker).
// Fila opcional: `queued: false` avisa o consumidor API-first que o build roda
// somente quando Redis/worker estiverem disponíveis (degradação silenciosa).
router.post('/', requirePermission('create', 'build'), async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const userId = c.get('userId' as never) as string;
    const tenantId = String(c.get('tenantId' as never) ?? 'default');

    const plugins = (body.plugins ?? {}) as Record<string, string>;
    const theme = (body.theme ?? { name: 'default', version: '0.0.0' }) as { name: string; version: string };
    const coreVersion =
      typeof body.coreVersion === 'string' && body.coreVersion.length > 0 ? body.coreVersion : CMS_VERSION;

    const result = await buildService.create({ coreVersion, plugins, theme });

    const queued = await enqueueJob(
      'build.create',
      { buildId: result.id, plugins, theme },
      { tenantId, userId, jobId: `build.create:${result.id}` }
    );

    return c.json({ ...result, queued }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create build';
    return c.json({ error: message }, 400);
  }
});

export default router;
