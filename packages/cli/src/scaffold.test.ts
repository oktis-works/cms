// @oktis-works/cms - Project Scaffolding Tests (init cria dir nomeado com tudo dentro)

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { scaffoldProject } from './scaffold.js';
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
});
