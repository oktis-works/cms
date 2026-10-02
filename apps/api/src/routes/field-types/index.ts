// @oktis-works/api - Field Types Catalog Routes

import { Hono } from 'hono';
import { listFieldTypes, listFieldTypesByCategory, FIELD_TYPE_CATEGORIES } from '@oktis-works/core';
import { authMiddleware, requirePermission } from '../../middleware/auth.js';

const router = new Hono();

router.use('*', authMiddleware);

router.get('/', requirePermission('read', 'content'), async (c) => {
  const category = c.req.query('category');

  if (category) {
    const grouped = listFieldTypesByCategory();
    const key = category as keyof typeof grouped;
    return c.json(grouped[key] ?? []);
  }

  const types = listFieldTypes();
  return c.json({
    categories: FIELD_TYPE_CATEGORIES,
    types,
  });
});

export default router;
