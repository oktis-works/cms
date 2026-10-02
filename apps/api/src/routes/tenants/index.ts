// @oktis-works/api - Tenants Routes

import { Hono } from 'hono';
import { tenantService } from '@oktis-works/core';
import { authMiddleware, requirePermission } from '../../middleware/auth.js';

const tenantsRouter = new Hono();

tenantsRouter.use('*', authMiddleware);

tenantsRouter.get('/', requirePermission('read', 'tenants'), async (c) => {
  const page = Number(c.req.query('page') ?? 1);
  const limit = Number(c.req.query('limit') ?? 20);
  const search = c.req.query('search') || undefined;

  const result = await tenantService.list({ page, limit, search });
  return c.json(result);
});

tenantsRouter.post('/', requirePermission('create', 'tenants'), async (c) => {
  try {
    const body = await c.req.json();
    const tenant = await tenantService.create({
      name: body.name,
      slug: body.slug,
    });

    return c.json(tenant, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create tenant';
    return c.json({ error: message }, 400);
  }
});

tenantsRouter.get('/:id', requirePermission('read', 'tenants'), async (c) => {
  const id = c.req.param('id') as string;
  const tenant = await tenantService.getById(id);

  if (!tenant) {
    return c.json({ error: 'Tenant not found' }, 404);
  }

  return c.json(tenant);
});

tenantsRouter.put('/:id', requirePermission('update', 'tenants'), async (c) => {
  try {
    const id = c.req.param('id') as string;
    const body = await c.req.json();
    const tenant = await tenantService.update(id, body);

    if (!tenant) {
      return c.json({ error: 'Tenant not found' }, 404);
    }

    return c.json(tenant);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update tenant';
    return c.json({ error: message }, 400);
  }
});

tenantsRouter.delete('/:id', requirePermission('delete', 'tenants'), async (c) => {
  try {
    const id = c.req.param('id') as string;
    const deleted = await tenantService.delete(id);

    if (!deleted) {
      return c.json({ error: 'Tenant not found' }, 404);
    }

    return c.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete tenant';
    return c.json({ error: message }, 400);
  }
});

export default tenantsRouter;
