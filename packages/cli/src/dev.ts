// @oktis-works/cms - `okcms dev` (F5)
//
// Um comando só para subir o ambiente de desenvolvimento do zero:
//
//   1. `.env`      completa o que falta (segredos gerados, valores existentes
//                  NUNCA são tocados);
//   2. infra      sobe o compose de infra do projeto (Postgres/MySQL/MariaDB + redis) —
//                  a MESMA infra que os alvos de `okcms deploy` reutilizam —
//                  e ESPERA o banco aceitar conexões antes de qualquer migration.
//                  O compose de infra não publica o redis no host (por design de
//                  produção); para os apps de HOST funcionarem, o dev escreve
//                  um override SOLO de dev em `.data/dev-infra.override.yml`
//                  que publica `127.0.0.1:6379` — o deploy recria o serviço
//                  sem ele (a porta some sozinha, o volume fica intacto);
//   3. banco      schema core + seed idempotente + migrations de `./migrations`
//                  (o mesmo caminho do `okcms db:migrate`);
//   4. usuário    se não existe NINGUÉM no banco, cria o primeiro admin
//                  (SUPER_ADMIN) pelo mesmo caminho do `okcms user:create`;
//   5. apps       `okcms start` (api · admin · web · worker no host) e os
//                  endereços finais impressos (API/Admin/Web no localhost).
//
// Cada etapa é reexecutável — rodar de novo depois de um
// `docker compose down -v` recria tudo na hora.
//
// Pontos de colisão com `okcms deploy` (aqui tratados, não deixados pra lá):
//
//   • PORTAS — os apps do `start` ocupam as mesmas portas que os containers
//     do deploy; por isso o resumo final lembra sempre: `okcms stop` antes
//     de `okcms deploy`. Se já houver apps rodando, o assistente pergunta se
//     reinicia (para não brigar por porta).
//   • .ENV — só chaves QUE FALTAM são escritas; nenhum valor existente é
//     sobrescrito, e nenhum workaround "de dev" (ex.: REDIS_HOST=disabled)
//     é gravado no arquivo: sem Docker o passo avisa e segue, deixando a
//     decisão do operador.
//   • BANCO — o compose de infra é o mesmo do deploy (projeto `okcms`); o
//     schema é versionado e o seed é idempotente, então nada do que o dev
//     faz é jogado fora quando você muda para produção.
//
// Fora de TTY o fluxo completo exige `--yes` (mesma política do
// `okcms update`); o primeiro usuário em scripts vem de
// `--email/--name/--password`.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { join, dirname } from 'node:path';

import {
  COMPOSE_INFRA_FILE,
  composeAvailable,
  defaultRunner,
  dockerAvailable,
  infraCompose,
  type Runner,
} from './docker.js';
import { EnvFile, loadEnvFile, syncProcessEnv } from './env-file.js';
import { ENV_FIELDS } from './env-schema.js';
import { assertHostOnly, generateSecret, type ContainerProbe } from './guards.js';
import { loadProjectConfig } from './project-config.js';
import { Prompt } from './prompt.js';
import { migrateThemeManifests } from './theme-migrate.js';
import { getInfraComposePath } from './assets.js';

export interface DevUserInput {
  email: string;
  name: string;
  password: string;
  /** Default: SUPER_ADMIN (o primeiro usuário do dev). */
  role?: string;
}

/**
 * Pontos que tocam o banco/servidor — injetáveis para os testes ficarem
 * herméticos (sem Postgres real). Em produção, o default usa os mesmos
 * módulos dos comandos `db:migrate`/`user:create`/`start`.
 */
export interface DevHooks {
  /** Schema core + seed + migrations de `./migrations`. */
  prepareDatabase: () => Promise<void>;
  /** Existe algum usuário no banco? */
  anyUserExists: () => Promise<boolean>;
  /** Retorna o primeiro usuário (email, password_hash) para validar hash. */
  getFirstUser: () => Promise<{ email: string; password_hash: string } | null>;
  /** Verifica se o hash é um hash bcrypt válido. */
  isValidBcryptHash: (hash: string) => Promise<boolean>;
  /** Cria o primeiro admin (mesmo caminho do `user:create`). */
  createUser: (input: DevUserInput) => Promise<void>;
  /** Sobe api · admin · web · worker (bloqueia — é o processo do dev). */
  startApps: () => Promise<void>;
}

export interface DevOptions {
  /** `--yes`: sem prompts, todos os defaults. */
  yes?: boolean;
  /** `--skip-start`: prepara tudo e não sobe os apps. */
  skipStart?: boolean;
  /** `--no-infra`: não sobe o compose de infra (banco externo). */
  noInfra?: boolean;
  /** `--force`: roda mesmo dentro de container (não recomendado). */
  force?: boolean;
  /** Primeiro admin (obrigatório em não-TTY quando não há usuários). */
  email?: string;
  name?: string;
  password?: string;
  cwd?: string;
  runner?: Runner;
  prompt?: Prompt;
  /** `assertHostOnly` probe (tests). */
  probe?: ContainerProbe;
  hooks?: DevHooks;
  log?: (message: string) => void;
  /** Sondas/timeouts da infra (tests). */
  infraWait?: InfraWaitOptions;
}

const isEmail = (value: string): string | null =>
  /.+@.+\..+/.test(value) ? null : 'invalid email';
const nonEmpty = (value: string): string | null =>
  value.trim().length > 0 ? null : 'required';
const min8 = (value: string): string | null =>
  value.length >= 8 ? null : 'min 8 characters';

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** TCP reachável? Usado para esperar o banco e checar o redis do host. */
export const defaultTcpProbe = (
  host: string,
  port: number,
  timeoutMs = 2000
): Promise<boolean> =>
  new Promise((resolve) => {
    const socket = connect({ host, port, timeout: timeoutMs });
    const settle = (ok: boolean): void => {
      socket.destroy();
      resolve(ok);
    };
    socket.once('connect', () => settle(true));
    socket.once('error', () => settle(false));
    socket.once('timeout', () => settle(false));
  });

export interface InfraWaitOptions {
  tcpProbe?: (host: string, port: number, timeoutMs?: number) => Promise<boolean>;
  sleep?: (ms: number) => Promise<void>;
  /** Timeout do banco (ms). Default 60s — primeiro boot do volume é lento. */
  postgresWaitMs?: number;
  /** Timeout do redis no host (ms). Default 30s. */
  redisWaitMs?: number;
  /**
   * Aplica o override (recria o serviço redis) quando o probe falha?
   * `runDev` liga só quando a infra subiu agora ou já está rodando — quem
   * recusou o passo de infra não tem serviço recriado às costas.
   */
  apply?: boolean;
}

/**
 * Waits for the selected database service from the compose project to accept
 * connections. The TCP fallback covers externally managed databases.
 */
export async function waitForDatabaseReady(
  runner: Runner,
  record: Record<string, string>,
  opts: InfraWaitOptions = {}
): Promise<boolean> {
  const sleep = opts.sleep ?? defaultSleep;
  const probe = opts.tcpProbe ?? defaultTcpProbe;
  const timeoutMs = opts.postgresWaitMs ?? 60_000;
  const deadline = Date.now() + timeoutMs;
  const engine = record['DB_ENGINE'] ?? 'postgres';
  if (!['postgres', 'mysql', 'mariadb'].includes(engine)) return false;
  const user = record['DB_USER'] || (engine === 'postgres' ? 'postgres' : 'okcms');
  const db = record['DB_NAME'] || 'okcms';
  const hostPort = Number(record['DB_HOST_PORT'] || record['DB_PORT'] || (engine === 'postgres' ? 5432 : 3306));
  const containerName = `okcms-${engine}`;
  const check = engine === 'postgres'
    ? ['pg_isready', '-U', user, '-d', db]
    : engine === 'mysql'
      ? ['mysqladmin', 'ping', '-h', 'localhost', '-u', user]
      : ['healthcheck.sh', '--connect'];

  for (;;) {
    const result = runner(
      'docker',
      ['exec', containerName, ...check],
      { timeoutMs: 5_000 }
    );
    if (result.ok) return true;
    if (/No such container/i.test(result.stderr)) {
      return probe('127.0.0.1', hostPort);
    }
    if (Date.now() >= deadline) return false;
    await sleep(2_000);
  }
}

/** Override SOLO de dev: publica o redis em loopback para os apps de HOST. */
export const DEV_INFRA_OVERRIDE = `# Written by \`okcms dev\` — publishes Redis on loopback (127.0.0.1) so the
# HOST processes (api/admin/web/worker from \`okcms start\`) can reach it.
# The deploy re-runs compose WITHOUT this file: Redis goes back to
# network-only (containers reach it as \`redis\` on okcms-net). The named
# volume okcms-redis-data is untouched by both paths.
#
# Safe to delete; \`okcms dev\` rewrites it on the next run.
services:
  redis:
    ports:
      - "127.0.0.1:\${REDIS_PORT:-6379}:6379"
`;

/**
 * Garante o Redis alcançável do host quando o .env aponta para
 * localhost/127.0.0.1: o compose de infra NÃO publica a 6379 (por design de
 * produção), então o dev recria só o serviço redis com um override de dev
 * (loopback) — volume preservado, deploy volta ao normal sem o override.
 */
export async function ensureRedisOnHost(
  prompt: Prompt,
  runner: Runner,
  cwd: string,
  record: Record<string, string>,
  opts: InfraWaitOptions = {}
): Promise<void> {
  const host = (record['REDIS_HOST'] ?? 'localhost').trim() || 'localhost';
  if (host === 'disabled') return;
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) return; // external redis

  const port = Number(record['REDIS_PORT'] || 6379);
  const tcpProbe = opts.tcpProbe ?? defaultTcpProbe;
  const sleep = opts.sleep ?? defaultSleep;
  const timeoutMs = opts.redisWaitMs ?? 30_000;
  const deadline = Date.now() + timeoutMs;

  if (await tcpProbe('127.0.0.1', port)) return; // already reachable (new compose or previous override)

  if (!opts.apply) {
    prompt.warn('Redis not reachable on host — run `okcms dev` and accept the infra step, or use REDIS_HOST=disabled (dev only).');
    return;
  }

  const composeFile = join(cwd, COMPOSE_INFRA_FILE);
  if (
    !dockerAvailable(runner) ||
    !composeAvailable(runner).ok ||
    !existsSync(composeFile)
  ) {
    prompt.warn('Redis not reachable on host — worker queues will not connect');
    prompt.info('start the infrastructure (`okcms dev` → Yes), or set REDIS_HOST=disabled to run without queues (dev only)');
    return;
  }

  prompt.write('\nRedis not reachable on host — publishing port 6379 on loopback via dev override...\n');

  const overridePath = join(cwd, '.data', 'dev-infra.override.yml');
  mkdirSync(dirname(overridePath), { recursive: true });
  writeFileSync(overridePath, DEV_INFRA_OVERRIDE);

  const runnerWithOverride = (args: string[]) =>
    infraCompose(cwd, ['-f', COMPOSE_INFRA_FILE, '-f', overridePath, ...args], runner, true);

  const result = await runnerWithOverride(['up', '-d', 'redis']);
  if (!result.ok) {
    prompt.error('failed to recreate redis with loopback override');
    return;
  }

  for (;;) {
    if (await tcpProbe('127.0.0.1', port)) {
      prompt.success('Redis reachable on host (loopback)');
      return;
    }
    if (Date.now() >= deadline) {
      prompt.error('Redis did not become reachable on host in time');
      return;
    }
    await sleep(2_000);
  }
}

async function defaultHooks(log: (message: string) => void): Promise<DevHooks> {
  return {
    prepareDatabase: async () => {
      const { getMigrationsDir, prepareDb } = await import('./db-prepare.js');
      const { runMigrations } = await import('@oktis-works/database');
      const tenantId = await prepareDb({}, { seed: true });
      const result = await runMigrations(tenantId, getMigrationsDir({}));
      if (result.applied.length > 0 || result.skipped.length > 0) {
        log(`✓ migrations: ${result.applied.length} applied, ${result.skipped.length} skipped`);
      }
    },
    anyUserExists: async () => {
      const { anyUserExists } = await import('./users.js');
      return anyUserExists();
    },
    getFirstUser: async () => {
      const { getFirstUser } = await import('./users.js');
      return getFirstUser();
    },
    isValidBcryptHash: async (hash: string) => {
      const { isValidBcryptHash } = await import('./users.js');
      return isValidBcryptHash(hash);
    },
    createUser: async (input: DevUserInput) => {
      const { createUserAccount } = await import('./users.js');
      await createUserAccount(input);
    },
    startApps: async () => {
      const { startProject } = await import('./start.js');
      await startProject({});
    },
  };
}

export async function runDev(opts: DevOptions = {}): Promise<number> {
  const cwd = opts.cwd ?? process.cwd();
  const runner = opts.runner ?? defaultRunner;
  const prompt = opts.prompt ?? new Prompt();
  const log = opts.log ?? ((message: string) => console.log(message));
  const interactive = prompt.interactive && opts.yes !== true;

  const guard = assertHostOnly('okcms dev', { force: opts.force, probe: opts.probe });
  if (!guard.ok) {
    prompt.error(guard.message);
    return 1;
  }

  // Mesma política do `okcms update`: sem TTY não existe assistente implícito.
  if (!interactive && opts.yes !== true) {
    prompt.warn('interactive confirmation required for the full dev setup.');
    prompt.info('Run `okcms dev --yes` in scripts; add --email/--name/--password for the first user.');
    return 1;
  }

  const hooks = opts.hooks ?? (await defaultHooks(log));
  prompt.heading('OkCMS dev');

  // ---- 0. unificação theme.json --------------------------------------------
  // Projetos antigos gravam o manifesto do tema default como `manifest.json`;
  // migra antes de subir os apps (o ThemeLoader só lê o nome canônico).
  const migratedThemes = migrateThemeManifests(join(cwd, loadProjectConfig(cwd).themesDir));
  if (migratedThemes.length > 0) {
    log(`theme manifest(s) migrated to theme.json: ${migratedThemes.join(', ')}`);
  }

  // ---- 1. .env -------------------------------------------------------------
  const envPath = join(cwd, '.env');
  const examplePath = join(cwd, '.env.example');
  const env = existsSync(envPath)
    ? loadEnvFile(envPath)
    : new EnvFile(existsSync(examplePath) ? readFileSync(examplePath, 'utf-8') : '', envPath);

  const missing = fillMissingEnv(env);
  if (missing.length > 0) {
    if (interactive) {
      const go = await prompt.confirm(
        `Complete .env — ${missing.length} value(s) missing (secrets are generated, existing values are kept)?`,
        { defaultValue: true }
      );
      if (!go) {
        prompt.error('.env is incomplete — `okcms dev` needs the required values to continue.');
        return 1;
      }
    }
    env.save();
    prompt.success(`.env completed: ${missing.join(', ')}`);
  } else {
    prompt.success('.env is ready');
  }

  // O processo pode nascer com snapshot antigo/parado do .env (o bun carrega
  // `.env` no start e não sobrescreve o que já está definido — shell pode ter
  // exportado o placeholder vazio do init). O arquivo é a fonte: sem esta
  // cura as migrations conectam com '' enquanto o compose criou o banco com o
  // valor da .env da raiz.
  syncProcessEnv(env);

  // ---- 2. infra (compose do projeto — o mesmo que o deploy reutiliza) ------
  const record = env.toRecord();
  const engine = record['DB_ENGINE'] ?? 'postgres';
  if (!['postgres', 'mysql', 'mariadb'].includes(engine)) {
    prompt.error(`DB_ENGINE=${engine} is not a supported database provider.`);
    return 1;
  }
  let startedDb = false;
  let startedRedis = false;

  if (opts.noInfra !== true) {
    const composeFile = join(cwd, COMPOSE_INFRA_FILE);
    if (dockerAvailable(runner) && composeAvailable(runner).ok && existsSync(composeFile)) {
      // Pergunta individualmente para o banco
      const goDb = !interactive ||
        (await prompt.confirm(`Start the ${engine} database container?`, { defaultValue: true }));
      // Pergunta individualmente para o Redis
      const goRedis = !interactive ||
        (await prompt.confirm('Start the Redis container?', { defaultValue: true }));

      if (goDb || goRedis) {
        prompt.write('\nStarting infrastructure...\n');
        const services = [];
        if (goDb) services.push(engine);
        if (goRedis) services.push('redis');
        const result = infraCompose(cwd, ['up', '-d', ...services], runner, true);
        if (!result.ok) {
          prompt.error(`failed to start the infrastructure — run \`docker compose -f ${getInfraComposePath(engine)} up -d\` to see why`);
          return 1;
        }
        if (goDb) startedDb = true;
        if (goRedis) startedRedis = true;
        prompt.success(`infrastructure is up${goDb ? ` (${engine})` : ''}${goRedis ? ' (redis)' : ''}`);
        prompt.info('same infra reused by `okcms deploy` targets — nothing to redo later');
      }

      // Espera o banco aceitar conexões
      if (startedDb || interactive) {
        const dbLabel = engine === 'postgres' ? 'postgres' : engine;
        prompt.write(`Waiting for ${dbLabel} to accept connections...\n`);
        const ready = await waitForDatabaseReady(runner, record, {
          ...opts.infraWait,
          postgresWaitMs: opts.infraWait?.postgresWaitMs ?? (startedDb ? 60_000 : 10_000),
        });
        if (ready) {
          prompt.success(`${dbLabel} is ready`);
        } else if (startedDb) {
          prompt.error(`${dbLabel} did not accept connections in time — check \`docker compose logs ${engine}\``);
          return 1;
        } else {
          prompt.warn(`${dbLabel} not reachable yet — continuing (migrations will surface the real error)`);
        }
      }

      // O compose de infra NÃO publica a 6379 no host (por design de
      // produção) — mas os apps do `start` rodam NO host e precisam dela.
      // Só recria o serviço quando a infra subiu agora (quem recusou o
      // passo não tem container recriado às costas).
      await ensureRedisOnHost(prompt, runner, cwd, record, {
        ...opts.infraWait,
        apply: startedRedis,
      });
    } else {
      prompt.warn('docker/compose not available — infrastructure step skipped');
      prompt.info('point DB_* in .env at your own PostgreSQL instance; REDIS_HOST=disabled runs without Redis (dev only, not written to .env)');
    }
  }

  // ---- 3. banco: schema + seed + migrations -------------------------------
  try {
    await hooks.prepareDatabase();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    prompt.error(`database setup failed: ${message}`);
    if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|starting up|Connection terminated/i.test(message)) {
      prompt.info('the database is not reachable — rerun `okcms dev` and answer Yes to the infrastructure step,');
      prompt.info('or point DB_HOST/DB_PORT/DATABASE_URL in .env at a running PostgreSQL instance.');
    }
    return 1;
  }
  prompt.success('database ready (schema + seed + migrations)');

  // ---- 4. primeiro usuário (se o banco está vazio ou o hash é inválido) -------
  const hasUsers = await hooks.anyUserExists();
  if (!hasUsers) {
    prompt.info('no users yet — the first account becomes SUPER_ADMIN');
    let email = opts.email;
    let name = opts.name;
    let password = opts.password;
    if (interactive) {
      email = email ?? (await prompt.ask('Admin email', { validate: isEmail }));
      name = name ?? (await prompt.ask('Admin name', { validate: nonEmpty }));
      password =
        password ?? (await prompt.secret('Admin password (min 8 characters)', { validate: min8 }));
    }
    if (!email || !name || !password) {
      prompt.error('first user required — pass --email, --name and --password (non-TTY)');
      return 1;
    }
    await hooks.createUser({ email, name, password, role: 'SUPER_ADMIN' });
    prompt.success(`first user created: ${email} (SUPER_ADMIN)`);
  } else {
    // Verifica se o usuário existente tem hash válido
    const firstUser = await hooks.getFirstUser();
    if (firstUser && !(await hooks.isValidBcryptHash(firstUser.password_hash))) {
      prompt.warn('existing user has invalid password hash — please set new admin credentials');
      let email = opts.email;
      let name = opts.name;
      let password = opts.password;
      if (interactive) {
        email = email ?? (await prompt.ask('Admin email', { validate: isEmail }));
        name = name ?? (await prompt.ask('Admin name', { validate: nonEmpty }));
        password =
          password ?? (await prompt.secret('Admin password (min 8 characters)', { validate: min8 }));
      }
      if (!email || !name || !password) {
        prompt.error('admin credentials required — pass --email, --name and --password (non-TTY)');
        return 1;
      }
      await hooks.createUser({ email, name, password, role: 'SUPER_ADMIN' });
      prompt.success(`admin user updated: ${email} (SUPER_ADMIN)`);
    } else {
      prompt.success('users already exist — user creation skipped');
    }
  }

  // ---- 5. apps -------------------------------------------------------------
  const config = loadProjectConfig(cwd);
  const urls = [
    `API    http://localhost:${config.ports.api}`,
    `Admin  http://localhost:${config.ports.admin}`,
    `Web    http://localhost:${config.ports.web}`,
  ];
  const finishNotStarted = (): void => {
    prompt.success('dev environment ready');
    prompt.info('start the apps with `okcms start` (or rerun `okcms dev`), then open:');
    for (const url of urls) prompt.info(`  ${url}`);
    prompt.info('deploying later? `okcms stop` first — dev processes hold the ports the containers need');
  };

  if (opts.skipStart === true) {
    finishNotStarted();
    return 0;
  }

  const { statusAll, stopAll } = await import('./runtime-state.js');
  const running = statusAll(cwd).filter((entry) => entry.alive);
  if (running.length > 0) {
    const restart = interactive
      ? await prompt.confirm(`${running.length} app(s) already running — restart them?`, {
          defaultValue: true,
        })
      : true;
    if (!restart) {
      prompt.info('kept as is — `okcms status` to inspect, `okcms stop` to stop');
      return 0;
    }
    stopAll('SIGTERM', cwd);
  }

  await hooks.startApps();
  prompt.success('all apps started');
  for (const url of urls) prompt.info(`  ${url}`);
  prompt.info('deploying later? `okcms stop` first — dev processes hold the ports the containers need');
  return 0;
}

/**
 * Completa apenas as chaves ausentes/vazias: required sem valor recebe
 * segredo gerado; o resto recebe o default do schema. Respeita `when`
 * (ex.: DB_PASSWORD não existe quando o projeto usa DATABASE_URL).
 * Devolve as chaves preenchidas (nunca os valores).
 */
export function fillMissingEnv(env: EnvFile): string[] {
  const record = env.toRecord();
  const filled: string[] = [];

  for (const field of ENV_FIELDS) {
    if ((record[field.key] ?? '').trim() !== '') continue;
    if (field.when && !field.when(record)) continue;

    if (field.required) {
      record[field.key] = generateSecret(48);
      filled.push(field.key);
    } else if (field.default !== undefined) {
      record[field.key] = field.default;
      filled.push(field.key);
    }
  }

  for (const key of filled) env.set(key, record[key]!);
  return filled;
}
