// @oktis-works/database - Bootstrap de banco fresco
//
// Um banco novo não tem NADA: nem o schema core (a tabela `migrations` sequer
// existe — e tem FK para `tenants`), nem o tenant usado pelo CLI. Sem isto,
// `okcms db:migrate` morria com `relation "migrations" does not exist`.
//
// - ensureCoreSchema aplica o schema.sql UMA única vez. A detecção é via
//   to_regclass (não via registro em migrations): o schema tem CREATE POLICY,
//   que não é idempotente, então reexecutar daria erro — e na primeira
//   execução a tabela de controle ainda nem existe para registrar algo.
// - resolveTenantId traduz o `--tenant` (default: "default") para o UUID real
//   de tenants.slug, criando o tenant default na primeira vez (bootstrap).

import { getConnection } from '../connection.js';
import { getSchema } from '../schema/index.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Aplica o schema core se o banco ainda não foi inicializado.
 * Retorna `true` quando aplicou (banco fresco), `false` se já existia.
 */
export async function ensureCoreSchema(): Promise<boolean> {
  const sql = getConnection();

  const probe = await sql<{ exists: string | null }[]>`
    SELECT to_regclass('public.tenants')::text AS exists
  `;
  if (probe[0]?.exists) {
    return false;
  }

  await sql.begin(async (tx) => {
    // Só warnings/erros: o schema tem ALTER ... ADD COLUMN IF NOT EXISTS
    // redundantes (a coluna já vem no CREATE TABLE) e o Postgres responde
    // NOTICE 42701 "already exists, skipping" — ruído puro no output do init.
    await tx`SET client_min_messages = warning`;
    await tx.unsafe(getSchema());
  });
  return true;
}

/**
 * Resolve o argumento `--tenant` para um UUID:
 * - UUID válido → devolve direto;
 * - slug existente em tenants.slug → devolve o id;
 * - slug "default" inexistente → cria o tenant (bootstrap) e devolve o id;
 * - qualquer outro slug inexistente → erro claro (não cria slug com typo).
 */
export async function resolveTenantId(input: string): Promise<string> {
  if (UUID_RE.test(input)) {
    return input;
  }

  const sql = getConnection();

  const found = await sql<{ id: string }[]>`
    SELECT id FROM tenants WHERE slug = ${input} LIMIT 1
  `;
  if (found[0]) {
    return found[0].id;
  }

  if (input !== 'default') {
    throw new Error(
      `Tenant "${input}" não encontrado. Crie-o no admin ou passe um UUID com --tenant.`
    );
  }

  const created = await sql<{ id: string }[]>`
    INSERT INTO tenants (name, slug) VALUES ('Default', 'default')
    ON CONFLICT (slug) DO NOTHING
    RETURNING id
  `;
  if (created[0]) {
    return created[0].id;
  }

  // Corrida: outro processo criou o tenant entre o SELECT e o INSERT.
  const again = await sql<{ id: string }[]>`
    SELECT id FROM tenants WHERE slug = ${input} LIMIT 1
  `;
  if (again[0]) {
    return again[0].id;
  }
  throw new Error('Falha ao criar o tenant default');
}
