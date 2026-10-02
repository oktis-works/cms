import { Hono } from 'hono';
import { menuService } from '@oktis-works/core';
import { authMiddleware, requirePermission } from '../../middleware/auth.js';

const router = new Hono();

router.use('*', authMiddleware);

router.get('/', requirePermission('read', 'menu'), async (c) => {
  const result = await menuService.list();
  return c.json(result);
});

router.post('/', requirePermission('create', 'menu'), async (c) => {
  try {
    const body = await c.req.json();
    const result = await menuService.create({
      name: body.name,
      slug: body.slug,
      items: body.items,
    });
    return c.json(result, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create menu';
    return c.json({ error: message }, 400);
  }
});

router.get('/:id', requirePermission('read', 'menu'), async (c) => {
  const id = c.req.param('id') as string;
  const result = await menuService.getById(id);
  if (!result) return c.json({ error: 'Menu not found' }, 404);
  return c.json(result);
});

router.put('/:id', requirePermission('update', 'menu'), async (c) => {
  try {
    const id = c.req.param('id') as string;
    const body = await c.req.json();
    const result = await menuService.update(id, {
      name: body.name,
      slug: body.slug,
      items: body.items,
    });
    if (!result) return c.json({ error: 'Menu not found' }, 404);
    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update menu';
    return c.json({ error: message }, 400);
  }
});

router.delete('/:id', requirePermission('delete', 'menu'), async (c) => {
  const id = c.req.param('id') as string;
  const deleted = await menuService.delete(id);
  if (!deleted) return c.json({ error: 'Menu not found' }, 404);
  return c.json({ success: true });
});

export default router;
