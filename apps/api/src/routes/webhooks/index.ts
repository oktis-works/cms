import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { getConnection } from '@oktis-works/database';
import { WEBHOOK_EVENT_TYPES, type WebhookAuthConfig, type WebhookAuthType } from '@oktis-works/types';
import { authMiddleware, requirePermission } from '../../middleware/auth.js';

const router = new Hono();
const AUTH_TYPES: WebhookAuthType[] = ['none', 'bearer', 'basic', 'api_key', 'hmac_sha256'];

router.use('*', authMiddleware);

function normalizeAuthType(value: unknown): WebhookAuthType {
  return AUTH_TYPES.includes(value as WebhookAuthType) ? value as WebhookAuthType : 'hmac_sha256';
}

function normalizeAuthConfig(value: unknown): WebhookAuthConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as WebhookAuthConfig;
}

function validateAuth(authType: WebhookAuthType, authConfig: WebhookAuthConfig): string | null {
  if (authType === 'bearer' && !authConfig.token?.trim()) return 'Bearer token is required';
  if (authType === 'basic' && (!authConfig.username?.trim() || !authConfig.password?.trim())) {
    return 'Basic authentication requires username and password';
  }
  if (authType === 'api_key' && (!authConfig.headerName?.trim() || !authConfig.value?.trim())) {
    return 'API key authentication requires a header name and value';
  }
  if (authType === 'hmac_sha256' && !authConfig.secret?.trim()) return 'HMAC secret is required';
  return null;
}

function publicWebhook(row: Record<string, unknown>): Record<string, unknown> {
  const authType = normalizeAuthType(row['auth_type']);
  const config = normalizeAuthConfig(row['auth_config']);

  return {
    id: row['id'],
    tenant_id: row['tenant_id'],
    url: row['url'],
    events: row['events'] ?? [],
    auth_type: authType,
    auth_config: {
      ...(config.username ? { username: config.username } : {}),
      ...(config.headerName ? { headerName: config.headerName } : {}),
      ...(config.signatureHeader ? { signatureHeader: config.signatureHeader } : {}),
    },
    auth_configured: authType === 'none' || Boolean(
      config.token || config.password || config.value || config.secret || row['secret']
    ),
    active: row['active'],
    created_at: row['created_at'],
    updated_at: row['updated_at'],
  };
}

function bodyAuth(body: Record<string, unknown>, existing?: Record<string, unknown>): {
  type: WebhookAuthType;
  config: WebhookAuthConfig;
  legacySecret: string;
} {
  const type = normalizeAuthType(body['authType'] ?? body['auth_type'] ?? existing?.['auth_type']);
  const provided = body['authConfig'] ?? body['auth_config'];
  const previous = normalizeAuthConfig(existing?.['auth_config']);
  const config = { ...previous, ...normalizeAuthConfig(provided) };

  // Compatibilidade com clientes antigos que ainda enviam apenas `secret`.
  if (typeof body['secret'] === 'string' && body['secret'].trim()) config.secret = body['secret'].trim();
  if (type === 'hmac_sha256' && !config.secret && typeof existing?.['secret'] === 'string') {
    config.secret = existing['secret'];
  }

  return { type, config, legacySecret: config.secret ?? (existing?.['secret'] as string ?? '') };
}

router.get('/events', requirePermission('read', 'webhook'), (c) => {
  return c.json({ data: WEBHOOK_EVENT_TYPES.map((value) => ({ value, label: value === '*' ? 'All events' : value })) });
});

router.get('/', requirePermission('read', 'webhook'), async (c) => {
  const sql = getConnection();
  const tenantId = String(c.get('tenantId' as never) ?? 'default');
  const rows = await sql.unsafe('SELECT * FROM webhooks WHERE tenant_id = $1 ORDER BY created_at DESC', [tenantId]);
  return c.json((rows as Record<string, unknown>[]).map(publicWebhook));
});

router.post('/', requirePermission('create', 'webhook'), async (c) => {
  try {
    const body = await c.req.json() as Record<string, unknown>;
    const sql = getConnection();
    const url = typeof body['url'] === 'string' ? body['url'].trim() : '';
    const events = Array.isArray(body['events']) ? body['events'].filter((event): event is string => typeof event === 'string') : [];
    const auth = bodyAuth(body);
    const authError = validateAuth(auth.type, auth.config);
    if (!url || events.length === 0 || authError) return c.json({ error: authError ?? 'URL and at least one event are required' }, 400);

    const result = await sql.unsafe(
      `INSERT INTO webhooks (id, tenant_id, url, events, secret, auth_type, auth_config, active)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7::jsonb, $8)
       RETURNING *`,
      [
        randomUUID(),
        String(c.get('tenantId' as never) ?? 'default'),
        url,
        JSON.stringify(events),
        auth.legacySecret,
        auth.type,
        JSON.stringify(auth.config),
        typeof body['active'] === 'boolean' ? body['active'] : true,
      ]
    );

    return c.json(publicWebhook(result[0] as Record<string, unknown>), 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create webhook';
    return c.json({ error: message }, 400);
  }
});

router.put('/:id', requirePermission('update', 'webhook'), async (c) => {
  try {
    const sql = getConnection();
    const id = c.req.param('id');
    const tenantId = String(c.get('tenantId' as never) ?? 'default');
    const body = await c.req.json() as Record<string, unknown>;
    const current = await sql.unsafe('SELECT * FROM webhooks WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    if (!current[0]) return c.json({ error: 'Webhook not found' }, 404);

    const row = current[0] as Record<string, unknown>;
    const auth = bodyAuth(body, row);
    const authError = validateAuth(auth.type, auth.config);
    if (authError) return c.json({ error: authError }, 400);

    const events = Array.isArray(body['events'])
      ? body['events'].filter((event): event is string => typeof event === 'string')
      : row['events'];
    const url = typeof body['url'] === 'string' ? body['url'].trim() : row['url'];
    const active = typeof body['active'] === 'boolean' ? body['active'] : row['active'];
    const result = await sql.unsafe(
      `UPDATE webhooks
       SET url = $1, events = $2::jsonb, secret = $3, auth_type = $4, auth_config = $5::jsonb, active = $6
       WHERE id = $7 AND tenant_id = $8
       RETURNING *`,
      [url, JSON.stringify(events), auth.legacySecret, auth.type, JSON.stringify(auth.config), active, id, tenantId]
    );

    return c.json(publicWebhook(result[0] as Record<string, unknown>));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update webhook';
    return c.json({ error: message }, 400);
  }
});

router.delete('/:id', requirePermission('delete', 'webhook'), async (c) => {
  const id = c.req.param('id');
  const sql = getConnection();
  const tenantId = String(c.get('tenantId' as never) ?? 'default');
  const result = await sql.unsafe('DELETE FROM webhooks WHERE id = $1 AND tenant_id = $2 RETURNING id', [id, tenantId]);

  if (result.length === 0) return c.json({ error: 'Webhook not found' }, 404);
  return c.json({ success: true });
});

export default router;
