// @oktis-works/cms - doctor, scaffolds de extensão e build

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runDoctorChecks, parseDatabaseUrl, checkTcp, type CheckResult } from './doctor.js';
import { scaffoldPlugin, scaffoldTheme } from './extension-scaffold.js';
import { runProjectBuild, isWorkspaceProject } from './build.js';
import { CMS_VERSION } from '@oktis-works/validation';
import type { RunResult, Runner } from './docker.js';

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
    expect(parseDatabaseUrl('mysql://h/db')).toEqual({ host: 'h', port: 3306, database: 'db' });
    expect(parseDatabaseUrl('não-é-url')).toBeNull();
    expect(parseDatabaseUrl('http://h/cms')).toBeNull();
  });
});

describe('checkTcp', () => {
  it('retorna false para porta fechada rapidamente', async () => {
    const ok = await checkTcp('127.0.0.1', 1, 200);
    expect(ok).toBe(false);
  }, 5_000);
});

describe('runDoctorChecks', () => {
  /**
   * Runner de Docker fake — nenhum teste do doctor depende do daemon real
   * (o ambiente de CI não tem um, e o developer local não deveria pagar o
   * custo de um `docker version` por teste).
   */
  function dockerRunner(
    opts: { dockerOk?: boolean; composeOk?: boolean; ps?: string; proxy?: boolean } = {}
  ): Runner {
    const { dockerOk = true, composeOk = true, ps = '', proxy = false } = opts;
    return ((command: string, args: string[]) => {
      const line = [command, ...args].join(' ');
      const out = (stdout: string, ok = true): RunResult => ({
        ok,
        code: ok ? 0 : 1,
        stdout,
        stderr: ok ? '' : 'erro fake',
        command: line,
      });
      if (args[0] === 'version') return out(dockerOk ? '29.8.2\n' : '', dockerOk);
      if (args[0] === 'compose') return out(composeOk ? '5.6.0\n' : '', composeOk);
      if (args[0] === 'ps') return out(ps);
      if (args[0] === 'inspect') return out(proxy ? 'running|healthy\n' : 'exited|none\n');
      return out('');
    }) as Runner;
  }

  const noDocker = (): Runner => dockerRunner({ dockerOk: false, composeOk: false });

  it('falha sem .env e config; node antigo bloqueia', async () => {
    const results = await runDoctorChecks({
      tcpProbe: async () => false,
      runner: noDocker(),
      env: { nodeVersion: 'v18.0.0', cwd: dir },
    });

    const byName = Object.fromEntries(results.map((r) => [r.name, r])) as Record<string, CheckResult>;
    expect(byName['node']!.ok).toBe(false);
    expect(byName['.env']!.ok).toBe(false);
    expect(byName['database']!.ok).toBe(false);
    expect(results.some((r) => !r.ok && r.required)).toBe(true);
  });

  it('ambiente completo passa (com postgres inacessível marcado como opcional)', async () => {
    process.env['DATABASE_URL'] = 'postgres://u:p@nowhere.invalid:5432/cms';
    const { writeFileSync } = await import('node:fs');
    writeFileSync(join(dir, '.env'), 'DATABASE_URL=postgres://u:p@nowhere.invalid:5432/cms\n');
    writeFileSync(join(dir, 'okcms.config.json'), '{}');

    const results = await runDoctorChecks({
      tcpProbe: async () => false,
      runner: dockerRunner(),
      env: { nodeVersion: 'v22.1.0', cwd: dir },
    });

    const byName = Object.fromEntries(results.map((r) => [r.name, r])) as Record<string, CheckResult>;
    expect(byName['node']!.ok).toBe(true);
    expect(byName['database']!.ok).toBe(true);
    expect(byName['database']!.detail).toContain('DATABASE_URL');
    expect(byName['db-tcp']!.ok).toBe(false);
    expect(byName['db-tcp']!.required).toBe(false);
    expect(results.every((r) => !(r.required && !r.ok))).toBe(true);
  });

  it('aceita DB_* (variáveis separadas) como formato alternativo', async () => {
    writeFileSync(
      join(dir, '.env'),
      'DB_HOST=db.local\nDB_PORT=5433\nDB_NAME=cms\nDB_USER=u\nDB_PASSWORD=p\n'
    );
    writeFileSync(join(dir, 'okcms.config.json'), '{}');

    const results = await runDoctorChecks({
      tcpProbe: async () => true,
      runner: dockerRunner(),
      env: { nodeVersion: 'v22.1.0', cwd: dir },
    });

    const byName = Object.fromEntries(results.map((r) => [r.name, r])) as Record<string, CheckResult>;
    expect(byName['database']!.ok).toBe(true);
    expect(byName['database']!.detail).toContain('DB_*');
    expect(byName['database']!.detail).toContain('db.local:5433/cms');
    expect(byName['db-tcp']!.ok).toBe(true);
    expect(results.every((r) => !(r.required && !r.ok))).toBe(true);
  });

  it('DATABASE_URL inválida falha a check de database', async () => {
    writeFileSync(join(dir, '.env'), 'DATABASE_URL=não-é-url\n');
    writeFileSync(join(dir, 'okcms.config.json'), '{}');

    const results = await runDoctorChecks({
      tcpProbe: async () => false,
      runner: noDocker(),
      env: { nodeVersion: 'v22.1.0', cwd: dir },
    });

    const byName = Object.fromEntries(results.map((r) => [r.name, r])) as Record<string, CheckResult>;
    expect(byName['database']!.ok).toBe(false);
    expect(byName['database']!.detail).toContain('Invalid DATABASE_URL');
    expect(results.some((r) => r.required && !r.ok)).toBe(true);
  });

  // --- deploy blue/green ---------------------------------------------------

  const seedEnvAndConfig = (): void => {
    writeFileSync(join(dir, '.env'), 'DB_HOST=localhost\n');
    writeFileSync(join(dir, 'okcms.config.json'), '{}');
  };

  it('docker ausente vira dica opcional, nunca reprova o ambiente', async () => {
    seedEnvAndConfig();
    const results = await runDoctorChecks({
      tcpProbe: async () => false,
      runner: noDocker(),
      env: { nodeVersion: 'v22.1.0', cwd: dir },
    });

    const byName = Object.fromEntries(results.map((r) => [r.name, r])) as Record<string, CheckResult>;
    expect(byName['docker']!.ok).toBe(false);
    expect(byName['docker']!.required).toBe(false);
    expect(byName['compose']!.ok).toBe(false);
    expect(byName['lane']!.detail).toContain('docker unavailable');
    // required:false — `okcms start` local continua funcionando
    expect(results.every((r) => !(r.required && !r.ok))).toBe(true);
  });

  it('docker sem compose v2 é reportado separadamente', async () => {
    seedEnvAndConfig();
    const results = await runDoctorChecks({
      tcpProbe: async () => false,
      runner: dockerRunner({ composeOk: false }),
      env: { nodeVersion: 'v22.1.0', cwd: dir },
    });

    const byName = Object.fromEntries(results.map((r) => [r.name, r])) as Record<string, CheckResult>;
    expect(byName['docker']!.ok).toBe(true);
    expect(byName['compose']!.ok).toBe(false);
    expect(byName['compose']!.detail).toContain('plugin v2');
  });

  it('sem deploy feito: lane vazia e proxy "ainda não implantado" contam como ok', async () => {
    seedEnvAndConfig();
    const results = await runDoctorChecks({
      tcpProbe: async () => false,
      runner: dockerRunner({ proxy: false }),
      env: { nodeVersion: 'v22.1.0', cwd: dir },
    });

    const byName = Object.fromEntries(results.map((r) => [r.name, r])) as Record<string, CheckResult>;
    expect(byName['lane']!.detail).toContain('no lane');
    expect(byName['proxy']!.ok).toBe(true);
    expect(byName['proxy']!.detail).toContain('not deployed');
  });

  it('lane ativa com proxy morto é problema de verdade (mesmo opcional)', async () => {
    seedEnvAndConfig();
    mkdirSync(join(dir, '.deploy'), { recursive: true });
    writeFileSync(
      join(dir, '.deploy/state.json'),
      JSON.stringify({ lane: 'green', previousLane: 'blue', version: '0.3.0', at: 'x', history: [] })
    );

    const results = await runDoctorChecks({
      tcpProbe: async () => false,
      runner: dockerRunner({ proxy: false }),
      env: { nodeVersion: 'v22.1.0', cwd: dir },
    });

    const byName = Object.fromEntries(results.map((r) => [r.name, r])) as Record<string, CheckResult>;
    expect(byName['lane']!.detail).toContain('lane green active');
    expect(byName['lane']!.detail).toContain('rollback: blue');
    expect(byName['proxy']!.ok).toBe(false);
    expect(byName['proxy']!.detail).toContain('okcms-proxy stopped');
    expect(byName['proxy']!.required).toBe(false);
  });

  it('lane ativa + proxy no ar → tudo verde', async () => {
    seedEnvAndConfig();
    mkdirSync(join(dir, '.deploy'), { recursive: true });
    writeFileSync(
      join(dir, '.deploy/state.json'),
      JSON.stringify({ lane: 'blue', previousLane: null, version: '0.3.0', at: 'x', history: [] })
    );

    const results = await runDoctorChecks({
      tcpProbe: async () => true,
      runner: dockerRunner({ proxy: true }),
      env: { nodeVersion: 'v22.1.0', cwd: dir },
    });

    const byName = Object.fromEntries(results.map((r) => [r.name, r])) as Record<string, CheckResult>;
    expect(byName['proxy']!.ok).toBe(true);
    expect(byName['proxy']!.detail).toContain('okcms-proxy running');
    expect(results.every((r) => r.ok)).toBe(true);
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
    expect(() => scaffoldPlugin('meu-plugin', join(dir, 'plugins'))).toThrow('already exists');
  });

  it('theme: theme.json + templates essenciais', () => {
    const result = scaffoldTheme('meu-tema', join(dir, 'themes'));

    expect(existsSync(join(result.dir, 'theme.json'))).toBe(true);
    expect(existsSync(join(result.dir, 'templates', 'index.html'))).toBe(true);
    expect(existsSync(join(result.dir, 'templates', 'single.html'))).toBe(true);
  });

  it('nome inválido ou traversal é rejeitado', () => {
    expect(() => scaffoldPlugin('../escape')).toThrow('Invalid name');
    expect(() => scaffoldTheme('nome com espaço')).toThrow('Invalid name');
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
