// @oktis-works/core - Audit Trail (REQ-observability / REQ-security)

import { getConnection } from '@oktis-works/database';
import { createLogger } from './logger.js';

const log = createLogger({ component: 'audit' });

export interface AuditEntry {
  tenantId?: string;
  userId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  changes?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt?: string | Date;
}

export interface AuditFilter {
  tenantId?: string;
  resourceType?: string;
  resourceId?: string;
  action?: string;
  userId?: string;
  limit?: number;
}

export class AuditService {
  static readonly DEFAULT_RETENTION_DAYS = 90;
  /** Registra uma ação de forma append-only; falha de auditoria é logada, nunca bloqueia a operação. */
  async record(entry: AuditEntry): Promise<void> {
    const sql = getConnection();
    try {
      await sql.unsafe(
        `INSERT INTO audit_logs (tenant_id, user_id, action, resource_type, resource_id, changes, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5::uuid, $6::jsonb, $7, $8)`,
        [
          entry.tenantId ?? null,
          entry.userId ?? null,
          entry.action,
          entry.resourceType,
          entry.resourceId ?? null,
          entry.changes ?? null,
          entry.ipAddress ?? null,
          entry.userAgent ?? null,
        ]
      );
    } catch (error) {
      log.error('audit write failed', {
        action: entry.action,
        resource: `${entry.resourceType}:${entry.resourceId ?? '-'}`,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** Histórico rastreável por tenant/recurso (RULE-deployment-versioning análogo p/ auditoria). */
  async list(filter: AuditFilter = {}): Promise<AuditEntry[]> {
    const sql = getConnection();
    const conditions: string[] = [];
    const values: Array<string | number | boolean | null> = [];

    if (filter.tenantId) {
      values.push(filter.tenantId);
      conditions.push(`tenant_id = $${values.length}`);
    }
    if (filter.resourceType) {
      values.push(filter.resourceType);
      conditions.push(`resource_type = $${values.length}`);
    }
    if (filter.resourceId) {
      values.push(filter.resourceId);
      conditions.push(`resource_id = $${values.length}::uuid`);
    }
    if (filter.action) {
      values.push(filter.action);
      conditions.push(`action = $${values.length}`);
    }
    if (filter.userId) {
      values.push(filter.userId);
      conditions.push(`user_id = $${values.length}::uuid`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(Math.max(filter.limit ?? 100, 1), 500);
    values.push(limit);

    const result = await sql.unsafe<Record<string, unknown>[]>(
      `SELECT tenant_id AS "tenantId", user_id AS "userId", action, resource_type AS "resourceType",
              resource_id AS "resourceId", changes, ip_address AS "ipAddress", user_agent AS "userAgent", created_at
       FROM audit_logs ${where}
       ORDER BY created_at DESC
       LIMIT $${values.length}`,
      values
    );
    return result as unknown as AuditEntry[];
  }

  /** Remove registros que ultrapassaram a retenção configurada. */
  async purgeExpired(retentionDays = AuditService.DEFAULT_RETENTION_DAYS): Promise<number> {
    const sql = getConnection();
    const days = Math.min(Math.max(Math.floor(Number(retentionDays) || AuditService.DEFAULT_RETENTION_DAYS), 1), 3650);
    const result = await sql.unsafe(
      `DELETE FROM audit_logs
       WHERE created_at < NOW() - ($1::int * INTERVAL '1 day')
       RETURNING id`,
      [days]
    );
    return result.length;
  }
}

export const auditService = new AuditService();
