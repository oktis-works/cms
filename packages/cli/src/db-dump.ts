// @oktis-works/cms - Database dump/restore via pg_dump/pg_restore

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

export const maskConnectionString = (url: string): string =>
  url.replace(/:\/\/([^:/@]+):([^@]+)@/, '://$1:***@');

export interface BackupOptions {
  databaseUrl?: string;
  out?: string;
  pgDumpPath?: string;
}

export interface RestoreOptions {
  file: string;
  databaseUrl?: string;
  clean?: boolean;
  pgRestorePath?: string;
}

export function resolveTimestampedName(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `okcms-backup-${stamp}.dump`;
}

export function backupDatabase(options: BackupOptions = {}): { ok: boolean; message: string; file?: string } {
  const databaseUrl = options.databaseUrl ?? process.env['DATABASE_URL'];
  if (!databaseUrl) {
    return { ok: false, message: 'DATABASE_URL is not set' };
  }

  const file = options.out ?? resolveTimestampedName();
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
  const databaseUrl = options.databaseUrl ?? process.env['DATABASE_URL'];
  if (!databaseUrl) {
    return { ok: false, message: 'DATABASE_URL is not set' };
  }
  if (!existsSync(options.file)) {
    return { ok: false, message: `File not found: ${options.file}` };
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
