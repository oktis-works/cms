// @oktis-works/cms - `okcms dev`
//
// O contrato testado aqui: um assistente único que prepara o dev do zero
// (.env → infra → banco → primeiro admin → start), é reexecutável, nunca
// sobrescreve valores do .env e exige `--yes` fora de TTY — a mesma
// filosofia do `okcms update`.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Writable } from 'node:stream';

import { EnvFile } from './env-file.js';
import {
  DEV_INFRA_OVERRIDE,
  ensureRedisOnHost,
  fillMissingEnv,
  runDev,
  waitForDatabaseReady,
  type DevHooks,
  type DevUserInput,
} from './dev.js';
import { Prompt, type PromptIO } from './prompt.js';
import type { ContainerProbe } from './guards.js';
import type { Runner } from './docker.js';

let dir: string;
/** syncProcessEnv escreve em process.env — restaura para não vazar entre testes. */
let envSnapshot: NodeJS.ProcessEnv;

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
  firstUser: { email: string; password_hash: string } | null;
  isValidBcryptHash: (hash: string) => Promise<boolean>;
}

function fakeHooks(): FakeHooks {
  const hooks = {
    prepared: 0,
    created: [] as (DevUserInput & { role?: string })[],
    started: 0,
    users: false,
    firstUser: null as { email: string; password_hash: string } | null,
    isValidBcryptHash: async (hash: string) => Promise.resolve(/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(hash)),
  } as FakeHooks;
  hooks.prepareDatabase = async (): Promise<void> => {
    hooks.prepared += 1;
  };
  hooks.anyUserExists = async (): Promise<boolean> => hooks.users;
  hooks.getFirstUser = async (): Promise<{ email: string; password_hash: string } | null> => hooks.firstUser;
  hooks.isValidBcryptHash = async (hash: string) => Promise.resolve(/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(hash));
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
  if (isTTY) {
    // Simulate a TTY input stream for the Prompt.interactive getter
    Object.defineProperty(input, 'isTTY', { value: true, configurable: true });
  }
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
  envSnapshot = { ...process.env };
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  for (const key of Object.keys(process.env)) {
    if (!(key in envSnapshot)) delete process.env[key];
  }
  Object.assign(process.env, envSnapshot);
});

describe('runDev', () => {
  it('fluxo completo no TTY: .env → infra → banco → admin → start', async () => {
    writeFileSync(join(dir, 'docker-compose.infra.yml'), 'name: okcms\nservices: {}\n');
    const hooks = fakeHooks();
    const runner = makeRunner();
    // 1) completar .env  2) subir DB container?  3) subir Redis container?  4) email  5) nome  6) senha  7) start
    const prompt = ttyPrompt(['', 'y', 'y', 'admin@example.com', 'Admin', 'senha1234', '']);

    const code = await runDev({
      cwd: dir,
      runner,
      prompt,
      probe: HOST_PROBE,
      hooks,
      // sondas herméticas: sem TCP real para o postgres/redis da máquina
      infraWait: { tcpProbe: async () => true, sleep: async () => {} },
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
    hooks.firstUser = { email: 'admin@test.com', password_hash: '$2b$10$abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopq' };
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

  it('process.env envenenado com placeholder vazio é curado pelo .env da raiz', async () => {
    // Reprodução do bug: o processo nasceu com o snapshot do init
    // (DB_PASSWORD= vazio) e o arquivo já foi preenchido pela entrevista.
    writeFileSync(join(dir, '.env'), 'DB_PASSWORD=okcms777\n');
    process.env['DB_PASSWORD'] = '';
    const hooks = fakeHooks();
    hooks.users = true;
    hooks.firstUser = { email: 'admin@test.com', password_hash: '$2b$10$abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopq' };
    const prompt = ttyPrompt(['y']); // completar o resto do .env

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
    // o valor do arquivo (nunca o placeholder vazio herdado) é o que vale
    expect(process.env['DB_PASSWORD']).toBe('okcms777');
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
    hooks.firstUser = { email: 'admin@test.com', password_hash: '$2b$10$abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopq' };
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
    hooks.firstUser = { email: 'admin@test.com', password_hash: '$2b$10$abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopq' };
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

  it('espera o postgres aceitar conexões (pg_isready) antes das migrations', async () => {
    writeFileSync(join(dir, 'docker-compose.infra.yml'), 'name: okcms\nservices: {}\n');
    const hooks = fakeHooks();
    const events: string[] = [];
    let isready = 0;
    const runner = ((command: string, args: string[]) => {
      const line = [command, ...args].join(' ');
      if (args[0] === 'version') return res({ stdout: '29.8.2\n' });
      if (args[0] === 'compose' && args[1] === 'version') return res({ stdout: '2.24.0\n' });
      if (args[1] === 'okcms-postgres' && args[2] === 'pg_isready') {
        isready += 1;
        events.push('pg_isready');
        // ainda subindo nas duas primeiras tentativas
        return isready < 3
          ? res({ ok: false, code: 1, stderr: 'the database system is starting up' })
          : res({ stdout: 'accepting connections' });
      }
      return res({ command: line });
    }) as Runner;
    hooks.prepareDatabase = async (): Promise<void> => {
      events.push('prepare');
      hooks.prepared += 1;
    };
    const prompt = ttyPrompt(['y', 'y', '', 'admin@example.com', 'Admin', 'senha1234', '']);

    const code = await runDev({
      cwd: dir,
      runner,
      prompt,
      probe: HOST_PROBE,
      hooks,
      infraWait: { tcpProbe: async () => true, sleep: async () => {} },
    });

    expect(code).toBe(0);
    expect(isready).toBe(3); // 2 falhas + sucesso
    // pg_isready ANTES das migrations — a corrida que quebrava o dev
    expect(events.indexOf('prepare')).toBeGreaterThan(events.indexOf('pg_isready'));
    expect(prompt.printed()).toContain('postgres is ready');
    prompt.close();
  });

  it('postgres nunca fica pronto com a infra recém-subida: erro claro, código 1', async () => {
    writeFileSync(join(dir, 'docker-compose.infra.yml'), 'name: okcms\nservices: {}\n');
    const hooks = fakeHooks();
    const runner = ((command: string, args: string[]) => {
      if (args[0] === 'version') return res({ stdout: '29.8.2\n' });
      if (args[0] === 'compose' && args[1] === 'version') return res({ stdout: '2.24.0\n' });
      if (args[1] === 'okcms-postgres' && args[2] === 'pg_isready') {
        return res({ ok: false, code: 1, stderr: 'the database system is starting up' });
      }
      return res({ command: [command, ...args].join(' ') });
    }) as Runner;
    const prompt = ttyPrompt(['y', 'y', '']);

    const code = await runDev({
      cwd: dir,
      runner,
      prompt,
      probe: HOST_PROBE,
      hooks,
      infraWait: { tcpProbe: async () => false, sleep: async () => {}, postgresWaitMs: 0 },
    });

    expect(code).toBe(1);
    expect(hooks.prepared).toBe(0); // nada de migration contra um banco subindo
    expect(prompt.printed()).toContain('postgres did not accept connections in time');
    prompt.close();
  });

  it('banco inacessível: instrução de recuperação em vez de stack crua', async () => {
    const hooks = fakeHooks();
    hooks.users = true;
    hooks.firstUser = { email: 'admin@test.com', password_hash: '$2b$10$abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopq' };
    hooks.prepareDatabase = async (): Promise<void> => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:5432');
    };
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
    expect(prompt.printed()).toContain('the database is not reachable');
    prompt.close();
  });

  it('imprime os endereços finais (API/Admin/Web) antes de subir os apps', async () => {
    writeFileSync(
      join(dir, 'okcms.config.json'),
      JSON.stringify({ name: 'x', ports: { api: 3300, admin: 3311, web: 3301 } })
    );
    const hooks = fakeHooks();
    hooks.users = true;
    hooks.firstUser = { email: 'admin@test.com', password_hash: '$2b$10$abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopq' };
    const prompt = ttyPrompt(['y']); // completar .env

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

    expect(code).toBe(0);
    const printed = prompt.printed();
    expect(printed).toContain('http://localhost:3300');
    expect(printed).toContain('http://localhost:3311');
    expect(printed).toContain('http://localhost:3301');
    prompt.close();
  });
});

describe('waitForDatabaseReady', () => {
  it('container inexistente (banco externo): cai no probe TCP do host', async () => {
    const runner = (() =>
      res({ ok: false, code: 127, stderr: 'Error: No such container: okcms-postgres' })) as Runner;
    const probed: string[] = [];

    const ready = await waitForDatabaseReady(runner, { DB_PORT: '5544' }, {
      tcpProbe: async (host, port) => {
        probed.push(`${host}:${port}`);
        return true;
      },
      sleep: async () => {},
    });

    expect(ready).toBe(true);
    expect(probed).toEqual(['127.0.0.1:5544']);
  });

  it('pg_isready ok na primeira (Postgres): sem espera', async () => {
    const calls: string[] = [];
    const runner = ((_c: string, args: string[]) => {
      calls.push(args.join(' '));
      return res({ stdout: 'accepting connections' });
    }) as Runner;
    const sleeps: number[] = [];

    const ready = await waitForDatabaseReady(runner, { DB_ENGINE: 'postgres' }, {
      sleep: async (ms) => { sleeps.push(ms); },
      tcpProbe: async () => false,
    });

    expect(ready).toBe(true);
    expect(sleeps).toEqual([]);
    expect(calls[0]).toContain('pg_isready');
  });

  it('probes MySQL-compatible database engines with the provider health command', async () => {
    const calls: string[] = [];
    const runner = ((_c: string, args: string[]) => {
      calls.push(args.join(' '));
      return res({ stdout: 'mysqld is alive' });
    }) as Runner;
    const sleeps: number[] = [];

    const ready = await waitForDatabaseReady(runner, { DB_ENGINE: 'mysql', DB_PASSWORD: 'secret' }, {
      sleep: async (ms) => { sleeps.push(ms); },
      tcpProbe: async () => false,
    });

    expect(ready).toBe(true);
    expect(sleeps).toEqual([]);
    expect(calls[0]).toContain('mysqladmin ping');
  });
});

describe('ensureRedisOnHost', () => {
  const composeFixture = (): void => {
    writeFileSync(join(dir, 'docker-compose.infra.yml'), 'name: okcms\nservices: {}\n');
  };

  it('redis não publicado: grava override de dev e recria só o serviço', async () => {
    composeFixture();
    const calls: string[] = [];
    const runner = ((command: string, args: string[]) => {
      const line = [command, ...args].join(' ');
      calls.push(line);
      if (args[0] === 'version') return res({ stdout: '29.8.2\n' });
      if (args[0] === 'compose' && args[1] === 'version') return res({ stdout: '2.24.0\n' });
      return res({ command: line });
    }) as Runner;
    const prompt = nonTty();
    let probes = 0;

    await ensureRedisOnHost(prompt, runner, dir, { REDIS_HOST: 'localhost', REDIS_PORT: '6379' }, {
      tcpProbe: async () => {
        probes += 1;
        return probes > 1; // fechado antes do override, aberto depois
      },
      sleep: async () => {},
      apply: true,
    });

    const override = readFileSync(join(dir, '.data', 'dev-infra.override.yml'), 'utf-8');
    expect(override).toBe(DEV_INFRA_OVERRIDE);
    expect(override).toContain('127.0.0.1:${REDIS_PORT:-6379}:6379');
    const up = calls.find((line) => line.includes('up -d redis'));
    expect(up).toBeDefined();
    expect(up).toContain('-f docker-compose.infra.yml');
    expect(up).toContain('.data/dev-infra.override.yml');
    expect(prompt.printed()).toContain('Redis reachable on host (loopback)');
    prompt.close();
  });

  it('redis já alcançável: não mexe no compose', async () => {
    composeFixture();
    const calls: string[] = [];
    const runner = ((command: string, args: string[]) => {
      const line = [command, ...args].join(' ');
      calls.push(line);
      if (args[0] === 'version') return res({ stdout: '29.8.2\n' });
      if (args[0] === 'compose' && args[1] === 'version') return res({ stdout: '2.24.0\n' });
      return res({ command: line });
    }) as Runner;
    const prompt = nonTty();

    await ensureRedisOnHost(prompt, runner, dir, { REDIS_HOST: 'localhost' }, {
      tcpProbe: async () => true,
      apply: true,
    });

    expect(calls.some((line) => line.includes('up'))).toBe(false);
    expect(existsSync(join(dir, '.data', 'dev-infra.override.yml'))).toBe(false);
    prompt.close();
  });

  it('apply:false (infra recusada) e REDIS_HOST=disabled: só avisa / nada', async () => {
    composeFixture();
    const calls: string[] = [];
    const runner = ((command: string, args: string[]) => {
      calls.push([command, ...args].join(' '));
      if (args[0] === 'version') return res({ stdout: '29.8.2\n' });
      if (args[0] === 'compose' && args[1] === 'version') return res({ stdout: '2.24.0\n' });
      return res({});
    }) as Runner;
    const prompt = nonTty();

    await ensureRedisOnHost(prompt, runner, dir, { REDIS_HOST: 'localhost' }, {
      tcpProbe: async () => false,
      apply: false,
    });
    expect(prompt.printed()).toContain('Redis not reachable on host');
    expect(calls.some((line) => line.includes('up'))).toBe(false);
    expect(existsSync(join(dir, '.data', 'dev-infra.override.yml'))).toBe(false);

    const prompt2 = nonTty();
    await ensureRedisOnHost(prompt2, runner, dir, { REDIS_HOST: 'disabled' }, {
      tcpProbe: async () => false,
      apply: true,
    });
    expect(prompt2.printed()).toBe('');
    prompt.close();
    prompt2.close();
  });

  it('redis externo (host não-loopback): não tenta override', async () => {
    composeFixture();
    const prompt = nonTty();
    let probed = 0;

    await ensureRedisOnHost(prompt, (() => res({})) as Runner, dir, { REDIS_HOST: 'redis.internal' }, {
      tcpProbe: async () => {
        probed += 1;
        return false;
      },
      apply: true,
    });

    expect(probed).toBe(0);
    expect(prompt.printed()).toBe('');
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
