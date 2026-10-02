// @oktis-works/api - Roles Routes

import { Hono } from 'hono';
import { roleService } from '@oktis-works/core';
import { authMiddleware, requirePermission } from '../../middleware/auth.js';

const rolesRouter = new Hono();

rolesRouter.use('*', authMiddleware);

rolesRouter.get('/', requirePermission('read', 'roles'), async (c) => {
  const roles = await roleService.list();
  return c.json(roles);
});

rolesRouter.post('/', requirePermission('create', 'roles'), async (c) => {
  try {
    const body = await c.req.json();
    const role = await roleService.create({
      name: body.name,
      slug: body.slug,
      permissions: body.permissions,
    });

    return c.json(role, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create role';
    return c.json({ error: message }, 400);
  }
});

rolesRouter.put('/:id', requirePermission('update', 'roles'), async (c) => {
  try {
    const id = c.req.param('id') as string;
    const body = await c.req.json();
    const role = await roleService.update(id, body);

    if (!role) {
      return c.json({ error: 'Role not found' }, 404);
    }

    return c.json(role);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update role';
    return c.json({ error: message }, 400);
  }
});

rolesRouter.delete('/:id', requirePermission('delete', 'roles'), async (c) => {
  try {
    const id = c.req.param('id') as string;
    const deleted = await roleService.delete(id);

    if (!deleted) {
      return c.json({ error: 'Role not found' }, 404);
    }

    return c.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete role';
    return c.json({ error: message }, 400);
  }
});

export default rolesRouter;
