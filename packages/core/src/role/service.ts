import { randomUUID } from 'node:crypto';
import { getConnection } from '@oktis-works/database';
import type { Role } from '@oktis-works/types';

export class RoleService {
  async list(tenantId?: string): Promise<Role[]> {
    const sql = getConnection();

    if (tenantId) {
      const result = await sql.unsafe(
        'SELECT * FROM roles WHERE tenant_id = $1 OR tenant_id IS NULL ORDER BY created_at ASC',
        [tenantId]
      );
      return result as unknown as Role[];
    }

    const result = await sql.unsafe(
      'SELECT * FROM roles WHERE tenant_id IS NULL ORDER BY created_at ASC',
      []
    );
    return result as unknown as Role[];
  }

  async getById(id: string): Promise<Role | null> {
    const sql = getConnection();
    const result = await sql.unsafe('SELECT * FROM roles WHERE id = $1', [id]);
    return (result[0] as unknown as Role) ?? null;
  }

  async create(input: {
    tenantId?: string;
    name: string;
    slug: string;
    permissions?: string[];
  }): Promise<Role> {
    const sql = getConnection();
    const id = randomUUID();
    const permissionsJson = JSON.stringify(input.permissions ?? []);
    const isSystem = false;

    const result = await sql.unsafe(
      `INSERT INTO roles (id, tenant_id, name, slug, is_system, permissions)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       RETURNING *`,
      [id, input.tenantId ?? null, input.name, input.slug, isSystem, permissionsJson]
    );

    return result[0] as unknown as Role;
  }

  async update(
    id: string,
    input: {
      name?: string;
      slug?: string;
      permissions?: string[];
    }
  ): Promise<Role | null> {
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
    if (input.permissions !== undefined) {
      setClauses.push(`permissions = $${setParams.length + 1}::jsonb`);
      setParams.push(JSON.stringify(input.permissions));
    }

    if (setClauses.length === 0) return existing;

    setParams.push(id);

    const result = await sql.unsafe(
      `UPDATE roles SET ${setClauses.join(', ')} WHERE id = $${setParams.length} RETURNING *`,
      setParams
    );

    return (result[0] as unknown as Role) ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const sql = getConnection();

    const existing = await this.getById(id);
    if (!existing) return false;
    if (existing.isSystem) return false;

    await sql.unsafe('DELETE FROM roles WHERE id = $1', [id]);

    return true;
  }
}

export const roleService = new RoleService();
