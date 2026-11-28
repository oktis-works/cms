// @oktis-works/cms - Criação de usuários (comandos `user:create` e `dev`)
//
// Extraído de commands.ts para que o `okcms dev` crie o primeiro usuário
// pelo MESMO caminho do `user:create` — uma fonte de verdade para hash,
// RBAC e vínculo tenant.

import { initDb } from './db-init.js';

/** Papéis canônicos da política RBAC (slugs em MAIÚSCULAS). */
export const VALID_ROLES = ['SUPER_ADMIN', 'TENANT_ADMIN', 'EDITOR', 'AUTHOR', 'VIEWER'] as const;

export interface CreateUserInput {
  email: string;
  name: string;
  password: string;
  /** Default: EDITOR. */
  role?: string;
  /** Slug do tenant. Default: `default`. */
  tenant?: string;
}

/**
 * Cria o usuário, aplica o hash e vincula o papel no tenant (upsert —
 * reativar um usuário desvinculado funciona). Lança Error descritiva.
 */
export async function createUserAccount(input: CreateUserInput): Promise<void> {
  // A política RBAC usa slugs em MAIÚSCULAS: `--role editor` → EDITOR.
  const roleSlug = (input.role ?? 'EDITOR').toUpperCase();
  if (!(VALID_ROLES as readonly string[]).includes(roleSlug)) {
    throw new Error(`Invalid role: ${roleSlug} — use one of: ${VALID_ROLES.join(', ')}`);
  }

  await initDb();
  const { ensureCoreSchema, resolveTenantId, seedDefaultRoles, getConnection } = await import(
    '@oktis-works/database'
  );
  const { hashPassword, normalizeEmail } = await import('@oktis-works/auth');
  const { randomUUID } = await import('node:crypto');

  await ensureCoreSchema();
  await seedDefaultRoles();

  const sql = getConnection();
  const normalizedEmail = normalizeEmail(input.email);
  const existing = await sql.unsafe('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
  if (existing.length > 0) {
    throw new Error(`User already exists: ${normalizedEmail}`);
  }

  const passwordHash = await hashPassword(input.password);
  const userId = randomUUID();

  const tenantId = await resolveTenantId(input.tenant ?? 'default');
  await sql.unsafe(
    `INSERT INTO users (id, email, name, password_hash, status, tenant_id)
     VALUES ($1, $2, $3, $4, 'ACTIVE', $5)`,
    [userId, normalizedEmail, input.name, passwordHash, tenantId]
  );

  const roles = await sql.unsafe(
    `SELECT id FROM roles
     WHERE slug = $1 AND (tenant_id IS NULL OR tenant_id = $2)
     ORDER BY tenant_id NULLS LAST
     LIMIT 1`,
    [roleSlug, tenantId]
  );
  if (roles.length === 0) {
    throw new Error(`Role "${roleSlug}" not found after seeding.`);
  }

  await sql.unsafe(
    `INSERT INTO tenant_users (tenant_id, user_id, role_id, status)
     VALUES ($1, $2, $3, 'ACTIVE')
     ON CONFLICT (tenant_id, user_id)
     DO UPDATE SET role_id = EXCLUDED.role_id, status = 'ACTIVE'`,
    [tenantId, userId, roles[0]!['id'] as string]
  );
}

/** Existe algum usuário no banco? (para o `dev` decidir criar o admin) */
export async function anyUserExists(): Promise<boolean> {
  await initDb();
  const { ensureCoreSchema, getConnection } = await import('@oktis-works/database');
  await ensureCoreSchema();
  const rows = await getConnection().unsafe('SELECT 1 AS one FROM users LIMIT 1');
  return rows.length > 0;
}

/** Retorna o primeiro usuário com email e password_hash (para validar se o hash é válido) */
export async function getFirstUser(): Promise<{ email: string; password_hash: string } | null> {
  await initDb();
  const { ensureCoreSchema, getConnection } = await import('@oktis-works/database');
  await ensureCoreSchema();
  const rows = await getConnection().unsafe<{ email: string; password_hash: string }[]>('SELECT email, password_hash FROM users LIMIT 1');
  return rows[0] ?? null;
}

/** Verifica se o hash é um hash bcrypt válido (não dummy) */
export function isValidBcryptHash(hash: string): boolean {
  // bcrypt hashes start with $2a$, $2b$, or $2y$ followed by cost and 53-char salt/hash
  return /^\$2[aby]\$\d{2}\$[A-Za-z0-9]{53}$/.test(hash);
}

/** Verifica se um e-mail específico já existe no banco (case-insensitive). */
export async function userExistsByEmail(email: string): Promise<boolean> {
  await initDb();
  const { ensureCoreSchema, getConnection } = await import('@oktis-works/database');
  const { normalizeEmail } = await import('@oktis-works/auth');
  await ensureCoreSchema();
  const normalizedEmail = normalizeEmail(email);
  const rows = await getConnection().unsafe(
    'SELECT 1 AS one FROM users WHERE email = $1 LIMIT 1',
    [normalizedEmail]
  );
  return rows.length > 0;
}

/** Redefine a senha de um usuário existente. */
export async function resetUserPassword(input: { email: string; password: string }): Promise<void> {
  await initDb();
  const { ensureCoreSchema, getConnection } = await import('@oktis-works/database');
  const { hashPassword, normalizeEmail } = await import('@oktis-works/auth');
  await ensureCoreSchema();

  const normalizedEmail = normalizeEmail(input.email);
  const passwordHash = await hashPassword(input.password);

  const result = await getConnection().unsafe(
    'UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING id',
    [passwordHash, normalizedEmail]
  );

  if (result.length === 0) {
    throw new Error(`User not found: ${normalizedEmail}`);
  }
}
