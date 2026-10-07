import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { getConnection } from '@oktis-works/database';
import { authMiddleware, requirePermission } from '../../middleware/auth.js';

const router = new Hono();

router.use('*', authMiddleware);

router.get('/', requirePermission('read', 'webhook'), async (c) => {
  const sql = getConnection();
  const tenantId = String(c.get('tenantId' as never) ?? 'default');
  const rows = await sql.unsafe('SELECT * FROM webhooks WHERE tenant_id = $1 ORDER BY created_at DESC', [tenantId]);
  return c.json(rows);
});

router.post('/', requirePermission('create', 'webhook'), async (c) => {
  try {
    const body = await c.req.json();
    const sql = getConnection();

    const result = await sql.unsafe(
      `INSERT INTO webhooks (id, tenant_id, url, events, secret, active)
       VALUES ($1, $2, $3, $4::jsonb, $5, true)
       RETURNING *`,
      [randomUUID(), String(c.get('tenantId' as never) ?? 'default'), body.url, body.events ?? [], body.secret]
    );

    return c.json(result[0], 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create webhook';
    return c.json({ error: message }, 400);
  }
});

router.put('/:id', requirePermission('update', 'webhook'), async (c) => {
  try {
    const sql = getConnection();
    const id = c.req.param('id') as string;
    const tenantId = String(c.get('tenantId' as never) ?? 'default');
    const body = await c.req.json();
    const result = await sql.unsafe(
      `UPDATE webhooks
       SET url = COALESCE($1, url), events = COALESCE($2::jsonb, events), secret = COALESCE($3, secret), active = COALESCE($4, active)
       WHERE id = $5 AND tenant_id = $6 RETURNING *`,
      [body.url ?? null, body.events ? JSON.stringify(body.events) : null, body.secret ?? null, typeof body.active === 'boolean' ? body.active : null, id, tenantId]
    );
    if (!result[0]) return c.json({ error: 'Webhook not found' }, 404);
    return c.json(result[0]);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update webhook';
    return c.json({ error: message }, 400);
  }
});

router.delete('/:id', requirePermission('delete', 'webhook'), async (c) => {
  const id = c.req.param('id') as string;
  const sql = getConnection();
  const tenantId = String(c.get('tenantId' as never) ?? 'default');
  const result = await sql.unsafe('DELETE FROM webhooks WHERE id = $1 AND tenant_id = $2 RETURNING id', [id, tenantId]);

  if (result.length === 0) return c.json({ error: 'Webhook not found' }, 404);
  return c.json({ success: true });
});

export default router;
