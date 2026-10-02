// @oktis-works/api - Audit Logs endpoint (REQ-observability-001/004)

import { Hono } from 'hono';
import { auditService } from '@oktis-works/core';
import { authMiddleware, requirePermission } from '../../middleware/auth.js';

const router = new Hono();

router.use('*', authMiddleware);

router.get('/', requirePermission('read', 'audit'), async (c) => {
  const limitRaw = Number(c.req.query('limit') ?? '100');

  const entries = await auditService.list({
    tenantId: c.req.query('tenantId'),
    resourceType: c.req.query('resourceType'),
    action: c.req.query('action'),
    userId: c.req.query('userId'),
    limit: Number.isFinite(limitRaw) ? limitRaw : 100,
  });

  return c.json({ data: entries, count: entries.length });
});

export default router;
