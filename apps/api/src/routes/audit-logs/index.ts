// @oktis-works/api - Audit Logs endpoint (REQ-observability-001/004)

import { Hono } from 'hono';
import { auditService, settingsService } from '@oktis-works/core';
import { authMiddleware, requirePermission } from '../../middleware/auth.js';

const router = new Hono();

router.use('*', authMiddleware);

const DEFAULT_RETENTION_DAYS = 90;

function parseRetention(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_RETENTION_DAYS;
  return Math.min(Math.max(Math.floor(parsed), 1), 3650);
}

async function configuredRetention(): Promise<number> {
  try {
    const setting = await settingsService.getByKey('auditLogRetentionDays');
    return parseRetention(setting?.value);
  } catch {
    // A read-only audit screen must continue to work while the database is
    // booting or when an older test/integration mock does not expose settings.
    return DEFAULT_RETENTION_DAYS;
  }
}

async function purge(retentionDays: number): Promise<number> {
  if (typeof auditService.purgeExpired !== 'function') return 0;
  return auditService.purgeExpired(retentionDays);
}

router.get('/config', requirePermission('read', 'audit'), async (c) => {
  const retentionDays = await configuredRetention();
  await purge(retentionDays);
  return c.json({ retentionDays });
});

router.put('/config', requirePermission('update', 'audit'), async (c) => {
  try {
    const body = await c.req.json();
    const retentionDays = parseRetention(body?.retentionDays);
    await settingsService.set('auditLogRetentionDays', retentionDays, 'logs', 'integer');
    const deleted = await purge(retentionDays);
    return c.json({ retentionDays, deleted });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update audit log configuration';
    return c.json({ error: message }, 400);
  }
});

router.get('/', requirePermission('read', 'audit'), async (c) => {
  const limitRaw = Number(c.req.query('limit') ?? '100');
  await purge(await configuredRetention());

  const entries = await auditService.list({
    tenantId: c.req.query('tenantId'),
    resourceType: c.req.query('resourceType'),
    action: c.req.query('action'),
    userId: c.req.query('userId'),
    limit: Number.isFinite(limitRaw) ? limitRaw : 100,
  });

  return c.json({ data: entries, count: entries.length });
});

export default router;
