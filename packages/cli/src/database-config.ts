// @oktis-works/cms - Shared CLI database configuration resolution

import { join } from 'node:path';
import { loadEnvFile } from './env-file.js';

export interface ParsedDatabaseUrl {
  engine: 'postgres';
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

type DatabaseEngine = 'postgres';

export function parseDatabaseUrl(url: string): ParsedDatabaseUrl | null {
  try {
    const parsed = new URL(url);
    const protocol = parsed.protocol.replace(/:$/, '');
    if (protocol !== 'postgres' && protocol !== 'postgresql') return null;
    const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
    if (!parsed.hostname || !database) return null;
    return {
      engine: 'postgres',
      host: parsed.hostname,
      port: Number(parsed.port || 5432),
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
  if (engine !== 'postgres') {
    return { engine, configured: false, error: `Unsupported database engine "${engine}". Use postgres.` };
  }
  if (explicitEngine && explicitDriver && explicitEngine !== explicitDriver) {
    return { engine, configured: true, error: 'DB_ENGINE and DB_DRIVER must match.' };
  }
  const explicitUrl = env['DATABASE_URL']?.trim();
  const hasVariables = Boolean(env['DB_HOST'] || env['DB_NAME'] || env['DB_USER'] || env['DB_PORT']);
  if (explicitUrl) {
    const parsed = parseDatabaseUrl(explicitUrl);
    if (!parsed) return { engine, configured: true, error: 'Invalid DATABASE_URL (expected postgres://user:pass@host:5432/db).' };
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
      parsed: { engine, host: host ?? 'localhost', port: Number(env['DB_PORT'] ?? 5432), database: database ?? 'okcms' },
    };
  }
  const port = Number(env['DB_PORT'] ?? 5432);
  const password = env['DB_PASSWORD'] ?? '';
  const url = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}`;
  return { engine, configured: true, source: 'variables', url, parsed: { engine, host, port, database } };
}
