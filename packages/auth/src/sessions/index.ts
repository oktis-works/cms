// @oktis-works/auth - Sessões de refresh rotacionáveis e revogáveis

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { getConnection } from '@oktis-works/database';

export interface Session {
  id: string;
  userId: string;
  tenantId: string;
  token: string;
  refreshTokenHash?: string | null;
  refreshFamilyId?: string | null;
  revokedAt?: Date | null;
  replacedBySessionId?: string | null;
  ipAddress?: string;
  userAgent?: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface SessionWithRefreshToken extends Session {
  refreshToken: string;
}

function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function createRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

function mapSession(row: Record<string, unknown>): Session {
  return {
    id: String(row['id']),
    userId: String(row['user_id'] ?? row['userId']),
    tenantId: String(row['tenant_id'] ?? row['tenantId']),
    token: String(row['token'] ?? ''),
    refreshTokenHash: row['refresh_token_hash'] as string | null | undefined,
    refreshFamilyId: row['refresh_family_id'] as string | null | undefined,
    revokedAt: row['revoked_at'] as Date | null | undefined,
    replacedBySessionId: row['replaced_by_session_id'] as string | null | undefined,
    ipAddress: (row['ip_address'] ?? row['ipAddress']) as string | undefined,
    userAgent: (row['user_agent'] ?? row['userAgent']) as string | undefined,
    expiresAt: new Date(String(row['expires_at'] ?? row['expiresAt'])),
    createdAt: new Date(String(row['created_at'] ?? row['createdAt'])),
  };
}

export class SessionService {
  async create(
    userId: string,
    tenantId: string,
    options?: { ipAddress?: string; userAgent?: string; expiresInSeconds?: number; familyId?: string }
  ): Promise<SessionWithRefreshToken> {
    const sql = getConnection();
    const refreshToken = createRefreshToken();
    const refreshFamilyId = options?.familyId ?? randomUUID();
    const expiresInSeconds = options?.expiresInSeconds ?? 60 * 60 * 24 * 30;
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    const values = [
      randomUUID(),
      userId,
      tenantId,
      randomUUID(),
      hashRefreshToken(refreshToken),
      refreshFamilyId,
      options?.ipAddress ?? null,
      options?.userAgent ?? null,
      expiresAt.toISOString(),
    ];
    const insertQuery = `INSERT INTO sessions
           (id, user_id, tenant_id, token, refresh_token_hash, refresh_family_id, ip_address, user_agent, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`;

    // O driver postgres real oferece begin. O fallback mantém compatibilidade
    // com adapters/mocks simples usados por consumidores e pela suíte unitária.
    if (typeof sql.begin !== 'function') {
      await sql.unsafe("SELECT set_config('app.current_tenant_id', $1, false)", [tenantId]);
      const result = await sql.unsafe(insertQuery, values);
      return { ...mapSession(result[0] as Record<string, unknown>), refreshToken };
    }

    return sql.begin(async (tx) => {
      await tx.unsafe("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
      const result = await tx.unsafe(insertQuery, values);

      return { ...mapSession(result[0] as Record<string, unknown>), refreshToken };
    });
  }

  /** Rotaciona atomicamente um refresh token e invalida tokens reutilizados. */
  async rotate(
    refreshToken: string,
    options?: { ipAddress?: string; userAgent?: string; expiresInSeconds?: number }
  ): Promise<SessionWithRefreshToken | null> {
    const sql = getConnection();
    const tokenHash = hashRefreshToken(refreshToken);
    const nextRefreshToken = createRefreshToken();
    const nextSessionId = randomUUID();
    const expiresInSeconds = options?.expiresInSeconds ?? 60 * 60 * 24 * 30;
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

    return sql.begin(async (tx) => {
      await tx.unsafe("SELECT set_config('app.current_refresh_token_hash', $1, true)", [tokenHash]);
      const rows = await tx.unsafe(
        `SELECT * FROM sessions
         WHERE refresh_token_hash = $1
         ORDER BY created_at DESC
         LIMIT 1
         FOR UPDATE`,
        [tokenHash]
      );
      if (!rows[0]) return null;
      const current = mapSession(rows[0] as Record<string, unknown>);
      const currentRow = rows[0] as Record<string, unknown>;
      const familyId = String(currentRow['refresh_family_id'] ?? '');
      const revokedAt = currentRow['revoked_at'];
      const currentExpiry = new Date(String(currentRow['expires_at'] ?? current.expiresAt));

      await tx.unsafe("SELECT set_config('app.current_tenant_id', $1, true)", [current.tenantId]);

      if (revokedAt || Number.isNaN(currentExpiry.getTime()) || currentExpiry.getTime() <= Date.now()) {
        if (familyId) {
          await tx.unsafe(
            'UPDATE sessions SET revoked_at = COALESCE(revoked_at, NOW()) WHERE refresh_family_id = $1',
            [familyId]
          );
        }
        return null;
      }

      await tx.unsafe(
        `UPDATE sessions
         SET revoked_at = NOW(), replaced_by_session_id = $1
         WHERE id = $2`,
        [nextSessionId, current.id]
      );

      const result = await tx.unsafe(
        `INSERT INTO sessions
           (id, user_id, tenant_id, token, refresh_token_hash, refresh_family_id, ip_address, user_agent, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          nextSessionId,
          current.userId,
          current.tenantId,
          randomUUID(),
          hashRefreshToken(nextRefreshToken),
          familyId || randomUUID(),
          options?.ipAddress ?? current.ipAddress ?? null,
          options?.userAgent ?? current.userAgent ?? null,
          expiresAt.toISOString(),
        ]
      );

      return { ...mapSession(result[0] as Record<string, unknown>), refreshToken: nextRefreshToken };
    });
  }

  async revokeByRefreshToken(refreshToken: string): Promise<boolean> {
    const sql = getConnection();
    const tokenHash = hashRefreshToken(refreshToken);
    return sql.begin(async (tx) => {
      await tx.unsafe("SELECT set_config('app.current_refresh_token_hash', $1, true)", [tokenHash]);
      const rows = await tx.unsafe(
        'SELECT id, tenant_id FROM sessions WHERE refresh_token_hash = $1 FOR UPDATE',
        [tokenHash]
      );
      if (!rows[0]) return false;

      await tx.unsafe("SELECT set_config('app.current_tenant_id', $1, true)", [String(rows[0]['tenant_id'])]);
      const result = await tx.unsafe(
        `UPDATE sessions SET revoked_at = COALESCE(revoked_at, NOW())
         WHERE id = $1 AND revoked_at IS NULL
         RETURNING id`,
        [rows[0]['id']]
      );
      return result.length > 0;
    });
  }

  async getByToken(token: string): Promise<Session | null> {
    const sql = getConnection();
    const result = await sql.unsafe(
      'SELECT * FROM sessions WHERE token = $1 AND expires_at > NOW() AND revoked_at IS NULL',
      [token]
    );
    return result[0] ? mapSession(result[0] as Record<string, unknown>) : null;
  }

  async getById(id: string): Promise<Session | null> {
    const sql = getConnection();
    const result = await sql.unsafe(
      'SELECT * FROM sessions WHERE id = $1 AND expires_at > NOW() AND revoked_at IS NULL',
      [id]
    );
    return result[0] ? mapSession(result[0] as Record<string, unknown>) : null;
  }

  async delete(token: string): Promise<boolean> {
    return this.revokeByRefreshToken(token);
  }

  async deleteAllForUser(userId: string, tenantId: string): Promise<number> {
    const sql = getConnection();
    const result = await sql.unsafe(
      `UPDATE sessions SET revoked_at = COALESCE(revoked_at, NOW())
       WHERE user_id = $1 AND tenant_id = $2 AND revoked_at IS NULL`,
      [userId, tenantId]
    );
    return result.count;
  }

  async cleanup(): Promise<number> {
    const sql = getConnection();
    const result = await sql.unsafe(
      "DELETE FROM sessions WHERE expires_at < NOW() OR revoked_at < NOW() - INTERVAL '30 days'"
    );
    return result.count;
  }
}
