// @oktis-works/auth - Session Management

import { randomUUID } from 'node:crypto';
import { getConnection } from '@oktis-works/database';

export interface Session {
  id: string;
  userId: string;
  tenantId: string;
  token: string;
  ipAddress?: string;
  userAgent?: string;
  expiresAt: Date;
  createdAt: Date;
}

const SESSION_EXPIRY_HOURS = 7 * 24; // 7 days default

export class SessionService {
  async create(userId: string, tenantId: string, options?: { ipAddress?: string; userAgent?: string }): Promise<Session> {
    const sql = getConnection();
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + SESSION_EXPIRY_HOURS * 3600 * 1000);

    const result = await sql.unsafe(
      `INSERT INTO sessions (id, user_id, tenant_id, token, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [randomUUID(), userId, tenantId, token, options?.ipAddress ?? null, options?.userAgent ?? null, expiresAt.toISOString()]
    );

    return result[0] as unknown as Session;
  }

  async getByToken(token: string): Promise<Session | null> {
    const sql = getConnection();
    const result = await sql.unsafe(
      'SELECT * FROM sessions WHERE token = $1 AND expires_at > NOW()',
      [token]
    );
    return (result[0] as unknown as Session) ?? null;
  }

  async getById(id: string): Promise<Session | null> {
    const sql = getConnection();
    const result = await sql.unsafe(
      'SELECT * FROM sessions WHERE id = $1 AND expires_at > NOW()',
      [id]
    );
    return (result[0] as unknown as Session) ?? null;
  }

  async delete(token: string): Promise<boolean> {
    const sql = getConnection();
    const result = await sql.unsafe('DELETE FROM sessions WHERE token = $1', [token]);
    return result.count > 0;
  }

  async deleteAllForUser(userId: string, tenantId: string): Promise<number> {
    const sql = getConnection();
    const result = await sql.unsafe(
      'DELETE FROM sessions WHERE user_id = $1 AND tenant_id = $2',
      [userId, tenantId]
    );
    return result.count;
  }

  async cleanup(): Promise<number> {
    const sql = getConnection();
    const result = await sql.unsafe('DELETE FROM sessions WHERE expires_at < NOW()');
    return result.count;
  }
}
