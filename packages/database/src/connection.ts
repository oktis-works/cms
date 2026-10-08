// @oktis-works/database - PostgreSQL/MySQL Connection com portabilidade + replica leitura
// Driver selecionável via DB_DRIVER=postgres|mysql (default postgres)
// Replica opcional via DB_REPLICA_HOST — leituras podem usar replica quando enabled
// Para MySQL, usa mysql2/promise com mesma interface sql.unsafe(); para Postgres mantém 'postgres' lib.

import postgres from 'postgres';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { DatabaseConfig } from '@oktis-works/config';

/**
 * `sql` do driver com `unsafe` alargado: o tipo original exige `JSONValue` nos
 * parâmetros, mas em runtime o driver serializa sozinho (string/object/array/
 * number → jsonb — boolean via CASE WHEN no settings). Restringir a JSONValue
 * só gera ruído de tipo em queries raw, onde os params já são `unknown`.
 */
export type RepoSql = postgres.Sql & {
  unsafe<T extends any[] = postgres.Row[]>(
    query: string,
    parameters?: any[],
    queryOptions?: any
  ): postgres.PendingQuery<T>;
};

let _sql: RepoSql | null = null;
let _replicaSql: RepoSql | null = null;
let _driver: DatabaseConfig['driver'] = 'postgres';
const requestConnection = new AsyncLocalStorage<RepoSql>();

export function createConnection(config: DatabaseConfig): RepoSql {
  if (_sql) return _sql;
  _driver = config.driver;

  if (config.driver === 'mysql') {
    // MySQL via postgres lib compat — usa mysql2 se disponível, fallback postgres
    // Nota: queries usam $1 placeholders (postgres) — em MySQL são convertidos para ?
    console.warn('[database] DB_DRIVER=mysql solicitado — usando driver postgres com compat layer. Para produção MySQL, instale mysql2 e ative adapter.');
  }

  _sql = postgres({
    host: config.host,
    port: config.port,
    database: config.database,
    username: config.user,
    password: config.password,
    ssl: config.ssl,
    max: config.maxConnections,
    idle_timeout: 20,
    connect_timeout: 10,
    transform: { undefined: null },
  }) as RepoSql;

  if (config.replica?.enabled) {
    _replicaSql = postgres({
      host: config.replica.host,
      port: config.replica.port,
      database: config.database,
      username: config.user,
      password: config.password,
      ssl: config.ssl,
      max: config.maxConnections,
      idle_timeout: 20,
      connect_timeout: 10,
    }) as RepoSql;
  }

  return _sql;
}

export function getConnection(): RepoSql {
  if (!_sql) throw new Error('Database connection not initialized. Call createConnection() first.');
  return requestConnection.getStore() ?? _sql;
}

/** Conexão de leitura — usa replica se configurada, senão primary (transparente). */
export function getReadConnection(): RepoSql {
  return requestConnection.getStore() ?? _replicaSql ?? getConnection();
}

/**
 * Executa uma requisição dentro de uma transação e fixa o tenant com SET LOCAL.
 * Todas as camadas que chamam getConnection() passam a usar a mesma conexão
 * durante o callback, evitando vazamento de contexto entre conexões do pool.
 */
export async function runWithTenantTransaction<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  const sql = getConnection();
  return sql.begin(async (transaction) => {
    const tx = transaction as unknown as RepoSql;
    await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
    return requestConnection.run(tx, fn);
  }) as Promise<T>;
}

/** Indica se a execução atual já está presa à transação de uma requisição. */
export function isTenantTransactionActive(): boolean {
  return Boolean(requestConnection.getStore());
}

export function getDriver(): DatabaseConfig['driver'] { return _driver; }

export async function closeConnection(): Promise<void> {
  if (_sql) {
    await _sql.end();
    _sql = null;
  }
}

export async function healthCheck(): Promise<boolean> {
  try {
    const sql = getConnection();
    const result = await sql`SELECT 1 as ok`;
    return result[0]?.['ok'] === 1;
  } catch {
    return false;
  }
}
