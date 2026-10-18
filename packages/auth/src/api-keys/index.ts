// @oktis-works/auth - API Keys para clientes API-first
//
// A API key NUNCA autoriza requests diretamente: ela é trocada por
// access JWT + refresh token em POST /api/v1/auth/api-key-login. Guardamos
// apenas o hash sha256 do valor completo; o prefixo em claro serve para
// localizar a row sob RLS (lookup transacional com contexto de tenant).

import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { getConnection } from '@oktis-works/database';

export interface ApiKey {
  id: string;
  tenantId: string;
  userId: string;
  name: string;
  keyPrefix: string;
  oneTime: boolean;
  expiresAt?: Date | null;
  lastUsedAt?: Date | null;
  useCount: number;
  revokedAt?: Date | null;
  createdBy?: string | null;
  createdAt: Date;
}

export interface ApiKeyWithPlaintext extends ApiKey {
  /** Valor completo — retornado SOMENTE na criação, nunca persistido em claro. */
  plaintext: string;
}

export interface CreateApiKeyInput {
  tenantId: string;
  userId: string;
  name: string;
  oneTime?: boolean;
  /** ISO string ou Date; null/undefined = sem expiração. */
  expiresAt?: string | Date | null;
  createdBy?: string;
}

const KEY_ALGORITHM = 'okcms';

function hashApiKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

/** Constant-time compare de dois hashes hex de mesmo tamanho. */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

function normalizeExpiry(value?: string | Date | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid expiresAt');
  return date.toISOString();
}

function mapApiKey(row: Record<string, unknown>): ApiKey {
  return {
    id: String(row['id']),
    tenantId: String(row['tenant_id'] ?? row['tenantId']),
    userId: String(row['user_id'] ?? row['userId']),
    name: String(row['name']),
    keyPrefix: String(row['key_prefix'] ?? row['keyPrefix']),
    oneTime: Boolean(row['one_time'] ?? row['oneTime']),
    expiresAt: (row['expires_at'] ?? row['expiresAt']) as Date | null | undefined,
    lastUsedAt: (row['last_used_at'] ?? row['lastUsedAt']) as Date | null | undefined,
    useCount: Number(row['use_count'] ?? row['useCount'] ?? 0),
    revokedAt: (row['revoked_at'] ?? row['revokedAt']) as Date | null | undefined,
    createdBy: (row['created_by'] ?? row['createdBy']) as string | null | undefined,
    createdAt: new Date(String(row['created_at'] ?? row['createdAt'])),
  };
}

export class ApiKeyService {
  /**
   * Cria uma key e devolve o valor claro UMA única vez.
   * Formato: okcms_<prefix-hex>_<secret-base64url>
   */
  async create(input: CreateApiKeyInput): Promise<ApiKeyWithPlaintext> {
    const sql = getConnection();
    const secret = randomBytes(32).toString('base64url');
    const prefix = randomBytes(8).toString('hex');
    const plaintext = `${KEY_ALGORITHM}_${prefix}_${secret}`;
    const expiresAt = normalizeExpiry(input.expiresAt);

    const insertQuery = `INSERT INTO api_keys
         (id, tenant_id, user_id, name, key_prefix, key_hash, one_time, expires_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`;
    const values = [
      randomUUID(),
      input.tenantId,
      input.userId,
      input.name,
      prefix,
      hashApiKey(plaintext),
      input.oneTime ?? false,
      expiresAt,
      input.createdBy ?? null,
    ];

    // Transação + contexto de tenant local: RLS aplica mesmo quando a
    // conexão vem de pool compartilhado (mesmo padrão de SessionService).
    const run = async (tx: { unsafe: typeof sql.unsafe }) => {
      await tx.unsafe("SELECT set_config('app.current_tenant_id', $1, true)", [input.tenantId]);
      const result = await tx.unsafe(insertQuery, values);
      return { ...mapApiKey(result[0] as Record<string, unknown>), plaintext };
    };

    if (typeof sql.begin !== 'function') return run(sql);
    return sql.begin(run);
  }

  /**
   * Valida o valor completo e registra o consumo (last_used_at/use_count).
   * Keys single-use são revogadas aqui; expiradas/revogadas/uso único estourado
   * devolvem null.
   */
  async verify(plaintext: string, tenantId: string): Promise<ApiKey | null> {
    const sql = getConnection();
    const parts = plaintext.split('_');
    if (parts.length !== 3 || parts[0] !== KEY_ALGORITHM) return null;
    const prefix = parts[1]!;
    const expectedHash = hashApiKey(plaintext);

    const run = async (tx: { unsafe: typeof sql.unsafe }) => {
      // Lookup restrito ao prefixo + tenant: a policy api_key_prefix_lookup
      // permite o SELECT antes do contexto "oficial" da requisição existir.
      await tx.unsafe("SELECT set_config('app.current_api_key_prefix', $1, true)", [prefix]);
      await tx.unsafe("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
      const rows = await tx.unsafe(
        'SELECT * FROM api_keys WHERE tenant_id = $1 AND key_prefix = $2 LIMIT 1',
        [tenantId, prefix]
      );
      const row = rows[0] as Record<string, unknown> | undefined;
      if (!row) return null;

      const storedHash = String(row['key_hash'] ?? '');
      const revokedAt = row['revoked_at'] as Date | null;
      const expiresAt = row['expires_at'] as Date | null;

      if (!safeCompare(storedHash, expectedHash)) return null;
      if (revokedAt) return null;
      if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) return null;

      const updated = await tx.unsafe(
        `UPDATE api_keys
         SET last_used_at = NOW(),
             use_count = use_count + 1,
             revoked_at = CASE WHEN one_time THEN NOW() ELSE revoked_at END
         WHERE id = $1
         RETURNING *`,
        [String(row['id'])]
      );
      return updated[0] ? mapApiKey(updated[0] as Record<string, unknown>) : null;
    };

    if (typeof sql.begin !== 'function') return run(sql);
    return sql.begin(run);
  }

  /** Lista as keys do tenant (nunca expõe key_hash). */
  async list(tenantId: string): Promise<ApiKey[]> {
    const sql = getConnection();
    const run = async (tx: { unsafe: typeof sql.unsafe }) => {
      await tx.unsafe("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
      const rows = await tx.unsafe(
        'SELECT * FROM api_keys WHERE tenant_id = $1 ORDER BY created_at DESC',
        [tenantId]
      );
      return (rows as Record<string, unknown>[]).map(mapApiKey);
    };
    if (typeof sql.begin !== 'function') return run(sql);
    return sql.begin(run);
  }

  /** Revogação lógica — a key deixa de ser aceita no login imediatamente. */
  async revoke(id: string, tenantId: string): Promise<boolean> {
    const sql = getConnection();
    const run = async (tx: { unsafe: typeof sql.unsafe }) => {
      await tx.unsafe("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
      const result = await tx.unsafe(
        'UPDATE api_keys SET revoked_at = COALESCE(revoked_at, NOW()) WHERE id = $1 AND tenant_id = $2 AND revoked_at IS NULL RETURNING id',
        [id, tenantId]
      );
      return result.length > 0;
    };
    if (typeof sql.begin !== 'function') return run(sql);
    return sql.begin(run);
  }

  /** Remove keys revogadas/expiradas há mais de 30 dias (higiene de banco). */
  async cleanup(): Promise<number> {
    const sql = getConnection();
    const result = await sql.unsafe(
      "DELETE FROM api_keys WHERE (revoked_at IS NOT NULL AND revoked_at < NOW() - INTERVAL '30 days') OR (expires_at IS NOT NULL AND expires_at < NOW() - INTERVAL '30 days')"
    );
    return result.count;
  }
}
