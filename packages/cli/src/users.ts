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
  const { hashPassword } = await import('@oktis-works/auth');
  const { randomUUID } = await import('node:crypto');

  await ensureCoreSchema();
  await seedDefaultRoles();

  const sql = getConnection();
  const existing = await sql.unsafe('SELECT id FROM users WHERE email = $1', [input.email]);
  if (existing.length > 0) {
    throw new Error(`User already exists: ${input.email}`);
  }

  const passwordHash = await hashPassword(input.password);
  const userId = randomUUID();
  await sql.unsafe(
    `INSERT INTO users (id, email, name, password_hash, status)
     VALUES ($1, $2, $3, $4, 'ACTIVE')`,
    [userId, input.email, input.name, passwordHash]
  );

  const tenantId = await resolveTenantId(input.tenant ?? 'default');
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
