// @oktis-works/cms - Provider-aware database dump and restore

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { parseDatabaseUrl, resolveDatabaseConfig } from './database-config.js';

export const maskConnectionString = (url: string): string =>
  url.replace(/:\/\/([^:/@]+):([^@]+)@/, '://$1:***@');

export interface BackupOptions {
  databaseUrl?: string;
  out?: string;
  pgDumpPath?: string;
  mysqlDumpPath?: string;
  mariadbDumpPath?: string;
}

export interface RestoreOptions {
  file: string;
  databaseUrl?: string;
  clean?: boolean;
  expectedDatabase?: string;
  maxAgeMs?: number;
  pgRestorePath?: string;
  mysqlPath?: string;
  mariadbPath?: string;
}

export function resolveTimestampedName(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `okcms-backup-${stamp}.dump`;
}

export function backupDatabase(options: BackupOptions = {}): { ok: boolean; message: string; file?: string } {
  const resolved = options.databaseUrl ? { url: options.databaseUrl } : resolveDatabaseConfig();
  const databaseUrl = resolved.url;
  if (!databaseUrl) {
    return { ok: false, message: ('error' in resolved ? resolved.error : undefined) ?? 'Database URL is not configured; set DATABASE_URL or DB_HOST/DB_NAME/DB_USER.' };
  }

  const file = options.out ?? resolveTimestampedName();
  const parsed = parseDatabaseUrl(databaseUrl);
  if (!parsed) return { ok: false, message: 'Invalid database URL; use postgres://, mysql://, or mariadb://.' };
  if (parsed.engine !== 'postgres') {
    const tool = parsed.engine === 'mysql' ? options.mysqlDumpPath ?? 'mysqldump' : options.mariadbDumpPath ?? 'mariadb-dump';
    const args = ['--single-transaction', '--routines', '--triggers', '-h', parsed.host, '-P', String(parsed.port), '-u', parsed.user ?? '', parsed.database, '--result-file', file];
    const result = spawnSync(tool, args, {
      env: { ...process.env, ...(parsed.password ? { MYSQL_PWD: parsed.password } : {}) },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    if (result.error) return { ok: false, message: `${tool} failed to start: ${result.error.message}` };
    if (result.status !== 0) return { ok: false, message: `${tool} exited with ${result.status}: ${result.stderr?.toString().trim()}` };
    return { ok: true, message: `Backup written to ${file}`, file };
  }
  const result = spawnSync(
    options.pgDumpPath ?? 'pg_dump',
    ['-Fc', '--no-owner', '-d', databaseUrl, '-f', file],
    { stdio: ['ignore', 'ignore', 'pipe'] }
  );

  if (result.error) {
    return { ok: false, message: `pg_dump failed to start: ${result.error.message}` };
  }
  if (result.status !== 0) {
    return { ok: false, message: `pg_dump exited with ${result.status}: ${result.stderr?.toString().trim()}` };
  }

  return { ok: true, message: `Backup written to ${file}`, file };
}

export function restoreDatabase(options: RestoreOptions): { ok: boolean; message: string } {
  const resolved = options.databaseUrl ? { url: options.databaseUrl } : resolveDatabaseConfig();
  const databaseUrl = resolved.url;
  if (!databaseUrl) {
    return { ok: false, message: ('error' in resolved ? resolved.error : undefined) ?? 'Database URL is not configured; set DATABASE_URL or DB_HOST/DB_NAME/DB_USER.' };
  }
  if (!existsSync(options.file)) {
    return { ok: false, message: `File not found: ${options.file}` };
  }
  if (options.maxAgeMs !== undefined) {
    const age = Date.now() - statSync(options.file).mtimeMs;
    if (age > options.maxAgeMs) {
      return { ok: false, message: `Backup is too old: ${options.file}` };
    }
  }
  if (options.expectedDatabase) {
    const parsed = parseDatabaseUrl(databaseUrl);
    if (!parsed || parsed.database !== options.expectedDatabase) {
      return { ok: false, message: `Restore target mismatch: expected database "${options.expectedDatabase}".` };
    }
  }

  const parsed = parseDatabaseUrl(databaseUrl);
  if (!parsed) return { ok: false, message: 'Invalid database URL; use postgres://, mysql://, or mariadb://.' };
  if (parsed.engine !== 'postgres') {
    const tool = parsed.engine === 'mysql' ? options.mysqlPath ?? 'mysql' : options.mariadbPath ?? 'mariadb';
    const args = ['-h', parsed.host, '-P', String(parsed.port), '-u', parsed.user ?? '', parsed.database];
    if (options.clean) args.push('--force');
    const dump = readFileSync(options.file);
    const result = spawnSync(tool, args, {
      env: { ...process.env, ...(parsed.password ? { MYSQL_PWD: parsed.password } : {}) },
      input: dump,
      stdio: ['pipe', 'ignore', 'pipe'],
    });
    if (result.error) return { ok: false, message: `${tool} failed to start: ${result.error.message}` };
    if (result.status !== 0) return { ok: false, message: `${tool} exited with ${result.status}: ${result.stderr?.toString().trim()}` };
    return { ok: true, message: `Restored from ${options.file}` };
  }

  const args = ['-Fc', '--no-owner', '-d', databaseUrl];
  if (options.clean) args.push('--clean');
  args.push(options.file);

  const result = spawnSync(options.pgRestorePath ?? 'pg_restore', args, {
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  if (result.error) {
    return { ok: false, message: `pg_restore failed to start: ${result.error.message}` };
  }
  if (result.status !== 0) {
    return { ok: false, message: `pg_restore exited with ${result.status}: ${result.stderr?.toString().trim()}` };
  }

  return { ok: true, message: `Restored from ${options.file}` };
}
