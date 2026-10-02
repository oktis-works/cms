// @oktis-works/cms - Project Scaffolding Tests (init cria dir nomeado com tudo dentro)

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { scaffoldProject, installProjectDeps, toPackageName } from './scaffold.js';
import { DEFAULT_CONFIG_FILENAME } from './project-config.js';

let workDir: string;
let originalCwd: string;

beforeEach(() => {
  originalCwd = process.cwd();
  workDir = mkdtempSync(join(tmpdir(), 'okcms-scaffold-'));
  process.chdir(workDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(workDir, { recursive: true, force: true });
});

describe('scaffoldProject', () => {
  it('cria o diretório nomeado e coloca todo o conteúdo dentro dele', async () => {
    await scaffoldProject('cms-teste', 'cms-teste');

    const root = resolve(workDir, 'cms-teste');
    expect(existsSync(root)).toBe(true);

    for (const entry of [
      '.env',
      '.env.example',
      DEFAULT_CONFIG_FILENAME,
      'docker-compose.yml',
      'package.json',
      'themes',
      'plugins',
      'migrations',
    ]) {
      expect(existsSync(join(root, entry))).toBe(true);
    }

    // nada vazado no diretório pai
    const parentEntries = [
      '.env',
      '.env.example',
      DEFAULT_CONFIG_FILENAME,
      'docker-compose.yml',
      'package.json',
      'themes',
      'plugins',
      'migrations',
    ];
    for (const entry of parentEntries) {
      expect(existsSync(join(workDir, entry))).toBe(false);
    }

    const config = JSON.parse(readFileSync(join(root, DEFAULT_CONFIG_FILENAME), 'utf-8')) as {
      name: string;
    };
    expect(config.name).toBe('cms-teste');
    // conexão do banco NÃO mora no JSON — fonte única é o .env
    expect(config).not.toHaveProperty('database');

    // .env documenta os DOIS formatos de conexão (DB_* ativo, DATABASE_URL comentado)
    const env = readFileSync(join(root, '.env'), 'utf-8');
    expect(env).toMatch(/^DB_HOST=/m);
    expect(env).toContain('# DATABASE_URL=postgresql://');
  });

  it('docker-compose sobe postgres + redis com healthcheck e volume', async () => {
    await scaffoldProject('compose-test', 'compose-test');

    const compose = readFileSync(join(workDir, 'compose-test', 'docker-compose.yml'), 'utf-8');
    expect(compose).toContain('image: postgres:16-alpine');
    expect(compose).toContain('image: redis:7-alpine');
    expect(compose).toContain('redis-cli');
    expect(compose).toContain('redisdata');
    expect(compose).toContain('\${REDIS_PORT:-6379}:6379');
  });

  it('.env.example expõe as variáveis de Redis usadas pelo config', async () => {
    await scaffoldProject('env-test', 'env-test');

    const env = readFileSync(join(workDir, 'env-test', '.env.example'), 'utf-8');
    for (const key of ['REDIS_HOST=', 'REDIS_PORT=', 'REDIS_PASSWORD=', 'REDIS_DB=']) {
      expect(env).toContain(key);
    }
    // e o .env já existe pré-configurado
    expect(readFileSync(join(workDir, 'env-test', '.env'), 'utf-8')).toContain('REDIS_HOST=');
  });

  it('package.json sai do scaffold com os 3 apps na versão do CLI (zero config)', async () => {
    await scaffoldProject('pkg-test', 'pkg-test');

    const pkg = JSON.parse(
      readFileSync(join(workDir, 'pkg-test', 'package.json'), 'utf-8')
    ) as { name: string; version: string; private: boolean; dependencies: Record<string, string> };

    const cliPkg = (await import('../package.json', { with: { type: 'json' } })).default as {
      version: string;
    };
    expect(pkg.name).toBe('pkg-test');
    expect(pkg.version).toBe('0.1.0');
    expect(pkg.private).toBe(true);
    expect(pkg.dependencies['@oktis-works/api']).toBe(`^${cliPkg.version}`);
    expect(pkg.dependencies['@oktis-works/admin']).toBe(`^${cliPkg.version}`);
    expect(pkg.dependencies['@oktis-works/web']).toBe(`^${cliPkg.version}`);
  });

  it('não sobrescreve um package.json já existente no diretório', async () => {
    mkdirSync(join(workDir, 'keep'));
    writeFileSync(join(workDir, 'keep', 'package.json'), '{"name":"custom-ja-existente"}');

    await scaffoldProject('keep', 'keep');

    const pkg = JSON.parse(readFileSync(join(workDir, 'keep', 'package.json'), 'utf-8')) as {
      name: string;
    };
    expect(pkg.name).toBe('custom-ja-existente');
  });

  it('toPackageName slugifica nomes para npm name válido', () => {
    expect(toPackageName('Meu CMS Teste!')).toBe('meu-cms-teste');
    expect(toPackageName('ok')).toBe('ok');
    expect(toPackageName('***')).toBe('okcms-project');
  });

  it('installProjectDeps roda bun install com cwd no projeto', () => {
    const calls: Array<{ cmd: string; args: string[]; cwd?: string }> = [];
    const spawn = ((cmd: string, args: string[], opts?: { cwd?: string }) => {
      calls.push({ cmd, args, cwd: opts?.cwd });
      return { status: 0, stdout: 'ok', stderr: '' } as never;
    }) as never;

    const root = join(workDir, 'proj');
    const result = installProjectDeps(root, { spawn });

    expect(result.ok).toBe(true);
    expect(result.tool).toBe('bun');
    expect(calls).toEqual([{ cmd: 'bun', args: ['install'], cwd: root }]);
  });

  it('installProjectDeps faz fallback para npm quando o bun não existe', () => {
    const calls: string[] = [];
    const spawn = ((cmd: string, args: string[]) => {
      calls.push([cmd, ...args].join(' '));
      if (cmd === 'bun') {
        return { error: new Error('ENOENT'), status: null, stdout: '', stderr: '' } as never;
      }
      return { status: 0, stdout: 'npm ok', stderr: '' } as never;
    }) as never;

    const result = installProjectDeps(workDir, { spawn });

    expect(result.ok).toBe(true);
    expect(result.tool).toBe('npm');
    expect(calls).toEqual(['bun install', 'npm install']);
  });

  it('installProjectDeps reporta falha sem lançar exceção', () => {
    const spawn = (() => ({ status: 1, stdout: '', stderr: 'registry fora do ar' })) as never;
    const result = installProjectDeps(workDir, { spawn });
    expect(result.ok).toBe(false);
    expect(result.output).toContain('registry fora do ar');
  });
});
