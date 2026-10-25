// @oktis-works/cms - Shared CLI database configuration resolution

import { join } from 'node:path';
import { loadEnvFile } from './env-file.js';

export interface ParsedDatabaseUrl {
  engine: 'postgres' | 'mysql' | 'mariadb';
  host: string;
  port: number;
  database: string;
  user?: string;
  password?: string;
  ssl?: boolean;
}

export interface ResolvedDatabaseConfig {
  url?: string;
  parsed?: ParsedDatabaseUrl;
  engine: string;
  configured: boolean;
  source?: 'url' | 'variables';
  error?: string;
}

type DatabaseEngine = 'postgres' | 'mysql' | 'mariadb';

export function parseDatabaseUrl(url: string): ParsedDatabaseUrl | null {
  try {
    const parsed = new URL(url);
    const protocol = parsed.protocol.replace(/:$/, '');
    const engine = protocol === 'postgres' || protocol === 'postgresql'
      ? 'postgres'
      : protocol === 'mysql'
        ? 'mysql'
        : protocol === 'mariadb'
          ? 'mariadb'
          : null;
    if (!engine) return null;
    const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
    if (!parsed.hostname || !database) return null;
    return {
      engine,
      host: parsed.hostname,
      port: Number(parsed.port || (engine === 'postgres' ? 5432 : 3306)),
      database,
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      ssl: ['true', '1', 'require', 'verify-ca', 'verify-full'].includes(parsed.searchParams.get('ssl') ?? '')
        || parsed.searchParams.get('sslmode') === 'require',
    };
  } catch {
    return null;
  }
}

/** Resolves `.env` and process variables once for all CLI database commands. */
export function resolveDatabaseConfig(
  cwd = process.cwd(),
  processEnv: NodeJS.ProcessEnv = process.env
): ResolvedDatabaseConfig {
  const fileEnv = loadEnvFile(join(cwd, '.env')).toRecord();
  const env: Record<string, string> = { ...fileEnv };
  for (const [key, value] of Object.entries(processEnv)) {
    if (value !== undefined) env[key] = value;
  }

  const explicitEngine = env['DB_ENGINE']?.toLowerCase();
  const explicitDriver = env['DB_DRIVER']?.toLowerCase();
  const engine = (explicitEngine ?? explicitDriver ?? 'postgres') as DatabaseEngine;
  if (!['postgres', 'mysql', 'mariadb'].includes(engine)) {
    return { engine, configured: false, error: `Unsupported database engine "${engine}".` };
  }
  if (explicitEngine && explicitDriver && explicitEngine !== explicitDriver) {
    return { engine, configured: true, error: 'DB_ENGINE and DB_DRIVER must match.' };
  }
  const explicitUrl = env['DATABASE_URL']?.trim();
  const hasVariables = Boolean(env['DB_HOST'] || env['DB_NAME'] || env['DB_USER'] || env['DB_PORT']);
  if (explicitUrl) {
    const parsed = parseDatabaseUrl(explicitUrl);
    if (!parsed) return { engine, configured: true, error: 'Invalid DATABASE_URL (expected postgres://, mysql://, or mariadb://).' };
    if (parsed.engine !== engine && (explicitEngine || explicitDriver)) {
      return { engine, configured: true, error: 'DATABASE_URL protocol conflicts with DB_ENGINE/DB_DRIVER.' };
    }
    return parsed
      ? { engine: parsed.engine, configured: true, source: 'url', url: explicitUrl, parsed }
      : { engine, configured: true, error: 'Invalid DATABASE_URL (expected postgres://user:pass@host:5432/db).' };
  }
  if (!hasVariables) return { engine, configured: false };

  const host = env['DB_HOST'];
  const database = env['DB_NAME'];
  const user = env['DB_USER'];
  if (!host || !database || !user) {
    return {
      engine,
      configured: true,
      error: 'Database connection is incomplete: set DB_HOST, DB_NAME, and DB_USER.',
      source: 'variables',
      parsed: { engine, host: host ?? 'localhost', port: Number(env['DB_PORT'] ?? (engine === 'postgres' ? 5432 : 3306)), database: database ?? 'okcms' },
    };
  }
  const port = Number(env['DB_PORT'] ?? (engine === 'postgres' ? 5432 : 3306));
  const password = env['DB_PASSWORD'] ?? '';
  const url = `${engine === 'postgres' ? 'postgresql' : engine}://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}`;
  return { engine, configured: true, source: 'variables', url, parsed: { engine, host, port, database } };
}
