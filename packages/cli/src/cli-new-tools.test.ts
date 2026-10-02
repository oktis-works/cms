// @oktis-works/cms - doctor, scaffolds de extensão e build

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runDoctorChecks, parseDatabaseUrl, checkTcp, type CheckResult } from './doctor.js';
import { scaffoldPlugin, scaffoldTheme } from './extension-scaffold.js';
import { runProjectBuild, isWorkspaceProject } from './build.js';
import { CMS_VERSION } from '@oktis-works/validation';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'bl-cli-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env['DATABASE_URL'];
});

describe('parseDatabaseUrl', () => {
  it('extrai host/port/database de URLs postgres', () => {
    expect(parseDatabaseUrl('postgres://user:pw@db.local:5433/cms')).toEqual({
      host: 'db.local',
      port: 5433,
      database: 'cms',
    });
    expect(parseDatabaseUrl('postgresql://h/cms')).toEqual({ host: 'h', port: 5432, database: 'cms' });
    expect(parseDatabaseUrl('mysql://h/db')).toBeNull();
    expect(parseDatabaseUrl('não-é-url')).toBeNull();
  });
});

describe('checkTcp', () => {
  it('retorna false para porta fechada rapidamente', async () => {
    const ok = await checkTcp('127.0.0.1', 1, 200);
    expect(ok).toBe(false);
  }, 5_000);
});

describe('runDoctorChecks', () => {
  it('falha sem .env e config; node antigo bloqueia', async () => {
    const results = await runDoctorChecks({
      tcpProbe: async () => false,
      env: { nodeVersion: 'v18.0.0', cwd: dir },
    });

    const byName = Object.fromEntries(results.map((r) => [r.name, r])) as Record<string, CheckResult>;
    expect(byName['node']!.ok).toBe(false);
    expect(byName['.env']!.ok).toBe(false);
    expect(byName['DATABASE_URL']!.ok).toBe(false);
    expect(results.some((r) => !r.ok && r.required)).toBe(true);
  });

  it('ambiente completo passa (com postgres inacessível marcado como opcional)', async () => {
    process.env['DATABASE_URL'] = 'postgres://u:p@nowhere.invalid:5432/cms';
    const { writeFileSync } = await import('node:fs');
    writeFileSync(join(dir, '.env'), 'DATABASE_URL=postgres://u:p@nowhere.invalid:5432/cms\n');
    writeFileSync(join(dir, 'okcms.config.json'), '{}');

    const results = await runDoctorChecks({
      tcpProbe: async () => false,
      env: { nodeVersion: 'v22.1.0', cwd: dir },
    });

    const byName = Object.fromEntries(results.map((r) => [r.name, r])) as Record<string, CheckResult>;
    expect(byName['node']!.ok).toBe(true);
    expect(byName['postgres-tcp']!.ok).toBe(false);
    expect(byName['postgres-tcp']!.required).toBe(false);
    expect(results.every((r) => !(r.required && !r.ok))).toBe(true);
  });
});

describe('scaffoldPlugin / scaffoldTheme', () => {
  it('plugin: manifest compatível + entry + README', () => {
    const result = scaffoldPlugin('meu-plugin', join(dir, 'plugins'));

    expect(existsSync(join(result.dir, 'manifest.json'))).toBe(true);
    expect(existsSync(join(result.dir, 'index.js'))).toBe(true);
    const manifest = JSON.parse(readFileSync(join(result.dir, 'manifest.json'), 'utf-8')) as Record<string, unknown>;
    expect(manifest['name']).toBe('meu-plugin');
    expect((manifest['compatibility'] as Record<string, string>)['okcms']).toBe(`^${CMS_VERSION}`);

    const entry = readFileSync(join(result.dir, 'index.js'), 'utf-8');
    expect(entry).toContain('register');

    // self-check: recriar no mesmo diretório falha
    expect(() => scaffoldPlugin('meu-plugin', join(dir, 'plugins'))).toThrow('já existe');
  });

  it('theme: theme.json + templates essenciais', () => {
    const result = scaffoldTheme('meu-tema', join(dir, 'themes'));

    expect(existsSync(join(result.dir, 'theme.json'))).toBe(true);
    expect(existsSync(join(result.dir, 'templates', 'index.html'))).toBe(true);
    expect(existsSync(join(result.dir, 'templates', 'single.html'))).toBe(true);
  });

  it('nome inválido ou traversal é rejeitado', () => {
    expect(() => scaffoldPlugin('../escape')).toThrow('Nome inválido');
    expect(() => scaffoldTheme('nome com espaço')).toThrow('Nome inválido');
  });
});

describe('runProjectBuild', () => {
  it('executa bun filter por app e para no primeiro erro', () => {
    const spawn = vi.fn(
      (cmd: string, args: string[]) =>
        ({
          status: args.includes('@oktis-works/web') ? 1 : 0,
          stdout: `built ${args[1] ?? ''}`,
          stderr: '',
        }) as never
    );

    const { results, ok } = runProjectBuild({ apps: ['api', 'web'], spawn: spawn as never });

    expect(spawn).toHaveBeenCalledTimes(2);
    expect(results[0]!.ok).toBe(true);
    expect(results[1]!.ok).toBe(false);
    expect(ok).toBe(false);
  });

  it('todos os apps OK quando status 0', () => {
    const spawn = vi.fn(() => ({ status: 0, stdout: '', stderr: '' }) as never);
    const { ok, results } = runProjectBuild({ spawn: spawn as never });
    expect(results).toHaveLength(3);
    expect(ok).toBe(true);
  });
});

describe('isWorkspaceProject', () => {
  it('false sem package.json e sem workspaces', () => {
    expect(isWorkspaceProject(join(dir, 'nao-existe'))).toBe(false);

    mkdirSync(join(dir, 'simples'));
    writeFileSync(join(dir, 'simples', 'package.json'), '{"name":"x"}');
    expect(isWorkspaceProject(join(dir, 'simples'))).toBe(false);
  });

  it('true quando o package.json declara workspaces (monorepo)', () => {
    mkdirSync(join(dir, 'mono'));
    writeFileSync(
      join(dir, 'mono', 'package.json'),
      '{"name":"mono","workspaces":["packages/*","apps/*"]}'
    );
    expect(isWorkspaceProject(join(dir, 'mono'))).toBe(true);
  });
});
