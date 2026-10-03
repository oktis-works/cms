// @oktis-works/database - Seeds de dados padrão (roles + settings)
//
// - As 5 roles do DEFAULT_POLICY do @oktis-works/auth precisam EXISTIR no
//   banco: o JWT carrega só os slugs (lidos de roles via tenant_users) e sem
//   a linha da role o usuário nasce sem papel → 403 em toda rota protegida
//   (registrava, logava, mas não operava nada).
// - Settings do grupo `general` para o admin ter o que editar (a tabela
//   nasce vazia).
//
// Idempotente: roda em QUALQUER banco (fresco ou existente) sem duplicar —
// roles via WHERE NOT EXISTS, settings via ON CONFLICT (UNIQUE(key,tenant)).

import { getConnection } from '../connection.js';
import { resolveTenantId } from './bootstrap.js';
import type postgres from 'postgres';

type Sql = postgres.Sql;

/** Roles canônicas — DEVEM casar com os slugs do DEFAULT_POLICY do auth. */
export const DEFAULT_ROLES = [
  { name: 'Super Admin', slug: 'SUPER_ADMIN' },
  { name: 'Administrador', slug: 'TENANT_ADMIN' },
  { name: 'Editor', slug: 'EDITOR' },
  { name: 'Autor', slug: 'AUTHOR' },
  { name: 'Leitor', slug: 'VIEWER' },
] as const;

/** Settings iniciais do grupo `general` (form de Settings → General da admin). */
export const DEFAULT_SETTINGS = [
  { key: 'siteTitle', value: 'Meu Site', type: 'string' },
  { key: 'siteDescription', value: 'Um novo site feito com OkCMS', type: 'string' },
  { key: 'language', value: 'pt-BR', type: 'string' },
  { key: 'timezone', value: 'America/Sao_Paulo', type: 'string' },
] as const;

/** Cria (se faltar) as roles globais (tenant_id NULL) da política. Retorna qtd criada. */
export async function seedDefaultRoles(sql: Sql = getConnection()): Promise<number> {
  let inserted = 0;
  for (const role of DEFAULT_ROLES) {
    // Cast explícito: $2 aparece em dois contextos (valor de inserção e
    // comparação de coluna) — sem cast o Postgres deduz tipos diferentes
    // para o mesmo parâmetro e falha com "inconsistent types deduced".
    const rows = await sql.unsafe(
      `INSERT INTO roles (name, slug, is_system, permissions)
       SELECT $1::varchar, $2::varchar, true, '[]'::jsonb
       WHERE NOT EXISTS (SELECT 1 FROM roles WHERE slug = $2::varchar AND tenant_id IS NULL)
       RETURNING id`,
      [role.name, role.slug]
    );
    inserted += rows.length;
  }
  return inserted;
}

/** Cria (se faltar) os settings iniciais no tenant dado. Retorna qtd criada. */
export async function seedDefaultSettings(
  tenantId: string,
  sql: Sql = getConnection()
): Promise<number> {
  let inserted = 0;
  for (const s of DEFAULT_SETTINGS) {
    // RETURNING: sem ele o driver devolve [] mesmo com insert bem-sucedido
    // (contaria 0 no log e quebraria a detecção de idempotência).
    const rows = await sql.unsafe(
      `INSERT INTO settings (tenant_id, key, value, "group", type)
       VALUES ($1, $2, to_jsonb($3::text), 'general', $4)
       ON CONFLICT (key, tenant_id) DO NOTHING
       RETURNING id`,
      [tenantId, s.key, s.value, s.type]
    );
    inserted += rows.length;
  }
  return inserted;
}

/**
 * Seed completo (roles + settings do tenant default). Idempotente — usar em
 * `db:migrate`/`seed` da CLI e como fallback no registro do primeiro usuário.
 */
export async function seedCoreData(
  sql: Sql = getConnection()
): Promise<{ roles: number; settings: number }> {
  const roles = await seedDefaultRoles(sql);
  const tenantId = await resolveTenantId('default');
  const settings = await seedDefaultSettings(tenantId, sql);
  return { roles, settings };
}
