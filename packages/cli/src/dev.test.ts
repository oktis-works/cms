// @oktis-works/cms - `okcms dev`
//
// O contrato testado aqui: um assistente único que prepara o dev do zero
// (.env → infra → banco → primeiro admin → start), é reexecutável, nunca
// sobrescreve valores do .env e exige `--yes` fora de TTY — a mesma
// filosofia do `okcms update`.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Writable } from 'node:stream';

import { EnvFile } from './env-file.js';
import { fillMissingEnv, runDev, type DevHooks, type DevUserInput } from './dev.js';
import { Prompt, type PromptIO } from './prompt.js';
import type { ContainerProbe } from './guards.js';
import type { Runner } from './docker.js';

let dir: string;

const HOST_PROBE: ContainerProbe = { env: {}, exists: () => false, cgroup: null };
const CONTAINER_PROBE: ContainerProbe = {
  env: { OKCMS_IN_CONTAINER: '1' },
  exists: () => false,
  cgroup: null,
};

function res(partial: Partial<import('./docker.js').RunResult> = {}): import('./docker.js').RunResult {
  return {
    ok: partial.ok ?? true,
    code: partial.code ?? 0,
    stdout: partial.stdout ?? '',
    stderr: partial.stderr ?? '',
    command: partial.command ?? '',
  };
}

function makeRunner(): Runner & { calls: string[] } {
  const calls: string[] = [];
  const runner = ((command: string, args: string[]) => {
    const line = [command, ...args].join(' ');
    calls.push(line);
    if (args[0] === 'version') return res({ stdout: '29.8.2\n' });
    if (args[0] === 'compose' && args[1] === 'version') return res({ stdout: '2.24.0\n' });
    return res({ command: line });
  }) as Runner & { calls: string[] };
  runner.calls = calls;
  return runner;
}

interface FakeHooks extends DevHooks {
  prepared: number;
  created: (DevUserInput & { role?: string })[];
  started: number;
  users: boolean;
}

function fakeHooks(): FakeHooks {
  const hooks = {
    prepared: 0,
    created: [] as (DevUserInput & { role?: string })[],
    started: 0,
    users: false,
  } as FakeHooks;
  hooks.prepareDatabase = async (): Promise<void> => {
    hooks.prepared += 1;
  };
  hooks.anyUserExists = async (): Promise<boolean> => hooks.users;
  hooks.createUser = async (input: DevUserInput): Promise<void> => {
    hooks.created.push(input);
  };
  hooks.startApps = async (): Promise<void> => {
    hooks.started += 1;
  };
  return hooks;
}

function buildPrompt(isTTY: boolean, lines: string[]): Prompt & { printed: () => string } {
  const input = new PassThrough();
  const chunks: string[] = [];
  const output = new Writable({
    write(chunk, _enc, cb): void {
      chunks.push(String(chunk));
      cb();
    },
  });
  if (isTTY) setImmediate(() => input.end(`${lines.join('\n')}\n`));
  const io: PromptIO = { input, output, isTTY };
  const prompt = new Prompt(io) as Prompt & { printed: () => string };
  prompt.printed = (): string => chunks.join('');
  return prompt;
}

const ttyPrompt = (lines: string[]): Prompt & { printed: () => string } => buildPrompt(true, lines);
const nonTty = (): Prompt & { printed: () => string } => buildPrompt(false, []);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'okcms-dev-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('runDev', () => {
  it('fluxo completo no TTY: .env → infra → banco → admin → start', async () => {
    writeFileSync(join(dir, 'docker-compose.infra.yml'), 'name: okcms\nservices: {}\n');
    const hooks = fakeHooks();
    const runner = makeRunner();
    // 1) completar .env  2) subir infra  3) email  4) nome  5) senha  6) start
    const prompt = ttyPrompt(['', '', 'admin@example.com', 'Admin', 'senha1234', '']);

    const code = await runDev({
      cwd: dir,
      runner,
      prompt,
      probe: HOST_PROBE,
      hooks,
    });

    expect(code).toBe(0);
    expect(hooks.prepared).toBe(1);
    expect(hooks.created).toEqual([
      { email: 'admin@example.com', name: 'Admin', password: 'senha1234', role: 'SUPER_ADMIN' },
    ]);
    expect(hooks.started).toBe(1);
    expect(runner.calls.some((call) => call.includes('docker-compose.infra.yml') && call.includes('up'))).toBe(true);
    // .env criado com os required preenchidos (segredos gerados)
    const env = readFileSync(join(dir, '.env'), 'utf-8');
    expect(env).toMatch(/DB_PASSWORD=.+/);
    expect(env).toMatch(/JWT_SECRET=.+/);
    // lembra o ponto de colisão com o deploy
    expect(prompt.printed()).toContain('`okcms stop` first');
    prompt.close();
  });

  it('usuários existem: pula a criação e segue', async () => {
    const hooks = fakeHooks();
    hooks.users = true;
    const prompt = ttyPrompt(['y']); // completar .env

    const code = await runDev({
      cwd: dir,
      runner: makeRunner(),
      prompt,
      probe: HOST_PROBE,
      noInfra: true,
      skipStart: true,
      hooks,
    });

    expect(code).toBe(0);
    expect(hooks.created).toEqual([]);
    expect(hooks.started).toBe(0);
    expect(prompt.printed()).toContain('skipped');
    prompt.close();
  });

  it('não-TTY sem --yes recusa (mesma política do update)', async () => {
    const hooks = fakeHooks();
    const prompt = nonTty();

    const code = await runDev({ cwd: dir, probe: HOST_PROBE, prompt, hooks });

    expect(code).toBe(1);
    expect(hooks.prepared).toBe(0);
    expect(prompt.printed()).toContain('interactive confirmation required');
    prompt.close();
  });

  it('não-TTY com --yes e credenciais prepara tudo em silêncio', async () => {
    const hooks = fakeHooks();
    const prompt = nonTty();

    const code = await runDev({
      cwd: dir,
      runner: makeRunner(),
      prompt,
      probe: HOST_PROBE,
      yes: true,
      noInfra: true,
      skipStart: true,
      email: 'ci@example.com',
      name: 'CI',
      password: 'senha1234',
      hooks,
    });

    expect(code).toBe(0);
    expect(hooks.prepared).toBe(1);
    expect(hooks.created).toEqual([
      { email: 'ci@example.com', name: 'CI', password: 'senha1234', role: 'SUPER_ADMIN' },
    ]);
    expect(prompt.printed()).toContain('dev environment ready');
    prompt.close();
  });

  it('não-TTY --yes sem credenciais e sem usuários falha com instrução clara', async () => {
    const hooks = fakeHooks();
    const prompt = nonTty();

    const code = await runDev({
      cwd: dir,
      runner: makeRunner(),
      prompt,
      probe: HOST_PROBE,
      yes: true,
      noInfra: true,
      skipStart: true,
      hooks,
    });

    expect(code).toBe(1);
    expect(hooks.created).toEqual([]);
    expect(prompt.printed()).toContain('--email');
    prompt.close();
  });

  it('recusa rodar dentro de container', async () => {
    const hooks = fakeHooks();
    const prompt = nonTty();

    const code = await runDev({ cwd: dir, prompt, probe: CONTAINER_PROBE, hooks });

    expect(code).toBe(1);
    expect(prompt.printed()).toContain('refused to run inside a container');
    prompt.close();
  });

  it('não sobrescreve valores existentes do .env (só completa o que falta)', async () => {
    writeFileSync(join(dir, '.env'), 'DB_PASSWORD=keepme\nPORT=4999\n');
    const hooks = fakeHooks();
    hooks.users = true;
    const prompt = ttyPrompt(['y']); // completar .env (falta JWT_SECRET)

    const code = await runDev({
      cwd: dir,
      runner: makeRunner(),
      prompt,
      probe: HOST_PROBE,
      noInfra: true,
      skipStart: true,
      hooks,
    });

    expect(code).toBe(0);
    const env = readFileSync(join(dir, '.env'), 'utf-8');
    expect(env).toContain('DB_PASSWORD=keepme');
    expect(env).toContain('PORT=4999');
    expect(env).toMatch(/JWT_SECRET=.+/);
    prompt.close();
  });

  it('sem Docker: avisa e continua (não grava workaround no .env)', async () => {
    const hooks = fakeHooks();
    hooks.users = true;
    const prompt = ttyPrompt(['y']); // completar .env

    const code = await runDev({
      cwd: dir,
      runner: (() => res({ ok: false, code: 1, stderr: 'no docker' })) as Runner,
      prompt,
      probe: HOST_PROBE,
      skipStart: true,
      hooks,
    });

    expect(code).toBe(0);
    expect(prompt.printed()).toContain('docker/compose not available');
    // nenhum workaround "de dev" é gravado: REDIS_HOST=disabled só como
    // dica impressa, nunca no arquivo
    expect(readFileSync(join(dir, '.env'), 'utf-8')).not.toContain('REDIS_HOST=disabled');
    expect(prompt.printed()).toContain('REDIS_HOST=disabled');
    prompt.close();
  });
});

describe('fillMissingEnv', () => {
  it('preenche required com segredo e o resto com default, respeitando when', () => {
    const env = new EnvFile('DATABASE_URL=postgres://x\n', null);
    const filled = fillMissingEnv(env);

    // DATABASE_URL ativo → DB_PASSWORD NÃO existe (when)
    expect(filled).not.toContain('DB_PASSWORD');
    // required sempre presente
    expect(filled).toContain('JWT_SECRET');
    expect(env.get('JWT_SECRET')!.length).toBeGreaterThanOrEqual(16);
  });

  it('não repreenche required que já existem', () => {
    const env = new EnvFile('DB_PASSWORD=x\nJWT_SECRET=y\n', null);
    const filled = fillMissingEnv(env);

    expect(filled).not.toContain('DB_PASSWORD');
    expect(filled).not.toContain('JWT_SECRET');
    expect(env.get('DB_PASSWORD')).toBe('x');
    expect(env.get('JWT_SECRET')).toBe('y');
  });
});
