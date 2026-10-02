import { randomUUID } from 'node:crypto';
import { getConnection } from '@oktis-works/database';
import type { User } from '@oktis-works/types';

export class UserService {
  async list(options: {
    page?: number;
    limit?: number;
    search?: string;
    status?: User['status'];
  }): Promise<{ data: User[]; total: number }> {
    const sql = getConnection();
    const { page = 1, limit = 20, search, status } = options;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    const params: string[] = [];

    if (status) {
      whereClause += ` AND status = $${params.length + 1}`;
      params.push(status);
    }
    if (search) {
      whereClause += ` AND (name ILIKE $${params.length + 1} OR email ILIKE $${params.length + 2})`;
      params.push(`%${search}%`);
      params.push(`%${search}%`);
    }

    const dataResult = await sql.unsafe(
      `SELECT * FROM users ${whereClause} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`,
      params
    );
    const countResult = await sql.unsafe(
      `SELECT COUNT(*) as total FROM users ${whereClause}`,
      params
    );

    return {
      data: dataResult as unknown as User[],
      total: Number((countResult[0] as Record<string, unknown>)?.['total'] ?? 0),
    };
  }

  async getById(id: string): Promise<User | null> {
    const sql = getConnection();
    const result = await sql.unsafe('SELECT * FROM users WHERE id = $1', [id]);
    return (result[0] as unknown as User) ?? null;
  }

  async getByEmail(email: string): Promise<User | null> {
    const sql = getConnection();
    const result = await sql.unsafe('SELECT * FROM users WHERE email = $1', [email]);
    return (result[0] as unknown as User) ?? null;
  }

  async create(input: {
    email: string;
    name: string;
    passwordHash: string;
    avatar?: string;
  }): Promise<User> {
    const sql = getConnection();
    const id = randomUUID();
    const status = 'ACTIVE';

    const result = await sql.unsafe(
      `INSERT INTO users (id, email, name, password_hash, avatar, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [id, input.email, input.name, input.passwordHash, input.avatar ?? null, status]
    );

    return result[0] as unknown as User;
  }

  async update(
    id: string,
    input: {
      name?: string;
      email?: string;
      avatar?: string;
      status?: User['status'];
    }
  ): Promise<User | null> {
    const sql = getConnection();

    const existing = await this.getById(id);
    if (!existing) return null;

    const setClauses: string[] = [];
    const setParams: string[] = [];

    if (input.name !== undefined) {
      setClauses.push(`name = $${setParams.length + 1}`);
      setParams.push(input.name);
    }
    if (input.email !== undefined) {
      setClauses.push(`email = $${setParams.length + 1}`);
      setParams.push(input.email);
    }
    if (input.avatar !== undefined) {
      setClauses.push(`avatar = $${setParams.length + 1}`);
      setParams.push(input.avatar);
    }
    if (input.status !== undefined) {
      setClauses.push(`status = $${setParams.length + 1}`);
      setParams.push(input.status);
    }

    if (setClauses.length === 0) return existing;

    setClauses.push(`updated_at = NOW()`);
    setParams.push(id);

    const result = await sql.unsafe(
      `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${setParams.length} RETURNING *`,
      setParams
    );

    return (result[0] as unknown as User) ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const sql = getConnection();

    const existing = await this.getById(id);
    if (!existing) return false;

    await sql.unsafe('DELETE FROM users WHERE id = $1', [id]);

    return true;
  }

  async addToTenant(userId: string, tenantId: string, roleId: string): Promise<void> {
    const sql = getConnection();
    const id = randomUUID();

    await sql.unsafe(
      `INSERT INTO tenant_users (id, tenant_id, user_id, role_id, status)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, tenantId, userId, roleId, 'ACTIVE']
    );
  }

  async removeFromTenant(userId: string, tenantId: string): Promise<void> {
    const sql = getConnection();

    await sql.unsafe(
      'DELETE FROM tenant_users WHERE user_id = $1 AND tenant_id = $2',
      [userId, tenantId]
    );
  }
}

export const userService = new UserService();
