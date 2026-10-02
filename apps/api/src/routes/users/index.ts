import { Hono } from 'hono';
import { userService } from '@oktis-works/core';
import type { UserStatus } from '@oktis-works/types';
import { authMiddleware, requirePermission } from '../../middleware/auth.js';
import { hashPassword } from '@oktis-works/auth';

const router = new Hono();

router.use('*', authMiddleware);

router.get('/', requirePermission('read', 'user'), async (c) => {
  const page = Number(c.req.query('page') ?? 1);
  const limit = Number(c.req.query('limit') ?? 20);
  const search = c.req.query('search') || undefined;
  const status = (c.req.query('status') || undefined) as UserStatus | undefined;

  const result = await userService.list({ page, limit, search, status });
  return c.json(result);
});

router.post('/', requirePermission('create', 'user'), async (c) => {
  try {
    const body = await c.req.json();
    const passwordHash = await hashPassword(body.password);

    const result = await userService.create({
      email: body.email,
      name: body.name,
      passwordHash,
      avatar: body.avatar,
    });
    return c.json(result, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create user';
    return c.json({ error: message }, 400);
  }
});

router.get('/:id', requirePermission('read', 'user'), async (c) => {
  const id = c.req.param('id') as string;
  const result = await userService.getById(id);
  if (!result) return c.json({ error: 'User not found' }, 404);
  return c.json(result);
});

router.put('/:id', requirePermission('update', 'user'), async (c) => {
  try {
    const id = c.req.param('id') as string;
    const body = await c.req.json();

    const result = await userService.update(id, {
      name: body.name,
      email: body.email,
      avatar: body.avatar,
      status: body.status,
    });
    if (!result) return c.json({ error: 'User not found' }, 404);
    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update user';
    return c.json({ error: message }, 400);
  }
});

router.delete('/:id', requirePermission('delete', 'user'), async (c) => {
  const id = c.req.param('id') as string;
  const deleted = await userService.delete(id);
  if (!deleted) return c.json({ error: 'User not found' }, 404);
  return c.json({ success: true });
});

export default router;
