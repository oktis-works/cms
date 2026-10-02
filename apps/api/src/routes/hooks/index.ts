// @oktis-works/api - Catálogo de hooks (REQU-035-002)

import { Hono } from 'hono';
import { getHookCatalog } from '@oktis-works/core';
import { authMiddleware, requirePermission } from '../../middleware/auth.js';

const router = new Hono();

router.use('*', authMiddleware);

router.get('/', requirePermission('read', 'system'), async (c) => {
  return c.json(getHookCatalog());
});

export default router;
