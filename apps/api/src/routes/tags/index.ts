import { Hono } from 'hono';
import { tagService } from '@oktis-works/core';
import { authMiddleware, requirePermission } from '../../middleware/auth.js';

const router = new Hono();

router.use('*', authMiddleware);

router.get('/', requirePermission('read', 'tag'), async (c) => {
  const result = await tagService.list();
  return c.json(result);
});

router.post('/', requirePermission('create', 'tag'), async (c) => {
  try {
    const body = await c.req.json();
    const result = await tagService.create({
      name: body.name,
      slug: body.slug,
    });
    return c.json(result, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create tag';
    return c.json({ error: message }, 400);
  }
});

router.put('/:id', requirePermission('update', 'tag'), async (c) => {
  try {
    const id = c.req.param('id') as string;
    const body = await c.req.json();
    const result = await tagService.update(id, { name: body.name, slug: body.slug });
    if (!result) return c.json({ error: 'Tag not found' }, 404);
    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update tag';
    return c.json({ error: message }, 400);
  }
});

router.delete('/:id', requirePermission('delete', 'tag'), async (c) => {
  const id = c.req.param('id') as string;
  const deleted = await tagService.delete(id);
  if (!deleted) return c.json({ error: 'Tag not found' }, 404);
  return c.json({ success: true });
});

export default router;
