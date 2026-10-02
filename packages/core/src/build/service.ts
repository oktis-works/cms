import { randomUUID } from 'node:crypto';
import { getConnection } from '@oktis-works/database';
import type { Build } from '@oktis-works/types';

export class BuildService {
  async list(options: {
    page?: number;
    limit?: number;
    status?: string;
  }): Promise<{ data: Build[]; total: number }> {
    const sql = getConnection();
    const { page = 1, limit = 20, status } = options;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    const params: string[] = [];

    if (status) {
      whereClause += ` AND status = $${params.length + 1}`;
      params.push(status);
    }

    const dataResult = await sql.unsafe(
      `SELECT * FROM builds ${whereClause} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`,
      params
    );
    const countResult = await sql.unsafe(
      `SELECT COUNT(*) as total FROM builds ${whereClause}`,
      params
    );

    return {
      data: dataResult as unknown as Build[],
      total: Number((countResult[0] as Record<string, unknown>)?.['total'] ?? 0),
    };
  }

  async getById(id: string): Promise<Build | null> {
    const sql = getConnection();
    const result = await sql.unsafe('SELECT * FROM builds WHERE id = $1', [id]);
    return (result[0] as unknown as Build) ?? null;
  }

  async create(input: {
    coreVersion: string;
    plugins: Record<string, string>;
    theme: { name: string; version: string };
  }): Promise<Build> {
    const sql = getConnection();
    const id = randomUUID();
    const now = new Date().toISOString();

    const result = await sql.unsafe(
      `INSERT INTO builds (id, status, core_version, plugins, theme, created_at, updated_at)
       VALUES ($1, 'PENDING', $2, $3::jsonb, $4::jsonb, $5, $5)
       RETURNING *`,
      [id, input.coreVersion, JSON.stringify(input.plugins), JSON.stringify(input.theme), now]
    );

    return result[0] as unknown as Build;
  }

  async updateStatus(
    id: string,
    status: string,
    options?: {
      dockerImage?: string;
      checksum?: string;
      buildLog?: string;
      error?: string;
    }
  ): Promise<Build | null> {
    const sql = getConnection();
    const existing = await this.getById(id);
    if (!existing) return null;

    const setClauses: string[] = ['status = $1'];
    const setParams: string[] = [status];

    if (options?.dockerImage !== undefined) {
      setClauses.push(`docker_image = $${setParams.length + 1}`);
      setParams.push(options.dockerImage);
    }
    if (options?.checksum !== undefined) {
      setClauses.push(`checksum = $${setParams.length + 1}`);
      setParams.push(options.checksum);
    }
    if (options?.buildLog !== undefined) {
      setClauses.push(`build_log = $${setParams.length + 1}`);
      setParams.push(options.buildLog);
    }
    if (options?.error !== undefined) {
      setClauses.push(`error = $${setParams.length + 1}`);
      setParams.push(options.error);
    }

    if (status === 'RUNNING') {
      setClauses.push(`started_at = NOW()`);
    }
    if (status === 'COMPLETED' || status === 'FAILED') {
      setClauses.push(`completed_at = NOW()`);
    }

    setClauses.push(`updated_at = NOW()`);
    setParams.push(id);

    const result = await sql.unsafe(
      `UPDATE builds SET ${setClauses.join(', ')} WHERE id = $${setParams.length} RETURNING *`,
      setParams
    );

    return (result[0] as unknown as Build) ?? null;
  }
}

export const buildService = new BuildService();
