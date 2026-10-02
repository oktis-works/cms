import { Hono } from 'hono';
import { categoryService } from '@oktis-works/core';
import { authMiddleware, requirePermission } from '../../middleware/auth.js';

const router = new Hono();

router.use('*', authMiddleware);

router.get('/', requirePermission('read', 'category'), async (c) => {
  const result = await categoryService.list();
  return c.json(result);
});

router.post('/', requirePermission('create', 'category'), async (c) => {
  try {
    const body = await c.req.json();
    const result = await categoryService.create({
      name: body.name,
      slug: body.slug,
      description: body.description,
      parentId: body.parentId,
    });
    return c.json(result, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create category';
    return c.json({ error: message }, 400);
  }
});

router.put('/:id', requirePermission('update', 'category'), async (c) => {
  try {
    const id = c.req.param('id') as string;
    const body = await c.req.json();
    const result = await categoryService.update(id, {
      name: body.name,
      slug: body.slug,
      description: body.description,
      parentId: body.parentId,
    });
    if (!result) return c.json({ error: 'Category not found' }, 404);
    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update category';
    return c.json({ error: message }, 400);
  }
});

router.delete('/:id', requirePermission('delete', 'category'), async (c) => {
  const id = c.req.param('id') as string;
  const deleted = await categoryService.delete(id);
  if (!deleted) return c.json({ error: 'Category not found' }, 404);
  return c.json({ success: true });
});

export default router;
