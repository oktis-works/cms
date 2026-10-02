import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { getConnection } from '@oktis-works/database';
import { authMiddleware, requirePermission } from '../../middleware/auth.js';

const router = new Hono();

router.use('*', authMiddleware);

router.post('/', requirePermission('create', 'webhook'), async (c) => {
  try {
    const body = await c.req.json();
    const sql = getConnection();

    const result = await sql.unsafe(
      `INSERT INTO webhooks (id, tenant_id, url, events, secret, active)
       VALUES ($1, $2, $3, $4::jsonb, $5, true)
       RETURNING *`,
      [randomUUID(), c.get('tenantId' as never) as string, body.url, JSON.stringify(body.events ?? []), body.secret]
    );

    return c.json(result[0], 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create webhook';
    return c.json({ error: message }, 400);
  }
});

router.delete('/:id', requirePermission('delete', 'webhook'), async (c) => {
  const id = c.req.param('id') as string;
  const sql = getConnection();
  const result = await sql.unsafe('DELETE FROM webhooks WHERE id = $1 RETURNING id', [id]);

  if (result.length === 0) return c.json({ error: 'Webhook not found' }, 404);
  return c.json({ success: true });
});

export default router;
