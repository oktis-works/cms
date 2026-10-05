// @oktis-works/cms - Deploy blue/green (F3)
//
// O contrato de ordem é o produto deste arquivo. Cada passo existe porque
// inverter a ordem quebra alguma coisa concreta:
//
//   1. arquivos de deploy   → sem docker-compose.deploy.yml não há o que subir
//   2. preflight            → docker/compose ausente detectado ANTES de mexer
//   3. rede + infra         → a lane depende de okcms-net, postgres e redis
//   4. pacotes no host      → o db:migrate do passo 6 roda com o pacote novo
//   5. build da lane nova   → imagem nova ainda sem tráfego
//   6. db:migrate NO HOST   → entre build e tráfego; falhou = nada mudou
//   7. sobe edge da lane    → contêineres prontos antes do proxy apontar
//   8. healthcheck          → gate real do blue/green: falhou = rollback
//   9. swap do nginx        → 3 linhas + `nginx -s reload` (conexões vivas)
//  10. drena worker antigo  → SIGTERM + stop_grace_period, ANTES do novo subir
//  11. sobe worker novo     → nunca duas filas consumindo ao mesmo tempo
//  12. derruba lane antiga  → `down` SEM -v: o volume de mídia é compartilhado
//
// A CLI NUNCA roda dentro do container (ver `assertHostOnly`): o deploy é
// sempre a partir do host, contra o socket do Docker local.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { deployAssets, portsFromEnv, type Lane } from './assets.js';
import {
  COMPOSE_DEPLOY_FILE,
  SIMPLE_WORKER_CONTAINER,
  appCompose,
  classifyServices,
  composeAvailable,
  defaultRunner,
  detectActiveLane,
  dockerAvailable,
  ensureNetwork,
  infraCompose,
  isHealthy,
  laneCompose,
  otherLane,
  parseComposeServices,
  pushLaneState,
  readLaneState,
  readUpstreamsLane,
  reloadProxy,
  restartProxy,
  simpleStackRunning,
  waitStopped,
  waitForContainer,
  writeLaneState,
  writeUpstreams,
  type ComposeServiceInfo,
  type Runner,
} from './docker.js';
import { loadEnvFile } from './env-file.js';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/** O que o operador escolheu no wizard (ou que as flags decidiram). */
export interface DeployChoices {
  /** `docker compose build --no-cache` — build limpo, mais lento. */
  noCache: boolean;
  /** `down --remove-orphans` na lane antiga. */
  removeOrphans: boolean;
}

export interface DeployOptions {
  cwd?: string;
  runner?: Runner;
  log?: (message: string) => void;
  warn?: (message: string) => void;
  /** `pkg@latest` a instalar no host antes do build (vem do scan do update). */
  packages?: string[];
  /**
   * Projeto sem `node_modules` (clone novo): roda `bun install` no passo de
   * pacotes em vez de `bun add` — o `db:migrate` do host precisa das deps.
   */
  installAll?: boolean;
  choices: DeployChoices;
  /**
   * Verificação final pelo proxy (porta 80). Falha aqui é AVISO, não rollback:
   * o gate autoritativo é o healthcheck de cada contêiner da lane, feito
   * dentro da rede antes do swap.
   */
  healthProbe?: (url: string) => Promise<boolean>;
  /**
   * Timeouts por passo. Exposto para os testes rodarem em milissegundos —
   * em produção os defaults de 3 min é o que cabe um pull de imagem fria.
   */
  timeouts?: DeployTimeouts;
}

export interface DeployTimeouts {
  /** healthcheck de postgres/redis (puxa imagem no primeiro deploy). */
  dataMs?: number;
  /** healthcheck dos contêineres de edge da lane nova. */
  edgeMs?: number;
  /** espera do SIGTERM do worker antigo (depois do stop_grace_period). */
  stopMs?: number;
  /** intervalo de sondagem em geral. */
  intervalMs?: number;
}

export const DEFAULT_TIMEOUTS: Required<DeployTimeouts> = {
  dataMs: 180_000,
  edgeMs: 180_000,
  stopMs: 60_000,
  intervalMs: 2_000,
};

export interface DeployResult {
  ok: boolean;
  /** Lane servindo ao final. Em falha, a lane que continuou no ar. */
  lane: Lane;
  previousLane: Lane | null;
  /** Arquivos de deploy criados neste passo (nunca sobrescreve os existentes). */
  created: string[];
  message?: string;
}

export const EDGE_SERVICE = (lane: Lane): string[] => [
  `api-${lane}`,
  `web-${lane}`,
  `admin-${lane}`,
];
export const WORKER_SERVICE = (lane: Lane): string => `worker-${lane}`;

/** URL final da checagem através do proxy. */
export const FINAL_HEALTH_URL = 'http://127.0.0.1/health';

async function defaultHealthProbe(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Arquivos de deploy
// ---------------------------------------------------------------------------

export function loadDeployEnv(cwd: string): Record<string, string> {
  return loadEnvFile(join(cwd, '.env')).toRecord();
}

/**
 * Grava os arquivos de deploy que faltarem, preservando os que já existem.
 *
 * Não decide nada sobre estado: quem chama diz a `lane` inicial. Isso é o que
 * permite o `okcms init` usá-lo sem tocar no Docker (o `ensureDeployFiles` do
 * deploy, logo abaixo, é que consulta a lane ativa).
 */
export function writeDeployAssets(
  cwd: string,
  lane: Lane,
  record: Record<string, string>
): string[] {
  const created: string[] = [];
  for (const asset of deployAssets(lane, portsFromEnv(record))) {
    const path = join(cwd, asset.path);
    if (existsSync(path)) continue;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, asset.content, { encoding: 'utf-8', mode: asset.mode ?? 0o644 });
    created.push(asset.path);
  }
  return created;
}

/**
 * Cria os arquivos de deploy que faltarem, preservando os que já existem.
 * Um projeto anterior ao deploy-in-Docker ganha os arquivos aqui mesmo —
 * pedir que o operador rode um outro comando só para criar config é atrito.
 * A lane ativa vem do estado salvo (ou do Docker, em último caso).
 */
export function ensureDeployFiles(
  cwd: string,
  record: Record<string, string> = loadDeployEnv(cwd),
  runner?: Runner
): string[] {
  const active = detectActiveLane(cwd, runner);
  return writeDeployAssets(cwd, active ?? 'blue', record);
}

export interface LaneServices {
  edge: string[];
  worker: string[];
}

/**
 * Nomes de serviço da lane, lidos do compose real.
 *
 * O fallback só existe para o caso de o arquivo ter sido editado até sumir os
 * papéis — aí as convenções `api-<lane>` seguram o fluxo em vez de explodir
 * no meio de um deploy.
 */
export function laneServices(cwd: string, lane: Lane): LaneServices {
  const file = join(cwd, COMPOSE_DEPLOY_FILE);
  if (existsSync(file)) {
    const parsed = classifyServices(parseComposeServices(readFileSync(file, 'utf-8')), lane);
    if (parsed.edge.length > 0 || parsed.worker.length > 0) {
      return {
        edge: parsed.edge.map((service) => service.name),
        worker: parsed.worker.map((service) => service.name),
      };
    }
  }
  return { edge: EDGE_SERVICE(lane), worker: [WORKER_SERVICE(lane)] };
}

// ---------------------------------------------------------------------------
// Preflight
// ---------------------------------------------------------------------------

export interface PreflightResult {
  ok: boolean;
  message?: string;
}

/**
 * Tudo o que precisa ser verdade ANTES de qualquer `docker compose up`.
 * Fazer isso no meio do fluxo deixaria o projeto com a rede criada, a infra
 * no ar e a build parada — pior do que não ter começado.
 */
export function preflight(runner: Runner = defaultRunner): PreflightResult {
  if (!dockerAvailable(runner)) {
    return {
      ok: false,
      message:
        'Docker is not available.\n' +
        '  Install Docker Desktop/Engine and check `docker version`.\n' +
        '  Without it, use `okcms update --mode download` to only fetch packages.',
    };
  }

  const compose = composeAvailable(runner);
  if (!compose.ok) {
    return {
      ok: false,
      message:
        'Docker Compose v2 is not available (`docker compose version` failed).\n' +
        '  The deploy uses the Compose v2 plugin — legacy `docker-compose` (v1, Python)\n' +
        '  does not understand healthchecks nor the `x-` extensions we generate.',
    };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Convenções de nome (espelham container_name do compose)
// ---------------------------------------------------------------------------

export const workerContainer = (lane: Lane): string => `okcms-${WORKER_SERVICE(lane)}`;
export const edgeContainerNames = (lane: Lane): string[] =>
  EDGE_SERVICE(lane).map((service) => `okcms-${service}`);

export interface LaneContainers {
  edge: string[];
  worker: string[];
}

/**
 * Nomes de CONTAINER (não de serviço) da lane, lidos do compose quando
 * possível: é o que o `docker inspect` entende no healthcheck e no dreno.
 */
export function laneContainers(cwd: string, lane: Lane): LaneContainers {
  const file = join(cwd, COMPOSE_DEPLOY_FILE);
  if (existsSync(file)) {
    const matched: ComposeServiceInfo[] = parseComposeServices(readFileSync(file, 'utf-8')).filter(
      (service) => service.lane === lane && (service.role === 'edge' || service.role === 'worker')
    );
    if (matched.length > 0) {
      return {
        edge: matched.filter((s) => s.role === 'edge').map((s) => s.containerName),
        worker: matched.filter((s) => s.role === 'worker').map((s) => s.containerName),
      };
    }
  }
  return { edge: edgeContainerNames(lane), worker: [workerContainer(lane)] };
}

/**
 * Como invocar o próprio `okcms db:migrate`.
 *
 * Reexecuta o MESMO binário que está rodando (argv[1]) em vez de depender de
 * PATH/npx: o caminho do projeto instalado é o único que tem as migrations e
 * o `.env` certos, e o host é onde elas devem correr (o container não tem a
 * CLI, por construção).
 */
export function migrateInvocation(): { command: string; args: string[] } {
  const entry = process.argv[1];
  if (entry) return { command: process.execPath, args: [entry, 'db:migrate'] };
  return { command: 'npx', args: ['okcms', 'db:migrate'] };
}

/** `bun add` com queda para `npm install` quando o bun não existe no host. */
function installPackages(
  cwd: string,
  packages: string[],
  runner: Runner
): ReturnType<Runner> {
  const bun = runner('bun', ['add', ...packages], { cwd, inherit: true, timeoutMs: 600_000 });
  if (bun.ok || !/ENOENT|not found|spawn/i.test(bun.stderr)) return bun;
  return runner('npm', ['install', ...packages], { cwd, inherit: true, timeoutMs: 600_000 });
}

// ---------------------------------------------------------------------------
// Deploy
// ---------------------------------------------------------------------------

export async function deployBlueGreen(opts: DeployOptions): Promise<DeployResult> {
  const cwd = opts.cwd ?? process.cwd();
  const runner = opts.runner ?? defaultRunner;
  const log = opts.log ?? ((message: string): void => void console.log(message));
  const warn = opts.warn ?? ((message: string): void => void console.warn(message));
  const choices = opts.choices;
  const packages = opts.packages ?? [];
  const probe = opts.healthProbe ?? defaultHealthProbe;
  const timeout: Required<DeployTimeouts> = { ...DEFAULT_TIMEOUTS, ...opts.timeouts };

  const record = loadDeployEnv(cwd);
  const created = ensureDeployFiles(cwd, record, runner);

  // Quem serve hoje decide para QUAL lane vamos: sempre para a outra, para
  // que a rollback exista. Primeira execução (sem estado) = sem rollback.
  const previous = detectActiveLane(cwd, runner);
  const target: Lane = previous ? otherLane(previous) : (readUpstreamsLane(cwd) ?? 'blue');

  const willDrain = previous !== null;
  // The simple stack may be what is serving now (it carries no lane labels, so
  // detectActiveLane cannot see it). It is retired only after the proxy swap.
  const simpleStack = simpleStackRunning(runner);
  const plan: string[] = [
    'Preflight: docker + compose v2',
    'Network okcms-net and infra (postgres, redis, proxy)',
    'Fetch packages on the host',
    `Build image (lane ${target}, no traffic yet)`,
    'Migrations on the host',
    `Start edge containers of lane ${target}`,
    `Healthcheck of lane ${target}`,
    'Proxy swap (nginx -s reload)',
    ...(willDrain ? [`Drain worker of lane ${previous}`] : []),
    `Start worker of lane ${target}`,
    ...(willDrain ? [`Bring down lane ${previous}`] : []),
    ...(simpleStack ? ['Retire the simple stack'] : []),
    'Record deploy state',
  ];

  const next = (index: number): void => {
    log(`\n[${index}/${plan.length}] ${plan[index - 1]}`);
  };

  const fail = (message: string): DeployResult => {
    warn(message);
    return { ok: false, lane: previous ?? target, previousLane: previous, created, message };
  };

  /** Desfaz o que este deploy já fez, deixando o cenário de antes. */
  const restoreUpstreams = (): void => {
    if (!previous) return;
    writeUpstreams(cwd, previous, record);
    const restored = reloadProxy(cwd, runner);
    if (!restored.ok) restartProxy(cwd, runner);
  };

  const dropTargetLane = (): void => {
    const result = laneCompose(
      cwd,
      target,
      ['down', ...(choices.removeOrphans ? ['--remove-orphans'] : [])],
      runner,
      true
    );
    if (!result.ok) {
      warn(`  Could not bring down lane ${target}: ${result.stderr.trim() || 'failed'}`);
    }
  };

  // ---- 1. preflight -------------------------------------------------------
  next(1);
  const ready = preflight(runner);
  if (!ready.ok) return fail(ready.message ?? 'Preflight failed.');

  // ---- 2. rede + infra ----------------------------------------------------
  next(2);
  const network = ensureNetwork(cwd, runner);
  if (!network.ok) return fail(`Could not create network okcms-net: ${network.stderr.trim()}`);

  const infra = infraCompose(cwd, ['up', '-d'], runner, true);
  if (!infra.ok) {
    return fail(
      `Infrastructure did not start (docker compose -p okcms up -d):\n${infra.stderr.trim()}`
    );
  }

  for (const dataContainer of ['okcms-postgres', 'okcms-redis']) {
    const healthy = await waitForContainer(runner, dataContainer, isHealthy, {
      timeoutMs: timeout.dataMs,
      intervalMs: timeout.intervalMs,
    });
    if (!healthy) {
      return fail(`${dataContainer} never became healthy in 3min — see \`docker logs ${dataContainer}\`.`);
    }
  }
  log(`  ✓ infra ready (postgres, redis, proxy)`);

  // ---- 3. pacotes no host -------------------------------------------------
  next(3);
  if (opts.installAll) {
    const installed = runner('bun', ['install'], { cwd, inherit: true, timeoutMs: 600_000 });
    if (!installed.ok) {
      return fail(`bun install failed:\n${installed.stderr.trim()}`);
    }
    log('  ✓ dependencies installed on the host');
  } else if (packages.length > 0) {
    const installed = installPackages(cwd, packages, runner);
    if (!installed.ok) {
      return fail(`Could not install packages on the host (${installed.command}):\n${installed.stderr.trim()}`);
    }
    log(`  ✓ ${packages.length} package(s) updated on the host`);
  } else {
    log('  ✓ nothing to install (packages up to date)');
  }

  // ---- 4. build -----------------------------------------------------------
  next(4);
  const buildArgs = ['build', ...(choices.noCache ? ['--no-cache'] : [])];
  const build = laneCompose(cwd, target, buildArgs, runner, true);
  if (!build.ok) {
    return fail(`Build of lane ${target} failed:\n${build.stderr.trim()}`);
  }
  log(`  ✓ image okcms/app built${choices.noCache ? ' (no cache)' : ''}`);

  // ---- 5. migrations ------------------------------------------------------
  // No HOST, entre o build e qualquer tráfego: falhou aqui = a lane velha
  // continua servindo e o banco não foi tocado por um container novo.
  next(5);
  const migrate = migrateInvocation();
  const migrated = runner(migrate.command, migrate.args, { cwd, inherit: true, timeoutMs: 600_000 });
  if (!migrated.ok) {
    return fail(
      `Migrations failed — nothing was switched, lane ${previous ?? '(none)'} keeps serving.\n` +
        `${migrated.stderr.trim()}`
    );
  }

  // ---- 6. edge da lane nova ----------------------------------------------
  next(6);
  const services = laneServices(cwd, target);
  const up = laneCompose(cwd, target, ['up', '-d', ...services.edge], runner, true);
  if (!up.ok) {
    dropTargetLane();
    return fail(`Lane ${target} did not start:\n${up.stderr.trim()}`);
  }

  // ---- 7. healthcheck -----------------------------------------------------
  next(7);
  const containers = laneContainers(cwd, target);
  for (const name of containers.edge) {
    const healthy = await waitForContainer(runner, name, isHealthy, {
      timeoutMs: timeout.edgeMs,
      intervalMs: timeout.intervalMs,
    });
    if (!healthy) {
      dropTargetLane();
      return fail(
        `${name} never became healthy — traffic NOT moved, ` +
          `lane ${previous ?? '(none)'} keeps serving.`
      );
    }
  }
  log(`  ✓ ${containers.edge.length} edge container(s) healthy`);

  // ---- 8. swap ------------------------------------------------------------
  next(8);
  writeUpstreams(cwd, target, record);
  const reloaded = reloadProxy(cwd, runner);
  if (!reloaded.ok) {
    const restarted = restartProxy(cwd, runner);
    if (!restarted.ok) {
      restoreUpstreams();
      dropTargetLane();
      return fail(
        `Proxy did not reload (${reloaded.stderr.trim() || reloaded.command}) — ` +
          `upstreams restored to lane ${previous ?? '(none)'}.`
      );
    }
    warn('  nginx -s reload failed; fell back to docker restart (connections dropped).');
  }
  log(`  ✓ traffic now on lane ${target}`);

  // ---- 9. dreno do worker antigo -----------------------------------------
  if (willDrain) {
    next(9);
    const oldWorkerService = laneServices(cwd, previous!).worker[0];
    const oldWorkerContainer = laneContainers(cwd, previous!).worker[0];
    if (oldWorkerService) {
      // SIGTERM + stop_grace_period (30s no compose): a fila termina o job em
      // mãos antes de morrer. `kill` direto abandonaria job em processamento.
      laneCompose(cwd, previous!, ['stop', oldWorkerService], runner, true);
      if (oldWorkerContainer) {
        await waitStopped(runner, oldWorkerContainer, {
          timeoutMs: timeout.stopMs,
          intervalMs: Math.min(1_000, timeout.intervalMs),
        });
      }
      log(`  ✓ worker of lane ${previous} drained`);
    }
  }

  // ---- 10. worker novo ----------------------------------------------------
  next(willDrain ? 10 : 9);
  const workerService = services.worker[0];
  if (workerService) {
    const upWorker = laneCompose(cwd, target, ['up', '-d', workerService], runner, true);
    if (!upWorker.ok) {
      warn(`  Worker of lane ${target} did not start: ${upWorker.stderr.trim()}`);
      warn('  The queue has no consumer until the next deploy — edge keeps serving.');
    } else {
      log(`  ✓ worker of lane ${target} up`);
    }
  }

  // ---- 11. derruba a lane antiga ------------------------------------------
  if (willDrain) {
    next(11);
    // NB: nunca `-v`. Okcms-storage é compartilhado entre blue e green —
    // derrubar o volume apagaria a mídia no meio do deploy.
    const downArgs = ['down', ...(choices.removeOrphans ? ['--remove-orphans'] : [])];
    const down = laneCompose(cwd, previous!, downArgs, runner, true);
    if (!down.ok) {
      warn(`  Lane ${previous} did not come down completely: ${down.stderr.trim()}`);
      warn('  Run it manually: docker compose -p okcms-' + previous + ' down');
    } else {
      log(`  ✓ lane ${previous} brought down${choices.removeOrphans ? ' (orphans removed)' : ''}`);
    }
  }

  // ---- 12. retire the simple stack ---------------------------------------
  if (simpleStack) {
    next(plan.length - 1);
    // SIGTERM + stop_grace_period (30s): the queue finishes the job in hand
    // before it dies. A plain `kill` would abandon a job in progress.
    appCompose(cwd, ['stop', 'worker'], runner, true);
    await waitStopped(runner, SIMPLE_WORKER_CONTAINER, {
      timeoutMs: timeout.stopMs,
      intervalMs: Math.min(1_000, timeout.intervalMs),
    });
    const downSimple = appCompose(cwd, ['down'], runner, true);
    if (!downSimple.ok) {
      warn(`  The simple stack did not come down cleanly: ${downSimple.stderr.trim()}`);
      warn('  Run it manually: docker compose -p okcms-app down');
    } else {
      log('  ✓ simple stack retired (containers removed, volumes kept)');
    }
  }

  // ---- 13. estado ---------------------------------------------------------
  next(plan.length);
  const state = pushLaneState(readLaneState(cwd), target, record['OKCMS_VERSION'] ?? 'latest');
  writeLaneState(cwd, state);

  const healthy = await probe(FINAL_HEALTH_URL);
  if (!healthy) {
    warn(
      `  Note: ${FINAL_HEALTH_URL} did not answer through the proxy after the swap.\n` +
        '  Containers are healthy (internal check); check Host/SERVER_NAME.'
    );
  }

  log(`\n  Deploy done: lane ${target} is live${previous ? ` (rollback: ${previous})` : ''}.`);
  if (created.length > 0) {
    log(`  Deploy files created: ${created.join(', ')}`);
  }
  log('  Proxy: http://<host>/  ·  Admin: http://<host>:8080/');

  return { ok: true, lane: target, previousLane: previous, created };
}
