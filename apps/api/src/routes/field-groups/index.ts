// @oktis-works/api - Field Groups Routes (Builder + Location Rules)

import { Hono } from 'hono';
import { fieldGroupService } from '@oktis-works/core';
import { authMiddleware, requirePermission } from '../../middleware/auth.js';

const router = new Hono();

router.use('*', authMiddleware);

router.get('/', requirePermission('read', 'content'), async (c) => {
  const type = c.req.query('type');
  if (type) {
    const resolved = await fieldGroupService.resolveGroupsByLocation({
      contentType: type,
      taxonomy: c.req.query('taxonomy') || undefined,
      termSlug: c.req.query('term') || undefined,
      userRole: c.req.query('userRole') || undefined,
      pageTemplate: c.req.query('template') || undefined,
      postStatus: c.req.query('status') || undefined,
    });
    return c.json(resolved);
  }
  const result = await fieldGroupService.list();
  return c.json(result);
});

router.get('/:id', requirePermission('read', 'content'), async (c) => {
  const id = c.req.param('id') as string;
  const result = await fieldGroupService.getById(id);
  if (!result) return c.json({ error: 'Field group not found' }, 404);
  return c.json(result);
});

router.post('/', requirePermission('create', 'content'), async (c) => {
  try {
    const body = await c.req.json();
    const result = await fieldGroupService.create({
      title: body.title,
      key: body.key,
      locationRules: body.locationRules,
      position: body.position,
      displayStyle: body.displayStyle,
      active: body.active,
      fields: body.fields,
    });
    return c.json(result, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create field group';
    return c.json({ error: message }, 400);
  }
});

router.put('/:id', requirePermission('update', 'content'), async (c) => {
  try {
    const id = c.req.param('id') as string;
    const body = await c.req.json();
    const result = await fieldGroupService.update(id, {
      title: body.title,
      locationRules: body.locationRules,
      position: body.position,
      displayStyle: body.displayStyle,
      active: body.active,
    });
    if (!result) return c.json({ error: 'Field group not found' }, 404);
    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update field group';
    return c.json({ error: message }, 400);
  }
});

router.delete('/:id', requirePermission('delete', 'content'), async (c) => {
  const id = c.req.param('id') as string;
  const deleted = await fieldGroupService.delete(id);
  if (!deleted) return c.json({ error: 'Field group not found' }, 404);
  return c.json({ success: true });
});

export default router;
