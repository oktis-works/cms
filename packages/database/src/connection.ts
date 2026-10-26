// @oktis-works/database - provider-neutral connection adapter

import { AsyncLocalStorage } from 'node:async_hooks';
import postgres from 'postgres';
import mysql from 'mysql2/promise';
import mariadb from 'mariadb';
import type { DatabaseConfig, DatabaseDriver } from '@oktis-works/config';

type Row = Record<string, unknown>;
export type QueryResult<T extends any[]> = T & { count: number };
export interface DatabaseCapabilities {
  provider: DatabaseDriver;
  transactionalDdl: boolean;
  rowLevelSecurity: boolean;
  advisoryLocks: boolean;
  jsonType: 'jsonb' | 'json';
  namespaceStrategy: 'schema' | 'database';
}

export interface DatabaseAdapter {
  readonly capabilities: DatabaseCapabilities;
  connect(config: DatabaseConfig): RepoSql;
  close(): Promise<void>;
  healthCheck(): Promise<boolean>;
  quoteIdentifier(identifier: string): string;
  normalizeError(error: unknown): Error;
}
type RawConnection = {
  query: (query: string, values?: unknown[]) => Promise<unknown>;
  beginTransaction?: () => Promise<void>;
  commit?: () => Promise<void>;
  rollback?: () => Promise<void>;
  release?: () => void;
};

export interface RepoSql {
  <T extends any[] = Row[]>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  unsafe<T extends any[] = Row[]>(query: string, parameters?: unknown[], queryOptions?: unknown): Promise<QueryResult<T>>;
  begin<T>(fn: (transaction: RepoSql) => Promise<T>): Promise<T>;
  end(options?: { timeout?: number }): Promise<void>;
  readonly driver: DatabaseDriver;
  reserve?(): Promise<RepoSql>;
}

let _sql: RepoSql | null = null;
let _replicaSql: RepoSql | null = null;
let _driver: DatabaseDriver = 'postgres';
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

function mysqlError(driver: DatabaseDriver, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`[${driver}] ${message}`, { cause: error });
}

function replacePostgresParameters(query: string, parameters: unknown[]): { query: string; values: unknown[] } {
  const values: unknown[] = [];
  const converted = query.replace(/\$(\d+)/g, (_match, index: string) => {
    values.push(parameters[Number(index) - 1]);
    return '?';
  });
  return { query: converted, values };
}

export function translateProviderSql(source: string, driver: 'mysql' | 'mariadb'): string {
  void driver;
  let query = source
    .replace(/\b([a-z_][a-z0-9_]*)::integer\b/gi, 'CAST($1 AS SIGNED)')
    .replace(/::(?:jsonb|json|uuid|text|integer|int|boolean|bigint|timestamptz)/gi, '')
    .replace(/\bgen_random_uuid\(\)/gi, 'UUID()')
    .replace(/\bDEFAULT\s+UUID\(\)/gi, 'DEFAULT (UUID())')
    .replace(/\bJSONB\b/gi, 'JSON')
    .replace(/(\bJSON\s+(?:NOT\s+NULL\s+)?DEFAULT)\s+'([^']*)'/gi, "$1 ('$2')")
    .replace(/\bUUID\b(?!\s*\()/gi, 'CHAR(36)')
    .replace(/\bTIMESTAMP\s+WITH\s+TIME\s+ZONE\b/gi, 'TIMESTAMP')
    .replace(/\bTIMESTAMPTZ\b/gi, 'TIMESTAMP')
    .replace(/\bBYTEA\b/gi, 'LONGBLOB')
    .replace(/\bDOUBLE\s+PRECISION\b/gi, 'DOUBLE')
    .replace(/\bILIKE\b/gi, 'LIKE')
    .replace(/\s+NULLS\s+LAST\b/gi, '')
    .replace(/\bCURRENT_ROLE\b/gi, 'CURRENT_USER()')
    .replace(/\bTRUE\b/gi, '1')
    .replace(/\bFALSE\b/gi, '0');

  query = query
    .replace(/CREATE\s+EXTENSION[\s\S]*?;\s*/gi, '')
    .replace(/CREATE\s+SCHEMA\s+IF\s+NOT\s+EXISTS[^;]+;\s*/gi, '')
    .replace(/GRANT\s+USAGE\s+ON\s+SCHEMA[^;]+;\s*/gi, '')
    .replace(/SET\s+(?:LOCAL\s+)?(?:search_path|client_min_messages)[^;]*(?:;|$)\s*/gi, '')
    .replace(/ALTER\s+TABLE\s+[^;]+\s+(?:ENABLE|DISABLE|FORCE|NO FORCE)\s+ROW\s+LEVEL\s+SECURITY\s*;\s*/gi, '')
    .replace(/DROP\s+POLICY[\s\S]*?;\s*/gi, '')
    .replace(/DO\s*\$\$[\s\S]*?\$\$\s*;\s*/gi, '')
    .replace(/SELECT\s+set_config\([\s\S]*?\)\s*;?/gi, 'SELECT 1')
    .replace(/SET\s+LOCAL\s+search_path[\s\S]*?;?/gi, '')
    .replace(/CREATE\s+(UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS/gi, 'CREATE $1INDEX')
    .replace(/ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS/gi, 'ALTER TABLE $1 ADD COLUMN');

  query = query.replace(/SELECT\s+to_regclass\('public\.([^']+)'\)\s+AS\s+exists/gi,
    "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = '$1') AS `exists`");
  query = query.replace(/pg_advisory_xact_lock\(hashtext\(([^)]+)\)\)/gi, 'GET_LOCK($1, 60)');
  query = query.replace(/pg_advisory_lock\(hashtext\(([^)]+)\)\)/gi, 'GET_LOCK($1, 60)');
  query = query.replace(/pg_advisory_unlock\(hashtext\(([^)]+)\)\)/gi, 'RELEASE_LOCK($1)');
  query = query.replace(/\bON\s+CONFLICT\s*\([^)]*\)\s+DO\s+NOTHING/gi, '');
  query = query.replace(/\bON\s+CONFLICT\s*\(([^)]*)\)\s+DO\s+UPDATE\s+SET/gi, 'ON DUPLICATE KEY UPDATE');
  query = query.replace(/\bEXCLUDED\.([a-zA-Z0-9_]+)/gi, 'VALUES($1)');
  query = query.replace(/([a-zA-Z0-9_]+)->>'([^']+)'/g, "JSON_UNQUOTE(JSON_EXTRACT($1, '$.$2'))");
  query = query.replace(/([a-zA-Z0-9_]+)->'([^']+)'/g, "JSON_EXTRACT($1, '$.$2')");
  query = query.replace(/\bjsonb_build_object\(/gi, 'JSON_OBJECT(');
  query = query.replace(/\bjsonb_build_array\(/gi, 'JSON_ARRAY(');
  query = query.replace(/\bjsonb_agg\(/gi, 'JSON_ARRAYAGG(');
  query = query.replace(/\bjsonb_object_agg\(/gi, 'JSON_OBJECTAGG(');
  query = query.replace(/\bjsonb_typeof\(/gi, 'JSON_TYPE(');
  query = query.replace(/\bstrpos\(([^,]+),\s*([^\)]+)\)/gi, 'LOCATE($2, $1)');
  query = query.replace(/\bcurrent_setting\([^)]*\)/gi, 'NULL');
  query = query.replace(/\bkey\b/g, '`key`').replace(/\bschema\b/g, '`schema`');
  query = query.replace(/\s+RETURNING\s+[\s\S]*?\s*;?\s*$/i, '');
  return query;
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

async function executeMySql(
  raw: RawConnection,
  driver: 'mysql' | 'mariadb',
  source: string,
  parameters: unknown[] = []
): Promise<Row[]> {
  const { query: sourceWithoutReturning, returning } = stripReturning(source);
  const translated = translateProviderSql(sourceWithoutReturning, driver);
  if (!translated.trim()) return [];
  const noReturning = translated;
  const { query, values } = replacePostgresParameters(noReturning, parameters);
  try {
    if (returning && /^(\s*(INSERT|UPDATE|DELETE))/i.test(query)) {
      const table = /^(?:\s*)(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+`?([a-zA-Z0-9_]+)`?/i.exec(query)?.[1];
      const where = /\sWHERE\s([\s\S]*)$/i.exec(query)?.[1];
      if (table && where && /^(\s*(UPDATE|DELETE))/i.test(query)) {
        const before = normalizeDriverRows(await raw.query(`SELECT ${returning} FROM ${table} WHERE ${where}`, values));
        await raw.query(query, values);
        return withCount(before as Row[], before.length) as Row[];
      }
      const result = await raw.query(query, values);
      const insertColumns = /INSERT\s+INTO\s+[^\s(]+\s*\(([^)]+)\)/i.exec(query)?.[1]?.split(',').map((column) => column.trim().replace(/["`]/g, '')) ?? [];
      const idIndex = insertColumns.findIndex((column) => column === 'id');
      if (idIndex >= 0 && values[idIndex] !== undefined) return withCount([{ id: values[idIndex] }], 1);
      const header = (Array.isArray(result) ? result[0] : result) as { insertId?: unknown } | undefined;
      return header?.insertId === undefined ? withCount([], Number((header as { affectedRows?: number } | undefined)?.affectedRows ?? 0)) : withCount([{ id: header.insertId }], 1);
    }
    const result = await raw.query(query, values);
    const rows = normalizeDriverRows(result);
    const header = (Array.isArray(result) ? result[0] : result) as { affectedRows?: number } | undefined;
    return withCount(rows, Number(header?.affectedRows ?? rows.length));
  } catch (error) {
    throw mysqlError(driver, error);
  }
}

function mysqlConnection(config: DatabaseConfig, driver: 'mysql' | 'mariadb'): RepoSql {
  const tls = config.tls?.enabled || config.ssl
    ? { ca: config.tls?.ca, rejectUnauthorized: config.tls?.rejectUnauthorized ?? true }
    : undefined;
  const pool: any = driver === 'mysql'
    ? mysql.createPool({ host: config.host, port: config.port, database: config.database, user: config.user, password: config.password, ssl: tls, connectionLimit: config.maxConnections ?? 20, connectTimeout: 10_000, multipleStatements: true })
    : mariadb.createPool({ host: config.host, port: config.port, database: config.database, user: config.user, password: config.password, ssl: tls, connectionLimit: config.maxConnections ?? 20, connectTimeout: 10_000, multipleStatements: true });

  const wrap = (raw: RawConnection, release?: () => void): RepoSql => {
    const tag = (async <T extends any[]>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T> => {
      const source = strings.reduce((query, part, index) => `${query}${part}${index < values.length ? `$${index + 1}` : ''}`, '');
      return executeMySql(raw, driver, source, values) as Promise<T>;
    }) as RepoSql;
    tag.unsafe = async <T extends any[]>(query: string, parameters: unknown[] = []): Promise<QueryResult<T>> => executeMySql(raw, driver, query, parameters) as Promise<QueryResult<T>>;
    tag.begin = async <T>(fn: (transaction: RepoSql) => Promise<T>): Promise<T> => {
      if (!raw.beginTransaction) {
        const reserved = await pool.getConnection();
        const transaction = wrap(reserved, () => reserved.release());
        try {
          return await transaction.begin(fn);
        } finally {
          reserved.release();
        }
      }
      await raw.beginTransaction?.();
      const tx = wrap(raw);
      try {
        const result = await fn(tx);
        await raw.commit?.();
        return result;
      } catch (error) {
        await raw.rollback?.().catch(() => undefined);
        throw error;
      }
    };
    tag.reserve = async () => {
      const reserved = await pool.getConnection();
      return wrap(reserved, () => reserved.release());
    };
    tag.end = async () => { if (release) release(); else await pool.end(); };
    Object.defineProperty(tag, 'driver', { value: driver, enumerable: true });
    return tag;
  };
  return wrap({ query: (query, values) => pool.query(query, values) });
}

export function createConnection(config: DatabaseConfig): RepoSql {
  const key = configKey(config);
  if (_sql && _connectionKey === key) return _sql;
  if (_sql && _connectionKey !== key) throw new Error('A different database configuration is already active; close the current connection first.');
  _driver = config.driver;
  _connectionKey = key;
  _sql = config.driver === 'postgres' ? postgresConnection(config) : mysqlConnection(config, config.driver);
  if (config.replica?.enabled) {
    const replicaConfig = { ...config, host: config.replica.host, port: config.replica.port, replica: undefined };
    _replicaSql = config.driver === 'postgres' ? postgresConnection(replicaConfig) : mysqlConnection(replicaConfig, config.driver);
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

export async function runWithTenantTransaction<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return getConnection().begin(async (transaction) => {
    await transaction.unsafe("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
    return requestConnection.run(transaction, fn);
  });
}

export function isTenantTransactionActive(): boolean {
  return Boolean(requestConnection.getStore());
}

export function getDriver(): DatabaseDriver { return _driver; }

export function getDatabaseCapabilities(driver: DatabaseDriver = _driver): DatabaseCapabilities {
  return driver === 'postgres'
    ? { provider: driver, transactionalDdl: true, rowLevelSecurity: true, advisoryLocks: true, jsonType: 'jsonb', namespaceStrategy: 'schema' }
    : { provider: driver, transactionalDdl: false, rowLevelSecurity: false, advisoryLocks: true, jsonType: 'json', namespaceStrategy: 'database' };
}

export async function assertSupportedServerVersion(): Promise<void> {
  const rows = await getConnection().unsafe<{ version?: string }[]>('SELECT VERSION() AS version');
  const version = String(rows[0]?.version ?? '').match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!version) return;
  const major = Number(version[1]);
  const minor = Number(version[2]);
  const patch = Number(version[3] ?? 0);
  const supported = _driver === 'postgres'
    ? major >= 16
    : _driver === 'mysql'
      ? major > 8 || (major === 8 && (minor > 0 || patch >= 36))
      : major > 11 || (major === 11 && minor >= 4);
  if (!supported) {
    const minimum = _driver === 'postgres' ? '16' : _driver === 'mysql' ? '8.0.36' : '11.4';
    throw new Error(`Unsupported ${_driver} server version ${version[0]}; OkCMS requires ${minimum} or newer.`);
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
