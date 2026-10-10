import { randomUUID } from 'node:crypto';
import { getConnection } from '@oktis-works/database';
import type { Deployment } from '@oktis-works/types';

export class DeploymentService {
  async list(options: {
    page?: number;
    limit?: number;
    status?: string;
  }): Promise<{ data: Deployment[]; total: number }> {
    const sql = getConnection();
    const page = Math.max(1, Math.floor(options.page ?? 1));
    const limit = Math.min(100, Math.max(1, Math.floor(options.limit ?? 20)));
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    const params: string[] = [];

    if (options.status) {
      whereClause += ` AND status = $${params.length + 1}`;
      params.push(options.status);
    }

    const dataResult = await sql.unsafe(
      `SELECT * FROM deployments ${whereClause} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, String(limit), String(offset)]
    );
    const countResult = await sql.unsafe(
      `SELECT COUNT(*) as total FROM deployments ${whereClause}`,
      params
    );

    return {
      data: dataResult as unknown as Deployment[],
      total: Number((countResult[0] as Record<string, unknown>)?.['total'] ?? 0),
    };
  }

  async getById(id: string): Promise<Deployment | null> {
    const sql = getConnection();
    const result = await sql.unsafe('SELECT * FROM deployments WHERE id = $1', [id]);
    return (result[0] as unknown as Deployment) ?? null;
  }

  async create(input: {
    buildId: string;
    coreVersion: string;
    themeVersion?: string;
    pluginVersions?: Record<string, string>;
    checksum: string;
    createdBy: string;
  }): Promise<Deployment> {
    const sql = getConnection();
    const id = randomUUID();
    const now = new Date().toISOString();

    const result = await sql.unsafe(
      `INSERT INTO deployments (id, status, build_id, core_version, theme_version, plugin_versions, checksum, created_by, started_at, created_at, updated_at)
       VALUES ($1, 'PENDING', $2, $3, $4, $5::jsonb, $6, $7, NOW(), $8, $8)
       RETURNING *`,
      [
        id,
        input.buildId,
        input.coreVersion,
        input.themeVersion ?? null,
        input.pluginVersions ?? {},
        input.checksum,
        input.createdBy,
        now,
      ]
    );

    return result[0] as unknown as Deployment;
  }

  async activate(id: string): Promise<Deployment | null> {
    const sql = getConnection();
    const existing = await this.getById(id);
    if (!existing) return null;
    if (!['PENDING', 'HEALTH_CHECK', 'FAILED', 'CANCELLED'].includes(existing.status)) {
      throw new Error(`Invalid deployment transition: ${existing.status} → ACTIVE`);
    }

    return sql.begin(async tx => {
      await tx.unsafe(
        `UPDATE deployments
         SET status = 'ROLLED_BACK', updated_at = NOW()
         WHERE status = 'ACTIVE' AND id <> $1`,
        [id]
      );
      const result = await tx.unsafe(
        `UPDATE deployments
         SET status = 'ACTIVE', completed_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND status IN ('PENDING', 'HEALTH_CHECK', 'FAILED', 'CANCELLED')
         RETURNING *`,
        [id]
      );
      return (result[0] as unknown as Deployment) ?? null;
    });
  }

  async rollback(id: string, rollbackToId: string): Promise<Deployment | null> {
    const sql = getConnection();
    const existing = await this.getById(id);
    if (!existing) return null;

    const target = await this.getById(rollbackToId);
    if (!target) return null;
    if (target.status === 'ROLLED_BACK' || target.status === 'CANCELLED') {
      throw new Error(`Cannot roll back to deployment in status ${target.status}`);
    }

    return sql.begin(async tx => {
      await tx.unsafe(
        `UPDATE deployments
         SET status = 'ROLLED_BACK', updated_at = NOW()
         WHERE status = 'ACTIVE' AND id <> $1`,
        [rollbackToId]
      );
      await tx.unsafe(
        `UPDATE deployments
         SET status = 'ROLLED_BACK', rollback_to_id = $1, completed_at = NOW(), updated_at = NOW()
         WHERE id = $2`,
        [rollbackToId, id]
      );
      const result = await tx.unsafe(
        `UPDATE deployments
         SET status = 'ACTIVE', completed_at = NOW(), updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [rollbackToId]
      );
      return (result[0] as unknown as Deployment) ?? null;
    });
  }

  async updateHealthCheck(id: string, status: string): Promise<Deployment | null> {
    const sql = getConnection();
    const existing = await this.getById(id);
    if (!existing) return null;

    const result = await sql.unsafe(
      `UPDATE deployments
       SET health_check_status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [status, id]
    );

    return (result[0] as unknown as Deployment) ?? null;
  }
}

export const deploymentService = new DeploymentService();
