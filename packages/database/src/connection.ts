// @oktis-works/database - PostgreSQL connection adapter

import { AsyncLocalStorage } from 'node:async_hooks';
import postgres from 'postgres';
import type { DatabaseConfig } from '@oktis-works/config';

type Row = Record<string, unknown>;
export type QueryResult<T extends any[]> = T & { count: number };
export interface DatabaseCapabilities {
  provider: 'postgres';
  transactionalDdl: boolean;
  rowLevelSecurity: boolean;
  advisoryLocks: boolean;
  jsonType: 'jsonb';
  namespaceStrategy: 'schema';
}

export interface RepoSql {
  <T extends any[] = Row[]>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  unsafe<T extends any[] = Row[]>(query: string, parameters?: unknown[], queryOptions?: unknown): Promise<QueryResult<T>>;
  begin<T>(fn: (transaction: RepoSql) => Promise<T>): Promise<T>;
  end(options?: { timeout?: number }): Promise<void>;
  readonly driver: 'postgres';
  reserve?(): Promise<RepoSql>;
}

let _sql: RepoSql | null = null;
let _replicaSql: RepoSql | null = null;
let _driver: 'postgres' = 'postgres';
let _connectionKey = '';
const requestConnection = new AsyncLocalStorage<RepoSql>();

export function sqlId(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '');
}

function configKey(config: DatabaseConfig): string {
  return JSON.stringify({
    driver: config.driver,
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    ssl: config.ssl,
    tls: config.tls,
    maxConnections: config.maxConnections,
    replica: config.replica,
  });
}

/**
 * Wraps a postgres.js reserved connection (which lacks .begin()) to expose a
 * .begin() shim that uses manual BEGIN/COMMIT/ROLLBACK on the same session.
 * This is necessary because the migration runner calls sql.begin() on the
 * connection it receives, including the reserved one.
 */
function wrapReservedConnection(reserved: RepoSql & { release?: () => void }): RepoSql {
  const wrapped = reserved as RepoSql;
  if (typeof wrapped.begin !== 'function') {
    (wrapped as RepoSql & { begin: RepoSql['begin'] }).begin = async <T>(fn: (tx: RepoSql) => Promise<T>): Promise<T> => {
      await (reserved as unknown as { (s: TemplateStringsArray, ...v: unknown[]): Promise<unknown[]> })`BEGIN`;
      try {
        const result = await fn(reserved);
        await (reserved as unknown as { (s: TemplateStringsArray, ...v: unknown[]): Promise<unknown[]> })`COMMIT`;
        return result;
      } catch (error) {
        await (reserved as unknown as { (s: TemplateStringsArray, ...v: unknown[]): Promise<unknown[]> })`ROLLBACK`.catch(() => undefined);
        throw error;
      }
    };
  }
  if (typeof (wrapped as RepoSql & { end?: unknown }).end !== 'function') {
    (wrapped as RepoSql & { end: RepoSql['end'] }).end = async () => { reserved.release?.(); };
  }
  Object.defineProperty(wrapped, 'driver', { value: 'postgres', enumerable: true, configurable: true });
  return wrapped;
}

function postgresConnection(config: DatabaseConfig): RepoSql {
  const raw = postgres({
    host: config.host,
    port: config.port,
    database: config.database,
    username: config.user,
    password: config.password,
    ssl: config.ssl,
    max: config.maxConnections ?? 10,
    idle_timeout: 60,
    connect_timeout: 10,
    max_lifetime: 60 * 30,
    transform: { undefined: null },
    onnotice: (notice) => {
      if (notice['severity'] === 'WARNING') console.warn('[postgres]', notice['message']);
    },
  });
  const client = raw as unknown as RepoSql & { reserve?: () => Promise<RepoSql> };
  const originalReserve = client.reserve?.bind(raw);
  if (originalReserve) {
    client.reserve = async () => wrapReservedConnection(await originalReserve() as RepoSql & { release?: () => void });
  }
  Object.defineProperty(client, 'driver', { value: 'postgres', enumerable: true });
  return client as unknown as RepoSql;
}

function replacePostgresParameters(query: string, parameters: unknown[]): { query: string; values: unknown[] } {
  const values: unknown[] = [];
  const converted = query.replace(/\$(\d+)/g, (_match, index: string) => {
    const value = parameters[Number(index) - 1];
    if (Array.isArray(value)) {
      if (value.length === 0) return 'NULL';
      values.push(...value);
      return value.map(() => '?').join(', ');
    }
    values.push(value);
    return '?';
  });
  return { query: converted, values };
}

function normalizeDriverRows(result: unknown): Row[] {
  if (!Array.isArray(result)) return [];
  const rows = result[0];
  if (Array.isArray(rows)) return rows as Row[];
  return result.length > 0 && typeof rows === 'object' && rows !== null ? result as Row[] : [];
}

function withCount<T extends Row[]>(rows: T, count: number): QueryResult<T> {
  Object.defineProperty(rows, 'count', { value: count, enumerable: false, configurable: true });
  return rows as QueryResult<T>;
}

function stripReturning(query: string): { query: string; returning?: string } {
  const match = /\s+RETURNING\s+([\s\S]*?)\s*;?\s*$/i.exec(query);
  if (!match || match.index === undefined) return { query };
  return { query: query.slice(0, match.index), returning: match[1]!.trim() };
}

export function createConnection(config: DatabaseConfig): RepoSql {
  const key = configKey(config);
  if (_sql && _connectionKey === key) return _sql;
  if (_sql && _connectionKey !== key) throw new Error('A different database configuration is already active; close the current connection first.');
  _driver = 'postgres';
  _connectionKey = key;
  _sql = postgresConnection(config);
  if (config.replica?.enabled) {
    const replicaConfig = { ...config, host: config.replica.host, port: config.replica.port, replica: undefined };
    _replicaSql = postgresConnection(replicaConfig);
  }
  return _sql;
}

export function getConnection(): RepoSql {
  if (!_sql) throw new Error('Database connection not initialized. Call createConnection() first.');
  return requestConnection.getStore() ?? _sql;
}

export function getReadConnection(): RepoSql {
  return requestConnection.getStore() ?? _replicaSql ?? getConnection();
}

export async function runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
  if (requestConnection.getStore()) return fn();
  return getConnection().begin((transaction) => requestConnection.run(transaction, fn));
}

export async function runWithTenantTransaction<T>(
  tenantId: string,
  fn: () => Promise<T>,
  userId?: string
): Promise<T> {
  return getConnection().begin(async (transaction) => {
    await transaction.unsafe("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
    if (userId) {
      await transaction.unsafe("SELECT set_config('app.current_user_id', $1, true)", [userId]);
    }
    return requestConnection.run(transaction, fn);
  });
}

export function isTenantTransactionActive(): boolean {
  return Boolean(requestConnection.getStore());
}

export function getDriver(): 'postgres' { return _driver; }

export function getDatabaseCapabilities(): DatabaseCapabilities {
  return { provider: 'postgres', transactionalDdl: true, rowLevelSecurity: true, advisoryLocks: true, jsonType: 'jsonb', namespaceStrategy: 'schema' };
}

export async function assertSupportedServerVersion(): Promise<void> {
  const rows = await getConnection().unsafe<{ version?: string }[]>('SELECT VERSION() AS version');
  const version = String(rows[0]?.version ?? '').match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!version) return;
  const major = Number(version[1]);
  const minor = Number(version[2]);
  const patch = Number(version[3] ?? 0);
  if (major < 16 || (major === 16 && minor === 0)) {
    throw new Error(`Unsupported PostgreSQL server version ${version[0]}; OkCMS requires 16 or newer.`);
  }
}

export async function closeConnection(): Promise<void> {
  await _replicaSql?.end();
  await _sql?.end();
  _replicaSql = null;
  _sql = null;
  _connectionKey = '';
}

export async function healthCheck(): Promise<boolean> {
  try {
    const rows = await getConnection().unsafe<{ ok: number }[]>('SELECT 1 AS ok');
    return Number(rows[0]?.['ok']) === 1;
  } catch {
    return false;
  }
}
