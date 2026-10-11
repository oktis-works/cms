// @oktis-works/cms - `okcms dev` (F5)
//
// Um comando só para subir o ambiente de desenvolvimento do zero:
//
//   1. `.env`      completa o que falta (segredos gerados, valores existentes
//                  NUNCA são tocados);
//   2. infra      sobe o compose de infra do projeto (postgres + redis) —
//                  a MESMA infra que os alvos de `okcms deploy` reutilizam;
//   3. banco      schema core + seed idempotente + migrations de `./migrations`
//                  (o mesmo caminho do `okcms db:migrate`);
//   4. usuário    se não existe NINGUÉM no banco, cria o primeiro admin
//                  (SUPER_ADMIN) pelo mesmo caminho do `okcms user:create`;
//   5. apps       `okcms start` (api · admin · web · worker no host).
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

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  COMPOSE_INFRA_FILE,
  composeAvailable,
  defaultRunner,
  dockerAvailable,
  infraCompose,
  type Runner,
} from './docker.js';
import { EnvFile, loadEnvFile } from './env-file.js';
import { ENV_FIELDS } from './env-schema.js';
import { assertHostOnly, generateSecret, type ContainerProbe } from './guards.js';
import { Prompt } from './prompt.js';

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
  /** `--no-infra`: não sobe o compose de infra (Postgres externo). */
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
}

const isEmail = (value: string): string | null =>
  /.+@.+\..+/.test(value) ? null : 'invalid email';
const nonEmpty = (value: string): string | null =>
  value.trim().length > 0 ? null : 'required';
const min8 = (value: string): string | null =>
  value.length >= 8 ? null : 'min 8 characters';

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

async function defaultHooks(log: (message: string) => void): Promise<DevHooks> {
  return {
    prepareDatabase: async () => {
      const { getMigrationsDir, prepareDb } = await import('./db-prepare.js');
      const { runMigrations } = await import('@oktis-works/database');
      const tenantId = await prepareDb({});
      const result = await runMigrations(tenantId, getMigrationsDir({}));
      if (result.applied.length > 0 || result.skipped.length > 0) {
        log(`✓ migrations: ${result.applied.length} applied, ${result.skipped.length} skipped`);
      }
    },
    anyUserExists: async () => {
      const { anyUserExists } = await import('./users.js');
      return anyUserExists();
    },
    createUser: async (input) => {
      const { createUserAccount } = await import('./users.js');
      await createUserAccount({ ...input, role: input.role ?? 'SUPER_ADMIN' });
    },
    startApps: async () => {
      const { startProject } = await import('./start.js');
      await startProject({});
    },
  };
}

export async function runDev(opts: DevOptions): Promise<number> {
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

  // ---- 2. infra (compose do projeto — o mesmo que o deploy reutiliza) ------
  if (opts.noInfra !== true) {
    const composeFile = join(cwd, COMPOSE_INFRA_FILE);
    if (dockerAvailable(runner) && composeAvailable(runner).ok && existsSync(composeFile)) {
      const go =
        !interactive ||
        (await prompt.confirm('Start the infrastructure (docker compose: postgres + redis)?', {
          defaultValue: true,
        }));
      if (go) {
        prompt.write('\nStarting infrastructure...\n');
        const result = infraCompose(cwd, ['up', '-d'], runner, true);
        if (!result.ok) {
          prompt.error('failed to start the infrastructure — run `docker compose -f docker-compose.infra.yml up -d` to see why');
          return 1;
        }
        prompt.success('infrastructure is up (postgres + redis)');
        prompt.info('same infra reused by `okcms deploy` targets — nothing to redo later');
      }
    } else {
      prompt.warn('docker/compose not available — infrastructure step skipped');
      prompt.info('point DB_* in .env at your own Postgres; REDIS_HOST=disabled runs without Redis (dev only, not written to .env)');
    }
  }

  // ---- 3. banco: schema + seed + migrations -------------------------------
  await hooks.prepareDatabase();
  prompt.success('database ready (schema + seed + migrations)');

  // ---- 4. primeiro usuário (se o banco está vazio) -------------------------
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
    prompt.success('users already exist — user creation skipped');
  }

  // ---- 5. apps -------------------------------------------------------------
  const finishNotStarted = (): void => {
    prompt.success('dev environment ready');
    prompt.info('start the apps with `okcms start` (or rerun `okcms dev`)');
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

  const goStart =
    !interactive ||
    (await prompt.confirm('Start the apps now (api · admin · web · worker)?', {
      defaultValue: true,
    }));
  if (!goStart) {
    finishNotStarted();
    return 0;
  }

  prompt.success('dev environment ready — starting the apps (Ctrl+C stops everything)');
  prompt.info('deploying later? `okcms stop` first — dev processes hold the ports the containers need');
  await hooks.startApps();
  return 0;
}
