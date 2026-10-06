// @oktis-works/database - Bootstrap de banco fresco
//
// Um banco novo não tem NADA: nem o schema core (a tabela `migrations` sequer
// existe — e tem FK para `tenants`), nem o tenant usado pelo CLI. Sem isto,
// `okcms db:migrate` morria com `relation "migrations" does not exist`.
//
// - ensureCoreSchema aplica o schema.sql idempotente SEMPRE (banco fresco
//   cria tudo; banco existente recebe o delta da versão nova — ex.: a coluna
//   users.locale do 0.4.0, que migrations/ de projeto não entrega: o projeto
//   scaffoldado tem migrations/ VAZIO). O schema.sql é 100% idempotente
//   (IF NOT EXISTS em tudo, policies guardadas por pg_policies, DROP TRIGGER
//   antes do CREATE) — a detecção via to_regclass só serve para reportar se
//   era banco fresco, e a aplicação roda sob advisory lock (api/worker/cli
//   subindo juntos não disputam DDL).
// - resolveTenantId traduz o `--tenant` (default: "default") para o UUID real
//   de tenants.slug, criando o tenant default na primeira vez (bootstrap).

import { getConnection } from '../connection.js';
import { getSchema } from '../schema/index.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Sincroniza o schema core (schema.sql idempotente) e devolve `true` quando
 * o banco era fresco (era a primeira execução), `false` quando já existia —
 * nesse caso o schema é reexecutado mesmo assim para aplicar o delta da
 * versão do pacote (upgrade de consumidor: migrations/ de projeto é vazio).
 */
export async function ensureCoreSchema(): Promise<boolean> {
  const sql = getConnection();

  const probe = await sql<{ exists: string | null }[]>`
    SELECT to_regclass('public.tenants')::text AS exists
  `;
  const fresh = !probe[0]?.exists;

  await sql.begin(async (tx) => {
    // Serializa execuções concorrentes (api + worker + cli subindo juntos):
    // CREATE TABLE IF NOT EXISTS simultâneo tem corrida de unique em pg_class.
    await tx`SELECT pg_advisory_xact_lock(hashtext('okcms.core.schema'))`;
    // Só warnings/erros: o schema tem ALTER ... ADD COLUMN IF NOT EXISTS
    // redundantes (a coluna já vem no CREATE TABLE) e o Postgres responde
    // NOTICE 42701 "already exists, skipping" — ruído puro no output do init.
    await tx`SET client_min_messages = warning`;
    await tx.unsafe(getSchema());
  });
  return fresh;
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
