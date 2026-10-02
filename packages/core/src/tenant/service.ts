import { randomUUID } from 'node:crypto';
import { getConnection } from '@oktis-works/database';
import type { Tenant } from '@oktis-works/types';

export class TenantService {
  async list(options: {
    page?: number;
    limit?: number;
    search?: string;
  }): Promise<{ data: Tenant[]; total: number }> {
    const sql = getConnection();
    const { page = 1, limit = 20, search } = options;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    const params: string[] = [];

    if (search) {
      whereClause += ` AND (name ILIKE $${params.length + 1} OR slug ILIKE $${params.length + 2})`;
      params.push(`%${search}%`);
      params.push(`%${search}%`);
    }

    const dataResult = await sql.unsafe(
      `SELECT * FROM tenants ${whereClause} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`,
      params
    );
    const countResult = await sql.unsafe(
      `SELECT COUNT(*) as total FROM tenants ${whereClause}`,
      params
    );

    return {
      data: dataResult as unknown as Tenant[],
      total: Number((countResult[0] as Record<string, unknown>)?.['total'] ?? 0),
    };
  }

  async getById(id: string): Promise<Tenant | null> {
    const sql = getConnection();
    const result = await sql.unsafe('SELECT * FROM tenants WHERE id = $1', [id]);
    return (result[0] as unknown as Tenant) ?? null;
  }

  async getBySlug(slug: string): Promise<Tenant | null> {
    const sql = getConnection();
    const result = await sql.unsafe('SELECT * FROM tenants WHERE slug = $1', [slug]);
    return (result[0] as unknown as Tenant) ?? null;
  }

  async create(input: {
    name: string;
    slug: string;
    domain?: string;
    subdomain?: string;
    settings?: Record<string, unknown>;
  }): Promise<Tenant> {
    const sql = getConnection();
    const id = randomUUID();
    const status = 'ACTIVE';
    const settingsJson = input.settings ? JSON.stringify(input.settings) : null;

    const result = await sql.unsafe(
      `INSERT INTO tenants (id, name, slug, domain, subdomain, status, settings)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       RETURNING *`,
      [id, input.name, input.slug, input.domain ?? null, input.subdomain ?? null, status, settingsJson]
    );

    return result[0] as unknown as Tenant;
  }

  async update(
    id: string,
    input: {
      name?: string;
      slug?: string;
      domain?: string;
      subdomain?: string;
      status?: Tenant['status'];
      settings?: Record<string, unknown>;
    }
  ): Promise<Tenant | null> {
    const sql = getConnection();

    const existing = await this.getById(id);
    if (!existing) return null;

    const setClauses: string[] = [];
    const setParams: string[] = [];

    if (input.name !== undefined) {
      setClauses.push(`name = $${setParams.length + 1}`);
      setParams.push(input.name);
    }
    if (input.slug !== undefined) {
      setClauses.push(`slug = $${setParams.length + 1}`);
      setParams.push(input.slug);
    }
    if (input.domain !== undefined) {
      setClauses.push(`domain = $${setParams.length + 1}`);
      setParams.push(input.domain);
    }
    if (input.subdomain !== undefined) {
      setClauses.push(`subdomain = $${setParams.length + 1}`);
      setParams.push(input.subdomain);
    }
    if (input.status !== undefined) {
      setClauses.push(`status = $${setParams.length + 1}`);
      setParams.push(input.status);
    }
    if (input.settings !== undefined) {
      setClauses.push(`settings = $${setParams.length + 1}::jsonb`);
      setParams.push(JSON.stringify(input.settings));
    }

    if (setClauses.length === 0) return existing;

    setClauses.push(`updated_at = NOW()`);
    setParams.push(id);

    const result = await sql.unsafe(
      `UPDATE tenants SET ${setClauses.join(', ')} WHERE id = $${setParams.length} RETURNING *`,
      setParams
    );

    return (result[0] as unknown as Tenant) ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const sql = getConnection();

    const existing = await this.getById(id);
    if (!existing) return false;

    await sql.unsafe(`UPDATE tenants SET status = $1, updated_at = NOW() WHERE id = $2`, ['DELETED', id]);

    return true;
  }
}

export const tenantService = new TenantService();
