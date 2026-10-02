// @oktis-works/cms - db:backup / db:restore

import { describe, it, expect, vi, beforeEach } from 'vitest';

const spawn = { calls: [] as { cmd: string; args: string[] }[], result: { status: 0 } as { status: number; error?: Error; stderr?: Buffer } };

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn((cmd: string, args: string[]) => {
    spawn.calls.push({ cmd, args });
    return spawn.result;
  }),
}));

vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs')>()),
  existsSync: vi.fn((p: string) => p === '/exists.dump'),
}));

import { backupDatabase, restoreDatabase, maskConnectionString, resolveTimestampedName } from './db-dump.js';

beforeEach(() => {
  spawn.calls = [];
  spawn.result = { status: 0 };
  delete process.env['DATABASE_URL'];
});

describe('backupDatabase — CLI db:backup', () => {
  it('sem DATABASE_URL retorna erro sem invocar pg_dump', () => {
    const result = backupDatabase();
    expect(result.ok).toBe(false);
    expect(result.message).toContain('DATABASE_URL');
    expect(spawn.calls).toHaveLength(0);
  });

  it('invoca pg_dump -Fc --no-owner -d <url> -f <file>', () => {
    const result = backupDatabase({ databaseUrl: 'postgresql://u:p@h:5432/db', out: 'x.dump' });

    expect(result.ok).toBe(true);
    expect(spawn.calls[0]!.cmd).toBe('pg_dump');
    expect(spawn.calls[0]!.args).toEqual(['-Fc', '--no-owner', '-d', 'postgresql://u:p@h:5432/db', '-f', 'x.dump']);
  });

  it('propaga falha do pg_dump com stderr', () => {
    spawn.result = { status: 2, stderr: Buffer.from('boom') };
    const result = backupDatabase({ databaseUrl: 'postgresql://u:p@h/db' });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('exited with 2');
    expect(result.message).toContain('boom');
  });
});

describe('restoreDatabase — CLI db:restore', () => {
  const url = 'postgresql://u:p@h:5432/db';

  it('arquivo inexistente → erro antes de executar pg_restore', () => {
    const result = restoreDatabase({ file: '/nope.dump', databaseUrl: url });
    expect(result.ok).toBe(false);
    expect(spawn.calls).toHaveLength(0);
  });

  it('--clean adiciona --clean aos argumentos', () => {
    const result = restoreDatabase({ file: '/exists.dump', databaseUrl: url, clean: true });

    expect(result.ok).toBe(true);
    expect(spawn.calls[0]!.cmd).toBe('pg_restore');
    expect(spawn.calls[0]!.args).toEqual(['-Fc', '--no-owner', '-d', url, '--clean', '/exists.dump']);
  });
});

describe('maskConnectionString', () => {
  it('esconde senha em mensagens de erro', () => {
    expect(maskConnectionString('postgresql://admin:s3cr3t@db:5432/cms')).toBe('postgresql://admin:***@db:5432/cms');
  });
});

describe('resolveTimestampedName', () => {
  it('gera nome determinístico por segundo com sufixo .dump', () => {
    expect(resolveTimestampedName()).toMatch(/^okcms-backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.dump$/);
  });
});
